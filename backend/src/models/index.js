'use strict';

module.exports = {
  Organization: require('./organization.model'),
  Department: require('./department.model'),
  AppUser: require('./appUser.model'),
  Role: require('./role.model'),
  UserRole: require('./userRole.model'),
  EsgPillar: require('./esgPillar.model'),
  EsgStandard: require('./esgStandard.model'),
  StandardPillar: require('./standardPillar.model'),
  StandardDisclosure: require('./standardDisclosure.model'),
  Kpi: require('./kpi.model'),
  KpiStandardDisclosure: require('./kpiStandardDisclosure.model'),
  ReportingPeriod: require('./reportingPeriod.model'),
  KpiRecord: require('./kpiRecord.model'),
  Evidence: require('./evidence.model'),
  Approval: require('./approval.model'),
  AuditLog: require('./auditLog.model'),
  RefreshToken: require('./refreshToken.model'),
  PasswordResetToken: require('./passwordResetToken.model'),
};

