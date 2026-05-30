const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const deviceService = require('../services/device.service');

const getDevicesByHome = asyncHandler(async (req, res) => {
  const { homeId, unassigned } = req.query;
  const devices = await deviceService.getDevicesByHome(homeId, req.user._id, { unassigned });
  successResponse(res, devices, 'Devices retrieved');
});

const addDevice = asyncHandler(async (req, res) => {
  const { homeId, name, type, areaId, externalDeviceId } = req.body;
  const device = await deviceService.addDevice(homeId, req.user._id, { name, type, areaId, externalDeviceId });
  successResponse(res, device, 'Device added', 201);
});

const getDeviceById = asyncHandler(async (req, res) => {
  const device = await deviceService.getDeviceById(req.params.id, req.user._id);
  successResponse(res, device, 'Device retrieved');
});

const controlDevice = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const result = await deviceService.controlDevice(req.params.id, req.user._id, action);
  successResponse(res, result, 'Command queued');
});

const createCommand = asyncHandler(async (req, res) => {
  const result = await deviceService.createCommand(req.body);
  successResponse(res, result, 'Command queued', 201);
});

const updateDeviceArea = asyncHandler(async (req, res) => {
  const { areaId } = req.body;
  const device = await deviceService.updateDeviceArea(req.params.id, req.user._id, areaId);
  successResponse(res, device, 'Device area updated');
});

const deleteDevice = asyncHandler(async (req, res) => {
  const result = await deviceService.deleteDevice(req.params.id, req.user._id);
  successResponse(res, result, 'Device deleted');
});

const pollCommand = asyncHandler(async (req, res) => {
  const { deviceId } = req.query;
  const commands = await deviceService.pollPendingCommands(deviceId);
  res.json({ success: true, commands });
});

const updateStatus = asyncHandler(async (req, res) => {
  const result = await deviceService.acknowledgeStatus(req.body);
  successResponse(res, result, 'Device status recorded');
});

const acknowledgeCommand = asyncHandler(async (req, res) => {
  const { commandId, success, message } = req.body;
  const result = await deviceService.acknowledgeCommand(commandId, { success, message });
  successResponse(res, result, 'Command acknowledged');
});

module.exports = {
  getDevicesByHome,
  addDevice,
  getDeviceById,
  controlDevice,
  createCommand,
  updateDeviceArea,
  deleteDevice,
  pollCommand,
  updateStatus,
  acknowledgeCommand,
};
