'use strict';

const bcrypt = require('bcrypt');
const env = require('../config/env');
const { ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const withTransaction = require('../utils/withTransaction');
const { parsePagination, buildMeta, searchRegex } = require('../utils/pagination');
const { randomToken } = require('../utils/hash');
const audit = require('./audit.service');
const notification = require('./notification.service');
const {
  Organization,
  Department,
  AppUser,
  Role,
  UserRole,
  EsgPillar,
  EsgStandard,
  StandardPillar,
  StandardDisclosure,
  Kpi,
  KpiStandardDisclosure,
  KpiRecord,
  RefreshToken,
} = require('../models');

// ---------------------------------------------------------------------------
// 7.2 Organisation
// ---------------------------------------------------------------------------

async function getCurrentOrganization(actor) {
  const org = await Organization.findById(actor.organization_id).lean();
  if (!org) throw ApiError.notFound('Organisation not found');
  return org;
}

async function updateCurrentOrganization(actor, body) {
  return withTransaction(async (session) => {
    const org = await Organization.findById(actor.organization_id).session(session);
    if (!org) throw ApiError.notFound('Organisation not found');

    const prev = org.toJSON();
    if (body.organization_name !== undefined) {
      org.organization_name = body.organization_name;
    }
    await org.save({ session });

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'organization',
      record_id: org._id,
      action_name: 'UPDATE',
      previous_value: prev,
      updated_value: org.toJSON(),
    });
    return org.toJSON();
  });
}

// ---------------------------------------------------------------------------
// 7.3 Departments
// ---------------------------------------------------------------------------

async function listDepartments(actor, query) {
  const { page, limit, skip, sort } = parsePagination(query, {
    defaultSort: 'department_code',
    allowedSort: ['department_code', 'department_name', 'created_at'],
  });
  const filter = { organization_id: actor.organization_id };
  if (query.is_active !== undefined) {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }
  const rx = searchRegex(query.q);
  if (rx) {
    filter.$or = [{ department_name: rx }, { department_code: rx }];
  }

  const [rows, total] = await Promise.all([
    Department.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Department.countDocuments(filter),
  ]);

  // Attach active user count per department for UI convenience (frontend.md §6.11)
  const deptIds = rows.map((r) => r._id);
  const counts = await AppUser.aggregate([
    {
      $match: {
        organization_id: actor.organization_id,
        department_id: { $in: deptIds },
        is_active: true,
      },
    },
    { $group: { _id: '$department_id', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = rows.map((r) => ({ ...r, active_users_count: countMap.get(String(r._id)) || 0 }));

  return { data, meta: buildMeta({ page, limit }, total) };
}

async function createDepartment(actor, body) {
  return withTransaction(async (session) => {
    const existing = await Department.findOne({
      organization_id: actor.organization_id,
      department_code: body.department_code,
    })
      .session(session)
      .lean();
    if (existing) {
      throw ApiError.conflict('DUPLICATE', 'Department code already exists in this organisation', [
        { field: 'department_code', message: 'Department code already exists' },
      ]);
    }

    const [dept] = await Department.create(
      [
        {
          organization_id: actor.organization_id,
          department_name: body.department_name,
          department_code: body.department_code,
          is_active: true,
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'department',
      record_id: dept._id,
      action_name: 'CREATE',
      updated_value: dept,
    });

    return dept.toJSON();
  });
}

async function getDepartment(actor, id) {
  const dept = await Department.findOne({
    _id: id,
    organization_id: actor.organization_id,
  }).lean();
  if (!dept) throw ApiError.notFound('Department not found');
  return dept;
}

async function updateDepartment(actor, id, body) {
  return withTransaction(async (session) => {
    const dept = await Department.findOne({
      _id: id,
      organization_id: actor.organization_id,
    }).session(session);
    if (!dept) throw ApiError.notFound('Department not found');

    const prev = dept.toJSON();
    let actionName = 'UPDATE';

    if (body.department_code !== undefined && body.department_code !== dept.department_code) {
      const dup = await Department.findOne({
        organization_id: actor.organization_id,
        department_code: body.department_code,
        _id: { $ne: dept._id },
      })
        .session(session)
        .lean();
      if (dup) {
        throw ApiError.conflict('DUPLICATE', 'Department code already exists', [
          { field: 'department_code', message: 'Department code already exists' },
        ]);
      }
      dept.department_code = body.department_code;
    }

    if (body.department_name !== undefined) {
      dept.department_name = body.department_name;
    }

    if (body.is_active !== undefined && body.is_active !== dept.is_active) {
      if (body.is_active === false) {
        const activeUsersCount = await AppUser.countDocuments({
          organization_id: actor.organization_id,
          department_id: dept._id,
          is_active: true,
        }).session(session);

        if (activeUsersCount > 0) {
          if (!body.reassign_to_department_id) {
            throw ApiError.conflict(
              'IN_USE',
              'Department has active users. Provide reassign_to_department_id to move them before deactivating',
            );
          }
          if (String(body.reassign_to_department_id) === String(dept._id)) {
            throw ApiError.badRequest(
              'VALIDATION_ERROR',
              'Cannot reassign users to the same department',
            );
          }
          const targetDept = await Department.findOne({
            _id: body.reassign_to_department_id,
            organization_id: actor.organization_id,
            is_active: true,
          })
            .session(session)
            .lean();
          if (!targetDept) {
            throw ApiError.notFound('Target department for reassignment not found');
          }
          await AppUser.updateMany(
            {
              organization_id: actor.organization_id,
              department_id: dept._id,
              is_active: true,
            },
            { $set: { department_id: targetDept._id } },
            { session },
          );
        }
        actionName = 'DEACTIVATE';
      } else {
        actionName = 'REACTIVATE';
      }
      dept.is_active = body.is_active;
    }

    await dept.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'department',
      record_id: dept._id,
      action_name: actionName,
      previous_value: prev,
      updated_value: dept.toJSON(),
    });

    return dept.toJSON();
  });
}

// ---------------------------------------------------------------------------
// 7.4 Users and Roles
// ---------------------------------------------------------------------------

async function getActiveAdminCount(organizationId, session = null) {
  const adminRole = await Role.findOne({ role_name: ROLES.ADMIN, is_active: true })
    .session(session)
    .lean();
  if (!adminRole) return 0;

  const activeUsers = await AppUser.find({
    organization_id: organizationId,
    is_active: true,
  })
    .select('_id')
    .session(session)
    .lean();
  const userIds = activeUsers.map((u) => u._id);

  return UserRole.countDocuments({
    user_id: { $in: userIds },
    role_id: adminRole._id,
    is_active: true,
  }).session(session);
}

async function attachRolesAndDepartments(users) {
  if (!users.length) return [];
  const userIds = users.map((u) => u._id);
  const deptIds = users.map((u) => u.department_id).filter(Boolean);

  const [userRoles, depts] = await Promise.all([
    UserRole.find({ user_id: { $in: userIds }, is_active: true })
      .populate('role_id')
      .populate('assigned_by_user_id', 'display_name email')
      .lean(),
    Department.find({ _id: { $in: deptIds } }).lean(),
  ]);

  const deptMap = new Map(depts.map((d) => [String(d._id), d]));
  const rolesByUser = new Map();
  for (const ur of userRoles) {
    if (!ur.role_id || !ur.role_id.is_active) continue;
    const key = String(ur.user_id);
    if (!rolesByUser.has(key)) rolesByUser.set(key, []);
    rolesByUser.get(key).push({
      user_role_id: String(ur._id),
      role_id: String(ur.role_id._id),
      role_name: ur.role_id.role_name,
      assigned_at: ur.assigned_at,
      assigned_by: ur.assigned_by_user_id
        ? {
            id: String(ur.assigned_by_user_id._id),
            display_name: ur.assigned_by_user_id.display_name,
          }
        : null,
    });
  }

  return users.map((u) => {
    const roleList = rolesByUser.get(String(u._id)) || [];
    const dept = u.department_id ? deptMap.get(String(u.department_id)) || null : null;
    return {
      ...u,
      id: String(u._id),
      department: dept
        ? {
            id: String(dept._id),
            department_name: dept.department_name,
            department_code: dept.department_code,
          }
        : null,
      roles: roleList.map((r) => r.role_name),
      role_assignments: roleList,
    };
  });
}

async function listUsers(actor, query) {
  const isAdminOrViewer =
    actor.roles.includes(ROLES.ADMIN) || actor.roles.includes(ROLES.VIEWER);
  const isAssignmentPicker = query.for === 'assignment';

  if (!isAdminOrViewer && !isAssignmentPicker) {
    throw ApiError.forbidden('FORBIDDEN', 'You do not have permission to view users');
  }

  const { page, limit, skip, sort } = parsePagination(query, {
    defaultSort: 'display_name',
    allowedSort: ['display_name', 'email', 'created_at', 'last_login_at'],
  });

  const filter = { organization_id: actor.organization_id };
  if (query.is_active !== undefined) {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  } else if (isAssignmentPicker) {
    filter.is_active = true;
  }
  if (query.department_id) {
    filter.department_id = query.department_id;
  }
  const rx = searchRegex(query.q);
  if (rx) {
    filter.$or = [{ display_name: rx }, { email: rx }];
  }

  if (query.role) {
    const roleDoc = await Role.findOne({ role_name: query.role, is_active: true }).lean();
    if (!roleDoc) {
      return { data: [], meta: buildMeta({ page, limit }, 0) };
    }
    const urRows = await UserRole.find({ role_id: roleDoc._id, is_active: true })
      .select('user_id')
      .lean();
    filter._id = { $in: urRows.map((r) => r.user_id) };
  }

  const [rows, total] = await Promise.all([
    AppUser.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    AppUser.countDocuments(filter),
  ]);

  const enriched = await attachRolesAndDepartments(rows);

  if (!isAdminOrViewer && isAssignmentPicker) {
    return {
      data: enriched.map((u) => ({
        id: u.id,
        _id: u._id,
        display_name: u.display_name,
        department: u.department,
        roles: u.roles,
      })),
      meta: buildMeta({ page, limit }, total),
    };
  }

  return { data: enriched, meta: buildMeta({ page, limit }, total) };
}

function generateTempPassword() {
  // Meets policy: >=10 chars, upper, lower, digit
  return `Esg#${randomToken(9)}9aA`;
}

async function createUser(actor, body) {
  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, env.BCRYPT_COST);

  const created = await withTransaction(async (session) => {
    const existing = await AppUser.findOne({ email: body.email }).session(session).lean();
    if (existing) {
      throw ApiError.conflict('DUPLICATE', 'Email already registered', [
        { field: 'email', message: 'Email is already in use' },
      ]);
    }

    if (body.department_id) {
      const dept = await Department.findOne({
        _id: body.department_id,
        organization_id: actor.organization_id,
        is_active: true,
      })
        .session(session)
        .lean();
      if (!dept) {
        throw ApiError.notFound('Department not found in your organisation');
      }
    }

    const uniqueRoleIds = [...new Set(body.role_ids)];
    const roleDocs = await Role.find({
      _id: { $in: uniqueRoleIds },
      is_active: true,
    })
      .session(session)
      .lean();
    if (roleDocs.length !== uniqueRoleIds.length) {
      throw ApiError.badRequest('VALIDATION_ERROR', 'One or more role_ids are invalid');
    }

    const [user] = await AppUser.create(
      [
        {
          organization_id: actor.organization_id,
          department_id: body.department_id || null,
          email: body.email,
          display_name: body.display_name,
          password_hash,
          must_change_password: true,
          is_active: true,
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'app_user',
      record_id: user._id,
      action_name: 'CREATE',
      updated_value: user,
    });

    for (const r of roleDocs) {
      const [ur] = await UserRole.create(
        [
          {
            user_id: user._id,
            role_id: r._id,
            assigned_by_user_id: actor._id,
            is_active: true,
          },
        ],
        { session },
      );
      await audit.log({
        session,
        user_id: actor.id,
        organization_id: actor.organization_id,
        entity_name: 'user_role',
        record_id: ur._id,
        action_name: 'ASSIGN_ROLE',
        updated_value: { user_id: user._id, role_id: r._id, role_name: r.role_name },
      });
    }

    return user.toObject();
  });

  await notification.sendAccountCreatedEmail({
    email: created.email,
    display_name: created.display_name,
    tempPassword,
  });

  const [enriched] = await attachRolesAndDepartments([created]);
  return enriched;
}

async function getUser(actor, id) {
  const user = await AppUser.findOne({
    _id: id,
    organization_id: actor.organization_id,
  }).lean();
  if (!user) throw ApiError.notFound('User not found');
  const [enriched] = await attachRolesAndDepartments([user]);
  return enriched;
}

async function updateUser(actor, id, body) {
  const updated = await withTransaction(async (session) => {
    const user = await AppUser.findOne({
      _id: id,
      organization_id: actor.organization_id,
    }).session(session);
    if (!user) throw ApiError.notFound('User not found');

    const prev = user.toJSON();
    let actionName = 'UPDATE';

    if (body.display_name !== undefined) {
      user.display_name = body.display_name;
    }

    if (body.department_id !== undefined) {
      if (body.department_id === null) {
        user.department_id = null;
      } else {
        const dept = await Department.findOne({
          _id: body.department_id,
          organization_id: actor.organization_id,
          is_active: true,
        })
          .session(session)
          .lean();
        if (!dept) throw ApiError.notFound('Department not found');
        user.department_id = dept._id;
      }
    }

    if (body.is_active !== undefined && body.is_active !== user.is_active) {
      if (body.is_active === false) {
        // Check if this user holds an active Admin role and is the last active Admin
        const adminRole = await Role.findOne({ role_name: ROLES.ADMIN }).session(session).lean();
        if (adminRole) {
          const holdsAdmin = await UserRole.findOne({
            user_id: user._id,
            role_id: adminRole._id,
            is_active: true,
          })
            .session(session)
            .lean();
          if (holdsAdmin) {
            const adminCount = await getActiveAdminCount(actor.organization_id, session);
            if (adminCount <= 1) {
              throw ApiError.conflict(
                'IN_USE',
                'Cannot deactivate the last active Admin of the organisation',
              );
            }
          }
        }
        await RefreshToken.updateMany(
          { user_id: user._id, revoked_at: null },
          { $set: { revoked_at: new Date() } },
          { session },
        );
        actionName = 'DEACTIVATE';
      } else {
        actionName = 'REACTIVATE';
      }
      user.is_active = body.is_active;
    }

    await user.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'app_user',
      record_id: user._id,
      action_name: actionName,
      previous_value: prev,
      updated_value: user.toJSON(),
    });

    return user.toObject();
  });

  const [enriched] = await attachRolesAndDepartments([updated]);
  return enriched;
}

async function assignRole(actor, userId, { role_id }) {
  return withTransaction(async (session) => {
    const user = await AppUser.findOne({
      _id: userId,
      organization_id: actor.organization_id,
    })
      .session(session)
      .lean();
    if (!user) throw ApiError.notFound('User not found');

    const role = await Role.findOne({ _id: role_id, is_active: true }).session(session).lean();
    if (!role) throw ApiError.notFound('Role not found');

    const existing = await UserRole.findOne({
      user_id: user._id,
      role_id: role._id,
      is_active: true,
    })
      .session(session)
      .lean();
    if (existing) {
      throw ApiError.conflict('DUPLICATE', 'User already holds this active role');
    }

    const [ur] = await UserRole.create(
      [
        {
          user_id: user._id,
          role_id: role._id,
          assigned_by_user_id: actor._id,
          is_active: true,
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'user_role',
      record_id: ur._id,
      action_name: 'ASSIGN_ROLE',
      updated_value: { user_id: user._id, role_id: role._id, role_name: role.role_name },
    });

    return {
      user_role_id: String(ur._id),
      user_id: String(user._id),
      role_id: String(role._id),
      role_name: role.role_name,
      assigned_by_user_id: String(actor._id),
      assigned_at: ur.assigned_at,
      is_active: true,
    };
  });
}

async function revokeRole(actor, userId, userRoleId) {
  return withTransaction(async (session) => {
    const user = await AppUser.findOne({
      _id: userId,
      organization_id: actor.organization_id,
    })
      .session(session)
      .lean();
    if (!user) throw ApiError.notFound('User not found');

    const ur = await UserRole.findOne({
      _id: userRoleId,
      user_id: user._id,
      is_active: true,
    })
      .populate('role_id')
      .session(session);
    if (!ur) throw ApiError.notFound('Active role assignment not found');

    if (ur.role_id && ur.role_id.role_name === ROLES.ADMIN && user.is_active) {
      const adminCount = await getActiveAdminCount(actor.organization_id, session);
      if (adminCount <= 1) {
        throw ApiError.conflict(
          'IN_USE',
          'Cannot remove the last active Admin of an organisation',
        );
      }
    }

    ur.is_active = false;
    await ur.save({ session });

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'user_role',
      record_id: ur._id,
      action_name: 'REVOKE_ROLE',
      previous_value: { is_active: true, role_name: ur.role_id ? ur.role_id.role_name : null },
      updated_value: { is_active: false },
    });
  });
}

async function listRoles() {
  return Role.find({ is_active: true }).sort({ role_name: 1 }).lean();
}

// ---------------------------------------------------------------------------
// 7.5 Pillars, Standards, Disclosures
// ---------------------------------------------------------------------------

async function listPillars() {
  return EsgPillar.find().sort({ pillar_code: 1 }).lean();
}

async function updatePillar(actor, id, body) {
  return withTransaction(async (session) => {
    const pillar = await EsgPillar.findById(id).session(session);
    if (!pillar) throw ApiError.notFound('Pillar not found');

    const prev = pillar.toJSON();
    let actionName = 'UPDATE';
    if (body.pillar_description !== undefined) {
      pillar.pillar_description = body.pillar_description;
    }
    if (body.is_active !== undefined && body.is_active !== pillar.is_active) {
      actionName = body.is_active ? 'REACTIVATE' : 'DEACTIVATE';
      pillar.is_active = body.is_active;
    }

    await pillar.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'esg_pillar',
      record_id: pillar._id,
      action_name: actionName,
      previous_value: prev,
      updated_value: pillar.toJSON(),
    });
    return pillar.toJSON();
  });
}

async function listStandards(query = {}) {
  const filter = {};
  if (query.is_active !== undefined) {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }
  const rx = searchRegex(query.q);
  if (rx) {
    filter.$or = [{ standard_code: rx }, { standard_name: rx }, { version_label: rx }];
  }

  const standards = await EsgStandard.find(filter).sort({ standard_code: 1 }).lean();
  const stdIds = standards.map((s) => s._id);

  const links = await StandardPillar.find({ esg_standard_id: { $in: stdIds } })
    .populate('esg_pillar_id')
    .lean();

  const pillarsByStd = new Map();
  for (const link of links) {
    if (!link.esg_pillar_id) continue;
    const key = String(link.esg_standard_id);
    if (!pillarsByStd.has(key)) pillarsByStd.set(key, []);
    pillarsByStd.get(key).push({
      id: String(link.esg_pillar_id._id),
      pillar_code: link.esg_pillar_id.pillar_code,
      pillar_name: link.esg_pillar_id.pillar_name,
    });
  }

  return standards.map((s) => {
    const pList = pillarsByStd.get(String(s._id)) || [];
    return {
      ...s,
      pillars: pList,
      pillar_codes: pList.map((p) => p.pillar_code),
    };
  });
}

async function createStandard(actor, body) {
  return withTransaction(async (session) => {
    const existing = await EsgStandard.findOne({ standard_code: body.standard_code })
      .session(session)
      .lean();
    if (existing) {
      throw ApiError.conflict('DUPLICATE', 'Standard code already exists', [
        { field: 'standard_code', message: 'Standard code already exists' },
      ]);
    }

    const [std] = await EsgStandard.create(
      [
        {
          standard_code: body.standard_code,
          standard_name: body.standard_name,
          version_label: body.version_label,
          issuing_body: body.issuing_body || '',
          is_active: true,
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'esg_standard',
      record_id: std._id,
      action_name: 'CREATE',
      updated_value: std,
    });

    return { ...std.toJSON(), pillars: [], pillar_codes: [] };
  });
}

async function updateStandard(actor, id, body) {
  return withTransaction(async (session) => {
    const std = await EsgStandard.findById(id).session(session);
    if (!std) throw ApiError.notFound('Standard not found');

    const prev = std.toJSON();
    let actionName = 'UPDATE';
    if (body.standard_name !== undefined) std.standard_name = body.standard_name;
    if (body.version_label !== undefined) std.version_label = body.version_label;
    if (body.issuing_body !== undefined) std.issuing_body = body.issuing_body;
    if (body.is_active !== undefined && body.is_active !== std.is_active) {
      actionName = body.is_active ? 'REACTIVATE' : 'DEACTIVATE';
      std.is_active = body.is_active;
    }

    await std.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'esg_standard',
      record_id: std._id,
      action_name: actionName,
      previous_value: prev,
      updated_value: std.toJSON(),
    });

    return std.toJSON();
  });
}

async function replaceStandardPillars(actor, standardId, { esg_pillar_ids }) {
  return withTransaction(async (session) => {
    const std = await EsgStandard.findById(standardId).session(session).lean();
    if (!std) throw ApiError.notFound('Standard not found');

    const uniqueIds = [...new Set(esg_pillar_ids)];
    const pillars = await EsgPillar.find({ _id: { $in: uniqueIds } }).session(session).lean();
    if (pillars.length !== uniqueIds.length) {
      throw ApiError.badRequest('VALIDATION_ERROR', 'One or more pillar IDs are invalid');
    }

    const prevLinks = await StandardPillar.find({ esg_standard_id: std._id })
      .session(session)
      .lean();
    await StandardPillar.deleteMany({ esg_standard_id: std._id }).session(session);

    if (uniqueIds.length) {
      await StandardPillar.insertMany(
        uniqueIds.map((pid) => ({ esg_standard_id: std._id, esg_pillar_id: pid })),
        { session },
      );
    }

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'standard_pillar',
      record_id: std._id,
      action_name: 'UPDATE',
      previous_value: prevLinks.map((l) => l.esg_pillar_id),
      updated_value: uniqueIds,
    });

    return {
      esg_standard_id: String(std._id),
      pillars: pillars.map((p) => ({
        id: String(p._id),
        pillar_code: p.pillar_code,
        pillar_name: p.pillar_name,
      })),
    };
  });
}

async function listDisclosures(actor, standardId, query = {}) {
  const std = await EsgStandard.findById(standardId).lean();
  if (!std) throw ApiError.notFound('Standard not found');

  const { page, limit, skip, sort } = parsePagination(query, {
    defaultSort: 'disclosure_code',
    allowedSort: ['disclosure_code', 'disclosure_title'],
  });

  const filter = { esg_standard_id: std._id };
  const rx = searchRegex(query.q);
  if (rx) {
    filter.$or = [{ disclosure_code: rx }, { disclosure_title: rx }];
  }

  const [rows, total] = await Promise.all([
    StandardDisclosure.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    StandardDisclosure.countDocuments(filter),
  ]);

  // Count how many KPIs (in caller's org, and globally for delete button check) are mapped
  const discIds = rows.map((r) => r._id);
  const orgKpis = await Kpi.find({ organization_id: actor.organization_id })
    .select('_id')
    .lean();
  const orgKpiIds = orgKpis.map((k) => k._id);

  const [orgMappings, globalMappings] = await Promise.all([
    KpiStandardDisclosure.aggregate([
      {
        $match: {
          standard_disclosure_id: { $in: discIds },
          kpi_id: { $in: orgKpiIds },
        },
      },
      { $group: { _id: '$standard_disclosure_id', count: { $sum: 1 } } },
    ]),
    KpiStandardDisclosure.aggregate([
      { $match: { standard_disclosure_id: { $in: discIds } } },
      { $group: { _id: '$standard_disclosure_id', count: { $sum: 1 } } },
    ]),
  ]);

  const orgMap = new Map(orgMappings.map((m) => [String(m._id), m.count]));
  const globalMap = new Map(globalMappings.map((m) => [String(m._id), m.count]));

  const data = rows.map((r) => ({
    ...r,
    mapped_kpis_count: orgMap.get(String(r._id)) || 0,
    global_mapped_kpis_count: globalMap.get(String(r._id)) || 0,
  }));

  return { data, meta: buildMeta({ page, limit }, total) };
}

async function createDisclosure(actor, standardId, body) {
  return withTransaction(async (session) => {
    const std = await EsgStandard.findById(standardId).session(session).lean();
    if (!std) throw ApiError.notFound('Standard not found');

    const existing = await StandardDisclosure.findOne({
      esg_standard_id: std._id,
      disclosure_code: body.disclosure_code,
    })
      .session(session)
      .lean();
    if (existing) {
      throw ApiError.conflict('DUPLICATE', 'Disclosure code already exists in this standard', [
        { field: 'disclosure_code', message: 'Disclosure code already exists' },
      ]);
    }

    const [disc] = await StandardDisclosure.create(
      [
        {
          esg_standard_id: std._id,
          disclosure_code: body.disclosure_code,
          disclosure_title: body.disclosure_title,
          disclosure_description: body.disclosure_description || '',
          is_mandatory: Boolean(body.is_mandatory),
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'standard_disclosure',
      record_id: disc._id,
      action_name: 'CREATE',
      updated_value: disc,
    });

    return disc.toJSON();
  });
}

async function updateDisclosure(actor, id, body) {
  return withTransaction(async (session) => {
    const disc = await StandardDisclosure.findById(id).session(session);
    if (!disc) throw ApiError.notFound('Disclosure not found');

    const prev = disc.toJSON();

    if (body.disclosure_code !== undefined && body.disclosure_code !== disc.disclosure_code) {
      const mappedCount = await KpiStandardDisclosure.countDocuments({
        standard_disclosure_id: disc._id,
      }).session(session);
      if (mappedCount > 0) {
        throw ApiError.conflict(
          'IN_USE',
          'Disclosure code cannot be changed while mapped to a KPI',
        );
      }
      const dup = await StandardDisclosure.findOne({
        esg_standard_id: disc.esg_standard_id,
        disclosure_code: body.disclosure_code,
        _id: { $ne: disc._id },
      })
        .session(session)
        .lean();
      if (dup) {
        throw ApiError.conflict('DUPLICATE', 'Disclosure code already exists in this standard', [
          { field: 'disclosure_code', message: 'Disclosure code already exists' },
        ]);
      }
      disc.disclosure_code = body.disclosure_code;
    }

    if (body.disclosure_title !== undefined) disc.disclosure_title = body.disclosure_title;
    if (body.disclosure_description !== undefined) {
      disc.disclosure_description = body.disclosure_description;
    }
    if (body.is_mandatory !== undefined) disc.is_mandatory = body.is_mandatory;

    await disc.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'standard_disclosure',
      record_id: disc._id,
      action_name: 'UPDATE',
      previous_value: prev,
      updated_value: disc.toJSON(),
    });

    return disc.toJSON();
  });
}

async function deleteDisclosure(actor, id) {
  return withTransaction(async (session) => {
    const disc = await StandardDisclosure.findById(id).session(session);
    if (!disc) throw ApiError.notFound('Disclosure not found');

    const mappedCount = await KpiStandardDisclosure.countDocuments({
      standard_disclosure_id: disc._id,
    }).session(session);
    if (mappedCount > 0) {
      throw ApiError.conflict(
        'IN_USE',
        'Disclosure cannot be deleted while mapped to one or more KPIs',
      );
    }

    const prev = disc.toJSON();
    await StandardDisclosure.deleteOne({ _id: disc._id }).session(session);

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'standard_disclosure',
      record_id: disc._id,
      action_name: 'DEACTIVATE',
      previous_value: prev,
      updated_value: null,
    });
  });
}

// ---------------------------------------------------------------------------
// 7.6 KPIs
// ---------------------------------------------------------------------------

async function enrichKpis(kpis) {
  if (!kpis.length) return [];
  const kpiIds = kpis.map((k) => k._id);
  const pillarIds = [...new Set(kpis.map((k) => String(k.esg_pillar_id)))];

  const [pillars, mappings, recordCounts] = await Promise.all([
    EsgPillar.find({ _id: { $in: pillarIds } }).lean(),
    KpiStandardDisclosure.find({ kpi_id: { $in: kpiIds } })
      .populate({
        path: 'standard_disclosure_id',
        populate: { path: 'esg_standard_id', select: 'standard_code standard_name version_label' },
      })
      .lean(),
    KpiRecord.aggregate([
      { $match: { kpi_id: { $in: kpiIds } } },
      { $group: { _id: '$kpi_id', count: { $sum: 1 } } },
    ]),
  ]);

  const pillarMap = new Map(pillars.map((p) => [String(p._id), p]));
  const recCountMap = new Map(recordCounts.map((r) => [String(r._id), r.count]));
  const discByKpi = new Map();

  for (const m of mappings) {
    const d = m.standard_disclosure_id;
    if (!d) continue;
    const key = String(m.kpi_id);
    if (!discByKpi.has(key)) discByKpi.set(key, []);
    discByKpi.get(key).push({
      id: String(d._id),
      _id: d._id,
      disclosure_code: d.disclosure_code,
      disclosure_title: d.disclosure_title,
      is_mandatory: d.is_mandatory,
      standard_code: d.esg_standard_id ? d.esg_standard_id.standard_code : null,
    });
  }

  return kpis.map((k) => {
    const pillar = pillarMap.get(String(k.esg_pillar_id)) || null;
    const disclosures = discByKpi.get(String(k._id)) || [];
    const recordsCount = recCountMap.get(String(k._id)) || 0;
    return {
      ...k,
      pillar: pillar
        ? {
            id: String(pillar._id),
            pillar_code: pillar.pillar_code,
            pillar_name: pillar.pillar_name,
          }
        : null,
      disclosures,
      records_count: recordsCount,
      has_records: recordsCount > 0,
    };
  });
}

async function listKpis(actor, query = {}) {
  const { page, limit, skip, sort } = parsePagination(query, {
    defaultSort: 'kpi_code',
    allowedSort: ['kpi_code', 'kpi_name', 'created_at'],
  });

  const filter = { organization_id: actor.organization_id };
  if (query.esg_pillar_id) filter.esg_pillar_id = query.esg_pillar_id;
  if (query.is_active !== undefined) {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }
  const rx = searchRegex(query.q);
  if (rx) {
    filter.$or = [{ kpi_code: rx }, { kpi_name: rx }];
  }

  if (query.standard_disclosure_id) {
    const mapped = await KpiStandardDisclosure.find({
      standard_disclosure_id: query.standard_disclosure_id,
    })
      .select('kpi_id')
      .lean();
    filter._id = { $in: mapped.map((m) => m.kpi_id) };
  }

  const [rows, total] = await Promise.all([
    Kpi.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Kpi.countDocuments(filter),
  ]);

  const data = await enrichKpis(rows);
  return { data, meta: buildMeta({ page, limit }, total) };
}

async function createKpi(actor, body) {
  const created = await withTransaction(async (session) => {
    const pillar = await EsgPillar.findOne({ _id: body.esg_pillar_id, is_active: true })
      .session(session)
      .lean();
    if (!pillar) throw ApiError.notFound('ESG pillar not found');

    const dup = await Kpi.findOne({
      organization_id: actor.organization_id,
      kpi_code: body.kpi_code,
    })
      .session(session)
      .lean();
    if (dup) {
      throw ApiError.conflict('DUPLICATE', 'KPI code already exists in this organisation', [
        { field: 'kpi_code', message: 'KPI code already exists' },
      ]);
    }

    const uniqueDiscIds = [...new Set(body.standard_disclosure_ids || [])];
    if (uniqueDiscIds.length) {
      const discs = await StandardDisclosure.find({ _id: { $in: uniqueDiscIds } })
        .session(session)
        .lean();
      if (discs.length !== uniqueDiscIds.length) {
        throw ApiError.badRequest('VALIDATION_ERROR', 'One or more disclosure IDs are invalid');
      }
    }

    const [kpi] = await Kpi.create(
      [
        {
          organization_id: actor.organization_id,
          esg_pillar_id: pillar._id,
          kpi_code: body.kpi_code,
          kpi_name: body.kpi_name,
          unit_of_measurement: body.unit_of_measurement,
          calculation_method: body.calculation_method || '',
          frequency: body.frequency || 'Annual',
          is_active: true,
        },
      ],
      { session },
    );

    if (uniqueDiscIds.length) {
      await KpiStandardDisclosure.insertMany(
        uniqueDiscIds.map((did) => ({ kpi_id: kpi._id, standard_disclosure_id: did })),
        { session },
      );
    }

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'kpi',
      record_id: kpi._id,
      action_name: 'CREATE',
      updated_value: { ...kpi.toJSON(), standard_disclosure_ids: uniqueDiscIds },
    });

    return kpi.toObject();
  });

  const [enriched] = await enrichKpis([created]);
  return enriched;
}

async function getKpi(actor, id) {
  const kpi = await Kpi.findOne({
    _id: id,
    organization_id: actor.organization_id,
  }).lean();
  if (!kpi) throw ApiError.notFound('KPI not found');
  const [enriched] = await enrichKpis([kpi]);
  return enriched;
}

async function updateKpi(actor, id, body) {
  const updated = await withTransaction(async (session) => {
    const kpi = await Kpi.findOne({
      _id: id,
      organization_id: actor.organization_id,
    }).session(session);
    if (!kpi) throw ApiError.notFound('KPI not found');

    const prev = kpi.toJSON();
    let actionName = 'UPDATE';
    const hasRecords =
      (await KpiRecord.countDocuments({ kpi_id: kpi._id }).session(session)) > 0;

    if (body.kpi_code !== undefined && body.kpi_code !== kpi.kpi_code) {
      if (hasRecords) {
        throw ApiError.conflict(
          'IN_USE',
          'KPI code cannot be changed after records have been created for this KPI',
        );
      }
      const dup = await Kpi.findOne({
        organization_id: actor.organization_id,
        kpi_code: body.kpi_code,
        _id: { $ne: kpi._id },
      })
        .session(session)
        .lean();
      if (dup) {
        throw ApiError.conflict('DUPLICATE', 'KPI code already exists', [
          { field: 'kpi_code', message: 'KPI code already exists' },
        ]);
      }
      kpi.kpi_code = body.kpi_code;
    }

    if (
      body.unit_of_measurement !== undefined &&
      body.unit_of_measurement !== kpi.unit_of_measurement
    ) {
      if (hasRecords) {
        throw ApiError.conflict(
          'IN_USE',
          'Unit of measurement cannot be changed once the KPI has any record',
        );
      }
      kpi.unit_of_measurement = body.unit_of_measurement;
    }

    if (body.esg_pillar_id !== undefined) {
      const pillar = await EsgPillar.findOne({ _id: body.esg_pillar_id, is_active: true })
        .session(session)
        .lean();
      if (!pillar) throw ApiError.notFound('ESG pillar not found');
      kpi.esg_pillar_id = pillar._id;
    }

    if (body.kpi_name !== undefined) kpi.kpi_name = body.kpi_name;
    if (body.calculation_method !== undefined) kpi.calculation_method = body.calculation_method;
    if (body.frequency !== undefined) kpi.frequency = body.frequency;
    if (body.is_active !== undefined && body.is_active !== kpi.is_active) {
      actionName = body.is_active ? 'REACTIVATE' : 'DEACTIVATE';
      kpi.is_active = body.is_active;
    }

    await kpi.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'kpi',
      record_id: kpi._id,
      action_name: actionName,
      previous_value: prev,
      updated_value: kpi.toJSON(),
    });

    return kpi.toObject();
  });

  const [enriched] = await enrichKpis([updated]);
  return enriched;
}

async function replaceKpiDisclosures(actor, kpiId, { standard_disclosure_ids }) {
  const updated = await withTransaction(async (session) => {
    const kpi = await Kpi.findOne({
      _id: kpiId,
      organization_id: actor.organization_id,
    })
      .session(session)
      .lean();
    if (!kpi) throw ApiError.notFound('KPI not found');

    const uniqueIds = [...new Set(standard_disclosure_ids)];
    if (uniqueIds.length) {
      const discs = await StandardDisclosure.find({ _id: { $in: uniqueIds } })
        .session(session)
        .lean();
      if (discs.length !== uniqueIds.length) {
        throw ApiError.badRequest('VALIDATION_ERROR', 'One or more disclosure IDs are invalid');
      }
    }

    const prevLinks = await KpiStandardDisclosure.find({ kpi_id: kpi._id })
      .session(session)
      .lean();
    await KpiStandardDisclosure.deleteMany({ kpi_id: kpi._id }).session(session);

    if (uniqueIds.length) {
      await KpiStandardDisclosure.insertMany(
        uniqueIds.map((did) => ({ kpi_id: kpi._id, standard_disclosure_id: did })),
        { session },
      );
    }

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'kpi_standard_disclosure',
      record_id: kpi._id,
      action_name: 'UPDATE',
      previous_value: prevLinks.map((l) => l.standard_disclosure_id),
      updated_value: uniqueIds,
    });

    return kpi;
  });

  const [enriched] = await enrichKpis([updated]);
  return enriched;
}

module.exports = {
  getCurrentOrganization,
  updateCurrentOrganization,
  listDepartments,
  createDepartment,
  getDepartment,
  updateDepartment,
  listUsers,
  createUser,
  getUser,
  updateUser,
  assignRole,
  revokeRole,
  listRoles,
  listPillars,
  updatePillar,
  listStandards,
  createStandard,
  updateStandard,
  replaceStandardPillars,
  listDisclosures,
  createDisclosure,
  updateDisclosure,
  deleteDisclosure,
  listKpis,
  createKpi,
  getKpi,
  updateKpi,
  replaceKpiDisclosures,
};

