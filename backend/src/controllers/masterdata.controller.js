'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, list, noContent } = require('../utils/respond');
const masterdataService = require('../services/masterdata.service');

// Organisation
const getCurrentOrganization = asyncHandler(async (req, res) => {
  const data = await masterdataService.getCurrentOrganization(req.user);
  return ok(res, data);
});

const updateCurrentOrganization = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateCurrentOrganization(req.user, req.body);
  return ok(res, data);
});

// Departments
const listDepartments = asyncHandler(async (req, res) => {
  const { data, meta } = await masterdataService.listDepartments(req.user, req.query);
  return list(res, data, meta);
});

const createDepartment = asyncHandler(async (req, res) => {
  const data = await masterdataService.createDepartment(req.user, req.body);
  return created(res, data);
});

const getDepartment = asyncHandler(async (req, res) => {
  const data = await masterdataService.getDepartment(req.user, req.params.id);
  return ok(res, data);
});

const updateDepartment = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateDepartment(req.user, req.params.id, req.body);
  return ok(res, data);
});

// Users & Roles
const listUsers = asyncHandler(async (req, res) => {
  const { data, meta } = await masterdataService.listUsers(req.user, req.query);
  return list(res, data, meta);
});

const createUser = asyncHandler(async (req, res) => {
  const data = await masterdataService.createUser(req.user, req.body);
  return created(res, data);
});

const getUser = asyncHandler(async (req, res) => {
  const data = await masterdataService.getUser(req.user, req.params.id);
  return ok(res, data);
});

const updateUser = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateUser(req.user, req.params.id, req.body);
  return ok(res, data);
});

const assignRole = asyncHandler(async (req, res) => {
  const data = await masterdataService.assignRole(req.user, req.params.id, req.body);
  return created(res, data);
});

const revokeRole = asyncHandler(async (req, res) => {
  await masterdataService.revokeRole(req.user, req.params.id, req.params.user_role_id);
  return noContent(res);
});

const listRoles = asyncHandler(async (_req, res) => {
  const data = await masterdataService.listRoles();
  return ok(res, data);
});

// Pillars, Standards, Disclosures
const listPillars = asyncHandler(async (_req, res) => {
  const data = await masterdataService.listPillars();
  return ok(res, data);
});

const updatePillar = asyncHandler(async (req, res) => {
  const data = await masterdataService.updatePillar(req.user, req.params.id, req.body);
  return ok(res, data);
});

const listStandards = asyncHandler(async (req, res) => {
  const data = await masterdataService.listStandards(req.query);
  return ok(res, data);
});

const createStandard = asyncHandler(async (req, res) => {
  const data = await masterdataService.createStandard(req.user, req.body);
  return created(res, data);
});

const updateStandard = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateStandard(req.user, req.params.id, req.body);
  return ok(res, data);
});

const replaceStandardPillars = asyncHandler(async (req, res) => {
  const data = await masterdataService.replaceStandardPillars(req.user, req.params.id, req.body);
  return ok(res, data);
});

const listDisclosures = asyncHandler(async (req, res) => {
  const { data, meta } = await masterdataService.listDisclosures(
    req.user,
    req.params.id,
    req.query,
  );
  return list(res, data, meta);
});

const createDisclosure = asyncHandler(async (req, res) => {
  const data = await masterdataService.createDisclosure(req.user, req.params.id, req.body);
  return created(res, data);
});

const updateDisclosure = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateDisclosure(req.user, req.params.id, req.body);
  return ok(res, data);
});

const deleteDisclosure = asyncHandler(async (req, res) => {
  await masterdataService.deleteDisclosure(req.user, req.params.id);
  return noContent(res);
});

// KPIs
const listKpis = asyncHandler(async (req, res) => {
  const { data, meta } = await masterdataService.listKpis(req.user, req.query);
  return list(res, data, meta);
});

const createKpi = asyncHandler(async (req, res) => {
  const data = await masterdataService.createKpi(req.user, req.body);
  return created(res, data);
});

const getKpi = asyncHandler(async (req, res) => {
  const data = await masterdataService.getKpi(req.user, req.params.id);
  return ok(res, data);
});

const updateKpi = asyncHandler(async (req, res) => {
  const data = await masterdataService.updateKpi(req.user, req.params.id, req.body);
  return ok(res, data);
});

const replaceKpiDisclosures = asyncHandler(async (req, res) => {
  const data = await masterdataService.replaceKpiDisclosures(req.user, req.params.id, req.body);
  return ok(res, data);
});

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

