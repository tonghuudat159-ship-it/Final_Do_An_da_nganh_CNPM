const Device = require('../models/Device.model');
const CommandQueue = require('../models/CommandQueue.model');
const Home = require('../models/Home.model');
const AppError = require('../utils/AppError');
const socketService = require('./socket.service');
const { WS_EVENTS, COMMAND_TTL_SECONDS, COMMAND_STATUS, COMMAND_SOURCE } = require('../config/constants');

const DEFAULT_DEVICE_ID = 'esp32-01';
const ALLOWED_DEVICES = ['fan', 'light'];
const ALLOWED_ACTIONS = ['on', 'off', 'auto'];
const SENT_RETRY_AFTER_MS = 30000;

const _cleanExternalDeviceId = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

const _deriveExternalDeviceId = (device) => {
  if (!device) return null;
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  return _cleanExternalDeviceId(device.externalDeviceId || device.externalId) ||
    (name === DEFAULT_DEVICE_ID ? DEFAULT_DEVICE_ID : null);
};

const _toDeviceContract = (device) => {
  if (!device) return device;
  const plain = typeof device.toObject === 'function' ? device.toObject() : { ...device };
  const externalDeviceId = _deriveExternalDeviceId(plain);
  return {
    ...plain,
    externalDeviceId,
    externalId: plain.externalId || externalDeviceId,
  };
};

const _findAccessibleHome = (homeId, userId) =>
  Home.findOne({
    _id: homeId,
    $or: [{ ownerIds: userId }, { memberIds: userId }],
  });

const _verifyOwnership = async (deviceId, userId) => {
  const device = await Device.findById(deviceId);
  if (!device) throw new AppError('Device not found', 404);

  const home = await _findAccessibleHome(device.homeId, userId);
  if (!home) throw new AppError('Access denied', 403);

  return { device, home };
};

const _validateCommand = ({ deviceId, device, action }) => {
  if (!deviceId) {
    throw new AppError('deviceId is required', 400, 'DEVICE_ID_REQUIRED');
  }
  if (!ALLOWED_DEVICES.includes(device)) {
    throw new AppError('device must be fan or light', 400, 'INVALID_DEVICE');
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new AppError('action must be on, off, or auto', 400, 'INVALID_ACTION');
  }
};

const _queueCommand = async ({ externalDeviceId, deviceId = null, device, action, requestedBy = null, source = COMMAND_SOURCE.MANUAL }) => {
  const targetExternalId = externalDeviceId || DEFAULT_DEVICE_ID;
  _validateCommand({ deviceId: targetExternalId, device, action });

  const expiresAt = new Date(Date.now() + COMMAND_TTL_SECONDS * 1000);
  const command = await CommandQueue.create({
    externalDeviceId: targetExternalId,
    deviceId,
    device,
    action,
    status: COMMAND_STATUS.PENDING,
    source,
    requestedBy,
    expiresAt,
  });

  console.log(`[ESP32] Queued command ${command._id} for ${targetExternalId}: ${device}/${action}`);

  return {
    commandId: command._id,
    deviceId: targetExternalId,
    device,
    action,
  };
};

const getDevicesByHome = async (homeId, userId, { unassigned } = {}) => {
  const home = await _findAccessibleHome(homeId, userId);
  if (!home) throw new AppError('Home not found', 404);

  const filter = { homeId };
  if (unassigned === 'true' || unassigned === true) filter.areaId = null;

  const devices = await Device.find(filter).select('-__v').sort({ createdAt: -1 }).lean();
  return devices.map(_toDeviceContract);
};

const addDevice = async (homeId, userId, { name, type, areaId, externalDeviceId }) => {
  const home = await _findAccessibleHome(homeId, userId);
  if (!home) throw new AppError('Home not found', 404);

  const normalizedExternalId =
    _cleanExternalDeviceId(externalDeviceId) ||
    (String(name || '').trim() === DEFAULT_DEVICE_ID ? DEFAULT_DEVICE_ID : null);

  const device = await Device.create({
    homeId,
    name,
    type,
    areaId: areaId || null,
    ...(normalizedExternalId && {
      externalDeviceId: normalizedExternalId,
    }),
  });
  return _toDeviceContract(device);
};

const getDeviceById = async (deviceId, userId) => {
  const { device } = await _verifyOwnership(deviceId, userId);
  return _toDeviceContract(device);
};

const updateDeviceArea = async (deviceId, userId, areaId) => {
  const { device } = await _verifyOwnership(deviceId, userId);
  device.areaId = areaId || null;
  await device.save();
  return _toDeviceContract(device);
};

const deleteDevice = async (deviceId, userId) => {
  const { device } = await _verifyOwnership(deviceId, userId);
  await device.deleteOne();
  return { message: 'Device deleted' };
};

const controlDevice = async (deviceId, userId, action) => {
  const { device } = await _verifyOwnership(deviceId, userId);
  const externalDeviceId = _deriveExternalDeviceId(device) || DEFAULT_DEVICE_ID;
  const targetDevice = ALLOWED_DEVICES.includes(device.type) ? device.type : 'light';
  const result = await _queueCommand({
    externalDeviceId,
    deviceId: device._id,
    device: targetDevice,
    action,
    requestedBy: userId,
  });

  device.status = action;
  await device.save();

  return { ...result, status: device.status, message: 'Command queued' };
};

const createCommand = async ({ deviceId, device, action }) => {
  if (!deviceId) {
    throw new AppError('deviceId is required', 400, 'DEVICE_ID_REQUIRED');
  }
  return _queueCommand({
    externalDeviceId: deviceId,
    device,
    action,
  });
};

const pollPendingCommands = async (deviceId) => {
  const externalDeviceId = deviceId || DEFAULT_DEVICE_ID;
  const retryBefore = new Date(Date.now() - SENT_RETRY_AFTER_MS);
  // Retry simple transient failures: a sent command becomes pollable again
  // if the ESP32 has not acknowledged it within SENT_RETRY_AFTER_MS.
  const commands = await CommandQueue.find({
    externalDeviceId,
    $or: [
      { status: COMMAND_STATUS.PENDING },
      { status: COMMAND_STATUS.SENT, updatedAt: { $lte: retryBefore } },
    ],
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .limit(5);

  if (!commands.length) {
    console.log(`[ESP32] Command poll from ${externalDeviceId}: 0 pending`);
    return [];
  }

  await CommandQueue.updateMany(
    { _id: { $in: commands.map((command) => command._id) } },
    { status: COMMAND_STATUS.SENT }
  );

  console.log(`[ESP32] Command poll from ${externalDeviceId}: ${commands.length} command(s)`);

  return commands.map((command) => ({
    commandId: command._id.toString(),
    device: command.device,
    action: command.action,
  }));
};

const pollPendingCommand = async (deviceId) => {
  const commands = await pollPendingCommands(deviceId);
  return commands[0] || null;
};

const acknowledgeStatus = async ({ deviceId, fanOn, lightOn, executedCommands = [] }) => {
  const externalDeviceId = deviceId || DEFAULT_DEVICE_ID;
  const results = [];

  for (const item of executedCommands) {
    if (!item.commandId) continue;

    const status = item.status === 'executed' ? COMMAND_STATUS.EXECUTED : COMMAND_STATUS.FAILED;
    const command = await CommandQueue.findOneAndUpdate(
      { _id: item.commandId, externalDeviceId },
      {
        status,
        responseMessage: item.status || null,
        executedAt: new Date(),
      },
      { new: true }
    ).populate('deviceId');

    if (!command) {
      results.push({ commandId: item.commandId, status: 'not_found' });
      continue;
    }

    if (command.deviceId && status === COMMAND_STATUS.EXECUTED && command.action !== 'auto') {
      await Device.findByIdAndUpdate(command.deviceId._id, { status: command.action });
    }

    const homeId = command.deviceId?.homeId;
    if (homeId) {
      socketService.emitToHome(homeId.toString(), WS_EVENTS.COMMAND_ACK, {
        commandId: command._id,
        deviceId: command.deviceId._id,
        status,
        newStatus: command.action,
      });
    }

    results.push({ commandId: command._id, status });
  }

  console.log(
    `[ESP32] Status from ${externalDeviceId}: fanOn=${Boolean(fanOn)} lightOn=${Boolean(lightOn)} acks=${results.length}`
  );

  return {
    deviceId: externalDeviceId,
    fanOn: Boolean(fanOn),
    lightOn: Boolean(lightOn),
    executedCommands: results,
  };
};

const acknowledgeCommand = async (commandId, { success, message }) => {
  return acknowledgeStatus({
    executedCommands: [
      {
        commandId,
        status: success ? 'executed' : 'failed',
        message,
      },
    ],
  });
};

module.exports = {
  getDevicesByHome,
  addDevice,
  getDeviceById,
  updateDeviceArea,
  deleteDevice,
  controlDevice,
  queueCommand: _queueCommand,
  createCommand,
  pollPendingCommands,
  pollPendingCommand,
  acknowledgeStatus,
  acknowledgeCommand,
};
