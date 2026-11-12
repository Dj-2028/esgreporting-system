'use strict';

const bcrypt = require('bcrypt');
const env = require('../config/env');
const { ROLES, SYSTEM_USER_EMAIL } = require('../config/constants');
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
} = require('../models');

const SEED_ROLES = [
  {
    role_name: ROLES.ADMIN,
    role_description:
      'Sustainability lead / system owner — manages users, master data, periods, assignments',
  },
  {
    role_name: ROLES.DATA_OWNER,
    role_description: 'Enters KPI values, uploads evidence, and submits for approval',
  },
  {
    role_name: ROLES.APPROVER,
    role_description: 'Reviews KPI values and evidence, approves or rejects with remark',
  },
  {
    role_name: ROLES.VIEWER,
    role_description: 'Read-only access to dashboards, reports, and audit logs',
  },
];

const SEED_PILLARS = [
  {
    pillar_code: 'E',
    pillar_name: 'Environmental',
    pillar_description: 'Energy, emissions, water, waste, and biodiversity',
  },
  {
    pillar_code: 'S',
    pillar_name: 'Social',
    pillar_description: 'Workforce safety, diversity, training, human rights, and community',
  },
  {
    pillar_code: 'G',
    pillar_name: 'Governance',
    pillar_description: 'Board composition, ethics, anti-corruption, and compliance',
  },
  {
    pillar_code: 'GEN',
    pillar_name: 'General',
    pillar_description: 'General organizational context and cross-cutting disclosures',
  },
];

const SEED_STANDARDS = [
  {
    standard_code: 'GRI',
    standard_name: 'GRI Standards',
    version_label: 'GRI Standards 2021',
    issuing_body: 'Global Reporting Initiative',
  },
  {
    standard_code: 'IFRS-S1',
    standard_name: 'IFRS S1 General Requirements',
    version_label: 'IFRS S1 (2023)',
    issuing_body: 'International Sustainability Standards Board (ISSB)',
  },
  {
    standard_code: 'IFRS-S2',
    standard_name: 'IFRS S2 Climate-related Disclosures',
    version_label: 'IFRS S2 (2023)',
    issuing_body: 'International Sustainability Standards Board (ISSB)',
  },
  {
    standard_code: 'SASB',
    standard_name: 'SASB Standards',
    version_label: 'SASB 2023',
    issuing_body: 'IFRS Foundation / SASB',
  },
];

const SEED_GRI_DISCLOSURES = [
  {
    disclosure_code: 'GRI 2-9',
    disclosure_title: 'Governance structure and composition',
    disclosure_description: 'Governance structure, committees, and composition of the highest governance body',
    is_mandatory: true,
  },
  {
    disclosure_code: 'GRI 205-2',
    disclosure_title: 'Communication and training about anti-corruption policies and procedures',
    disclosure_description: 'Employees and governance body members communicated with and trained on anti-corruption',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 302-1',
    disclosure_title: 'Energy consumption within the organization',
    disclosure_description: 'Total fuel and electricity consumption within the organization',
    is_mandatory: true,
  },
  {
    disclosure_code: 'GRI 303-3',
    disclosure_title: 'Water withdrawal',
    disclosure_description: 'Total water withdrawal from all areas',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 305-1',
    disclosure_title: 'Direct (Scope 1) GHG emissions',
    disclosure_description: 'Gross direct (Scope 1) GHG emissions in metric tons of CO2 equivalent',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 305-2',
    disclosure_title: 'Energy indirect (Scope 2) GHG emissions',
    disclosure_description: 'Gross location-based energy indirect (Scope 2) GHG emissions in metric tons of CO2 equivalent',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 306-4',
    disclosure_title: 'Waste diverted from disposal',
    disclosure_description: 'Total weight or percentage of waste diverted from disposal by recovery operation',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 403-9',
    disclosure_title: 'Work-related injuries',
    disclosure_description: 'Number and rate of recordable work-related injuries',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 404-1',
    disclosure_title: 'Average hours of training per year per employee',
    disclosure_description: 'Average hours of training that the organization’s employees have undertaken during the reporting period',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 405-1',
    disclosure_title: 'Diversity of governance bodies and employees',
    disclosure_description: 'Percentage of individuals within governance bodies and employees in diversity categories',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 414-1',
    disclosure_title: 'New suppliers that were screened using social criteria',
    disclosure_description: 'Percentage of new suppliers that were screened using social criteria',
    is_mandatory: false,
  },
  {
    disclosure_code: 'GRI 418-1',
    disclosure_title: 'Substantiated complaints concerning breaches of customer privacy and losses of customer data',
    disclosure_description: 'Total number of substantiated complaints received concerning breaches of customer privacy',
    is_mandatory: false,
  },
];

const DEMO_KPIS = [
  {
    kpi_code: 'ENV-01',
    kpi_name: 'Total electricity consumed',
    pillar_code: 'E',
    unit_of_measurement: 'kWh',
    frequency: 'Quarterly',
    calculation_method: 'Sum of metered electricity consumption across all facilities from utility bills',
    disclosure_code: 'GRI 302-1',
  },
  {
    kpi_code: 'ENV-02',
    kpi_name: 'Scope 2 emissions',
    pillar_code: 'E',
    unit_of_measurement: 'tCO2e',
    frequency: 'Quarterly',
    calculation_method: 'Total electricity consumed (kWh) × grid emission factor / 1000',
    disclosure_code: 'GRI 305-2',
  },
  {
    kpi_code: 'ENV-03',
    kpi_name: 'Water withdrawn',
    pillar_code: 'E',
    unit_of_measurement: 'm³',
    frequency: 'Quarterly',
    calculation_method: 'Total municipal and groundwater withdrawal across sites',
    disclosure_code: 'GRI 303-3',
  },
  {
    kpi_code: 'ENV-04',
    kpi_name: 'Waste recycled',
    pillar_code: 'E',
    unit_of_measurement: '%',
    frequency: 'Annual',
    calculation_method: 'Recycled waste weight ÷ total waste generated × 100',
    disclosure_code: 'GRI 306-4',
  },
  {
    kpi_code: 'SOC-01',
    kpi_name: 'Lost-time injury rate',
    pillar_code: 'S',
    unit_of_measurement: 'rate',
    frequency: 'Quarterly',
    calculation_method: 'Lost-time injuries × 200,000 ÷ total hours worked',
    disclosure_code: 'GRI 403-9',
  },
  {
    kpi_code: 'SOC-02',
    kpi_name: 'Women in management',
    pillar_code: 'S',
    unit_of_measurement: '%',
    frequency: 'Annual',
    calculation_method: 'Female managers ÷ total managers × 100',
    disclosure_code: 'GRI 405-1',
  },
  {
    kpi_code: 'GOV-01',
    kpi_name: 'Independent board members',
    pillar_code: 'G',
    unit_of_measurement: '%',
    frequency: 'Annual',
    calculation_method: 'Independent directors ÷ total board members × 100',
    disclosure_code: 'GRI 2-9',
  },
  {
    kpi_code: 'GOV-02',
    kpi_name: 'Employees trained on anti-corruption',
    pillar_code: 'G',
    unit_of_measurement: '%',
    frequency: 'Annual',
    calculation_method: 'Employees completing training ÷ total active employees × 100',
    disclosure_code: 'GRI 205-2',
  },
];

/**
 * Idempotently seeds roles, pillars, standards, GRI disclosures, system user,
 * and (when `includeDemo = true`) the DEMO organisation and sample KPIs.
 */
async function seedReferenceData({ includeDemo = false } = {}) {
  // 1. Roles
  const roleMap = new Map();
  for (const r of SEED_ROLES) {
    const doc = await Role.findOneAndUpdate(
      { role_name: r.role_name },
      { $setOnInsert: { ...r, is_active: true } },
      { upsert: true, new: true },
    );
    roleMap.set(r.role_name, doc);
  }

  // 2. Pillars
  const pillarMap = new Map();
  for (const p of SEED_PILLARS) {
    const doc = await EsgPillar.findOneAndUpdate(
      { pillar_code: p.pillar_code },
      { $setOnInsert: { ...p, is_active: true } },
      { upsert: true, new: true },
    );
    pillarMap.set(p.pillar_code, doc);
  }

  // 3. Standards + link GRI to all pillars
  const standardMap = new Map();
  for (const s of SEED_STANDARDS) {
    const doc = await EsgStandard.findOneAndUpdate(
      { standard_code: s.standard_code },
      { $setOnInsert: { ...s, is_active: true } },
      { upsert: true, new: true },
    );
    standardMap.set(s.standard_code, doc);
  }

  const griStd = standardMap.get('GRI');
  for (const pillarDoc of pillarMap.values()) {
    await StandardPillar.findOneAndUpdate(
      { esg_standard_id: griStd._id, esg_pillar_id: pillarDoc._id },
      { $setOnInsert: { esg_standard_id: griStd._id, esg_pillar_id: pillarDoc._id } },
      { upsert: true, new: true },
    );
  }

  // 4. GRI Disclosures
  const disclosureMap = new Map();
  for (const d of SEED_GRI_DISCLOSURES) {
    const doc = await StandardDisclosure.findOneAndUpdate(
      { esg_standard_id: griStd._id, disclosure_code: d.disclosure_code },
      { $setOnInsert: { ...d, esg_standard_id: griStd._id } },
      { upsert: true, new: true },
    );
    disclosureMap.set(d.disclosure_code, doc);
  }

  // 5. System org + system user (`system@esg.local`, inactive login)
  const sysOrg = await Organization.findOneAndUpdate(
    { organization_code: 'SYSTEM' },
    { $setOnInsert: { organization_name: 'ESG System Internal', organization_code: 'SYSTEM', is_active: false } },
    { upsert: true, new: true },
  );
  const sysPassHash = await bcrypt.hash('SystemAccount#Disabled00', env.BCRYPT_COST);
  const systemUser = await AppUser.findOneAndUpdate(
    { email: SYSTEM_USER_EMAIL },
    {
      $setOnInsert: {
        organization_id: sysOrg._id,
        email: SYSTEM_USER_EMAIL,
        display_name: 'System Automation',
        password_hash: sysPassHash,
        is_active: false,
      },
    },
    { upsert: true, new: true },
  );

  let demo = null;
  if (includeDemo) {
    const demoOrg = await Organization.findOneAndUpdate(
      { organization_code: 'DEMO' },
      { $setOnInsert: { organization_name: 'Hosho Demo Corporation', organization_code: 'DEMO', is_active: true } },
      { upsert: true, new: true },
    );

    const opsDept = await Department.findOneAndUpdate(
      { organization_id: demoOrg._id, department_code: 'OPS' },
      { $setOnInsert: { organization_id: demoOrg._id, department_name: 'Operations & Facilities', department_code: 'OPS', is_active: true } },
      { upsert: true, new: true },
    );
    const susDept = await Department.findOneAndUpdate(
      { organization_id: demoOrg._id, department_code: 'SUS' },
      { $setOnInsert: { organization_id: demoOrg._id, department_name: 'Sustainability & Compliance', department_code: 'SUS', is_active: true } },
      { upsert: true, new: true },
    );
    const hrDept = await Department.findOneAndUpdate(
      { organization_id: demoOrg._id, department_code: 'HR' },
      { $setOnInsert: { organization_id: demoOrg._id, department_name: 'Human Resources', department_code: 'HR', is_active: true } },
      { upsert: true, new: true },
    );

    const demoPassHash = await bcrypt.hash('DemoPass123', env.BCRYPT_COST);
    const demoUsersSpec = [
      { email: 'admin@demo.esg', display_name: 'Asha Admin', role: ROLES.ADMIN, dept: susDept._id },
      { email: 'ravi@demo.esg', display_name: 'Ravi Owner', role: ROLES.DATA_OWNER, dept: opsDept._id },
      { email: 'meera@demo.esg', display_name: 'Meera Approver', role: ROLES.APPROVER, dept: susDept._id },
      { email: 'vikram@demo.esg', display_name: 'Vikram Viewer', role: ROLES.VIEWER, dept: hrDept._id },
    ];

    const demoUsers = {};
    for (const u of demoUsersSpec) {
      const userDoc = await AppUser.findOneAndUpdate(
        { email: u.email },
        {
          $setOnInsert: {
            organization_id: demoOrg._id,
            department_id: u.dept,
            email: u.email,
            display_name: u.display_name,
            password_hash: demoPassHash,
            must_change_password: false,
            is_active: true,
          },
        },
        { upsert: true, new: true },
      );
      const roleDoc = roleMap.get(u.role);
      await UserRole.findOneAndUpdate(
        { user_id: userDoc._id, role_id: roleDoc._id, is_active: true },
        {
          $setOnInsert: {
            user_id: userDoc._id,
            role_id: roleDoc._id,
            assigned_by_user_id: userDoc._id,
            is_active: true,
          },
        },
        { upsert: true, new: true },
      );
      demoUsers[u.role] = userDoc;
    }

    for (const k of DEMO_KPIS) {
      const pillarDoc = pillarMap.get(k.pillar_code);
      const kpiDoc = await Kpi.findOneAndUpdate(
        { organization_id: demoOrg._id, kpi_code: k.kpi_code },
        {
          $setOnInsert: {
            organization_id: demoOrg._id,
            esg_pillar_id: pillarDoc._id,
            kpi_code: k.kpi_code,
            kpi_name: k.kpi_name,
            unit_of_measurement: k.unit_of_measurement,
            calculation_method: k.calculation_method,
            frequency: k.frequency,
            is_active: true,
          },
        },
        { upsert: true, new: true },
      );
      const discDoc = disclosureMap.get(k.disclosure_code);
      if (discDoc) {
        await KpiStandardDisclosure.findOneAndUpdate(
          { kpi_id: kpiDoc._id, standard_disclosure_id: discDoc._id },
          { $setOnInsert: { kpi_id: kpiDoc._id, standard_disclosure_id: discDoc._id } },
          { upsert: true, new: true },
        );
      }
    }

    demo = { organization: demoOrg, users: demoUsers };
  }

  return {
    roles: roleMap,
    pillars: pillarMap,
    standards: standardMap,
    disclosures: disclosureMap,
    systemUser,
    demo,
  };
}

module.exports = { seedReferenceData };

