const mongoose = require('mongoose');
const SensorData = require('../models/SensorData.model');
const SensorDevice = require('../models/SensorDevice.model');
const Device = require('../models/Device.model');
const Home = require('../models/Home.model');
const AppError = require('../utils/AppError');
const socketService = require('./socket.service');
const { WS_EVENTS, DEFAULT_SENSOR_HISTORY_LIMIT } = require('../config/constants');

const DEFAULT_DEVICE_ID = 'esp32-01';

const SENSOR_TYPE_MAP = {
  temperature: { unit: 'C', name: 'Temperature' },
  humidity: { unit: '%', name: 'Humidity' },
  anomalyScore: { unit: '', name: 'Anomaly Score' },
  dataQuality: { unit: '', name: 'Data Quality' },
  lightLevel: { unit: '', name: 'Light Level' },
  humanInside: { unit: '', name: 'PIR Motion' },
  fanOn: { unit: '', name: 'Fan State' },
  lightOn: { unit: '', name: 'D13 Light State' },
};

const NUMERIC_FIELDS = ['temperature', 'humidity', 'anomalyScore', 'dataQuality', 'lightLevel'];
const BOOLEAN_FIELDS = ['humanInside', 'fanOn', 'lightOn'];

const _normalizeExternalDeviceId = (deviceId) => deviceId || DEFAULT_DEVICE_ID;

const _isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const _assertFiniteNumber = (field, value) => {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(Number(value))) {
    throw new AppError(`${field} must be a number`, 400, 'INVALID_SENSOR_PAYLOAD');
  }
};

const _validateIngestPayload = (payload) => {
  if (!payload.deviceId) {
    throw new AppError('deviceId is required', 400, 'DEVICE_ID_REQUIRED');
  }

  for (const field of NUMERIC_FIELDS) {
    _assertFiniteNumber(field, payload[field]);
  }
};

const _findDeviceByAnyId = async (deviceId) => {
  const normalized = _normalizeExternalDeviceId(deviceId);
  if (_isObjectId(normalized)) {
    return Device.findById(normalized);
  }
  return Device.findOne({
    $or: [
      { externalDeviceId: normalized },
      { externalId: normalized },
      { name: normalized },
    ],
  });
};

const _findOrCreateDevice = async (externalId) => {
  let device = await Device.findOne({
    $or: [
      { externalDeviceId: externalId },
      { externalId },
      { name: externalId },
    ],
  });
  if (!device) {
    device = await Device.create({
      externalId,
      externalDeviceId: externalId,
      name: externalId,
      type: 'light',
      homeId: null,
      status: 'off',
    });
    console.log(`[ESP32] Auto-created Device for ${externalId}`);
  } else if (!device.externalDeviceId) {
    device.externalDeviceId = externalId;
    await device.save();
  }
  return device;
};

const _findOrCreateSensorDevice = async (deviceId, sensorType, meta) => {
  let sd = await SensorDevice.findOne({ deviceId, sensorType });
  if (!sd) {
    sd = await SensorDevice.create({
      deviceId,
      sensorType,
      name: meta.name,
      unit: meta.unit,
      connectionStatus: 'online',
    });
    console.log(`[ESP32] Auto-created SensorDevice ${sensorType} for device ${deviceId}`);
  }
  return sd;
};

const _snapshotFromPayload = (externalDeviceId, device, payload) => {
  const snapshot = {
    recordType: 'device_snapshot',
    deviceId: device._id,
    externalDeviceId,
  };

  for (const field of NUMERIC_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== null) {
      snapshot[field] = Number(payload[field]);
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== null) {
      snapshot[field] = Boolean(payload[field]);
    }
  }

  return snapshot;
};

const _toContractSensor = (record) => {
  if (!record) return null;
  return {
    deviceId: record.externalDeviceId,
    temperature: record.temperature,
    humidity: record.humidity,
    anomalyScore: record.anomalyScore,
    dataQuality: record.dataQuality,
    lightLevel: record.lightLevel,
    humanInside: record.humanInside,
    fanOn: record.fanOn,
    lightOn: record.lightOn,
    createdAt: record.createdAt,
  };
};

const ingestData = async (payload) => {
  _validateIngestPayload(payload);
  const externalId = payload.deviceId;
  const device = await _findOrCreateDevice(externalId);

  console.log(`[ESP32] Sensor upload received from ${externalId}`);

  const snapshot = await SensorData.create(_snapshotFromPayload(externalId, device, payload));
  const savedRecords = [];

  for (const [sensorType, meta] of Object.entries(SENSOR_TYPE_MAP)) {
    const value = payload[sensorType];
    if (value === undefined || value === null) continue;

    const sensorDevice = await _findOrCreateSensorDevice(device._id, sensorType, meta);
    const storedValue = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
    const sensorData = await SensorData.create({
      recordType: 'sensor_value',
      deviceId: device._id,
      externalDeviceId: externalId,
      sensorDeviceId: sensorDevice._id,
      value: storedValue,
      unit: meta.unit,
    });

    savedRecords.push({ sensorType, value, unit: meta.unit, sensorDeviceId: sensorDevice._id });

    if (device.homeId) {
      socketService.emitToHome(device.homeId.toString(), WS_EVENTS.SENSOR_DATA, {
        sensorDeviceId: sensorDevice._id,
        deviceId: device._id,
        externalId,
        sensorType,
        value,
        unit: meta.unit,
        timestamp: sensorData.createdAt,
      });

    }
  }

  // Automation disabled for demo stability.
  // Manual device commands and ESP32 local auto mode remain active.

  return {
    deviceId: externalId,
    data: _toContractSensor(snapshot),
    records: savedRecords,
  };
};

const getLatestByDevice = async (deviceId, userId = null) => {
  const requestedId = _normalizeExternalDeviceId(deviceId);
  const device = await _findDeviceByAnyId(requestedId);

  if (userId && device?.homeId) {
    const home = await Home.findOne({
      _id: device.homeId,
      $or: [{ ownerIds: userId }, { memberIds: userId }],
    });
    if (!home) throw new AppError('Not authorized', 403);
  }

  const filter = _isObjectId(requestedId)
    ? { deviceId: requestedId, recordType: 'device_snapshot' }
    : { externalDeviceId: requestedId, recordType: 'device_snapshot' };

  const latest = await SensorData.findOne(filter).sort({ createdAt: -1 }).lean();
  return _toContractSensor(latest);
};

const getHistory = async (sensorDeviceId, { deviceId, limit, page } = {}) => {
  const pageSize = Math.min(Number(limit) || DEFAULT_SENSOR_HISTORY_LIMIT, 500);
  const pageNum = Number(page) || 1;
  const skip = (pageNum - 1) * pageSize;

  if (sensorDeviceId) {
    const [data, total] = await Promise.all([
      SensorData.find({ sensorDeviceId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('value unit createdAt')
        .lean(),
      SensorData.countDocuments({ sensorDeviceId }),
    ]);

    return { data, total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  const requestedId = _normalizeExternalDeviceId(deviceId);
  const filter = _isObjectId(requestedId)
    ? { deviceId: requestedId, recordType: 'device_snapshot' }
    : { externalDeviceId: requestedId, recordType: 'device_snapshot' };

  const rows = await SensorData.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean();

  return rows.map(_toContractSensor);
};

const getSensorDevicesByDevice = async (deviceId) => {
  return SensorDevice.find({ deviceId }).select('-__v').lean();
};

const updateSensorDeviceStatus = async (sensorDeviceId, { connectionStatus, activeStatus }) => {
  const sd = await SensorDevice.findByIdAndUpdate(
    sensorDeviceId,
    { ...(connectionStatus !== undefined && { connectionStatus }), ...(activeStatus !== undefined && { activeStatus }) },
    { new: true, runValidators: true }
  );
  if (!sd) throw new AppError('SensorDevice not found', 404);
  return sd;
};

module.exports = { ingestData, getLatestByDevice, getHistory, getSensorDevicesByDevice, updateSensorDeviceStatus };
