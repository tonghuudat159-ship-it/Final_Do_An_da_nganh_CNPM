const ThresholdRule = require('../models/ThresholdRule.model');
const Schedule = require('../models/Schedule.model');
const Device = require('../models/Device.model');
const Alert = require('../models/Alert.model');
const socketService = require('./socket.service');
const deviceService = require('./device.service');
const { WS_EVENTS, COMMAND_SOURCE, RULE_TYPE } = require('../config/constants');

const DEFAULT_DEVICE_ID = 'esp32-01';
const SUPPORTED_DATA_TYPES = ['temperature', 'humidity', 'lightLevel', 'humanInside', 'fanOn', 'lightOn'];

const _cleanExternalDeviceId = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

const _resolveExternalDeviceId = (device) => {
  if (!device) return DEFAULT_DEVICE_ID;
  const name = typeof device.name === 'string' ? device.name.trim() : '';
  return _cleanExternalDeviceId(device.externalDeviceId || device.externalId || device.deviceId) ||
    (name === DEFAULT_DEVICE_ID ? DEFAULT_DEVICE_ID : DEFAULT_DEVICE_ID);
};

const _resolveCommandDevice = (device) => {
  return ['fan', 'light'].includes(device?.type) ? device.type : 'light';
};

const _normalizeAction = (action) => {
  const normalized = String(action || '').toLowerCase().trim();
  return ['on', 'off', 'auto'].includes(normalized) ? normalized : '';
};

const _readValue = (payload, dataType) => {
  if (!SUPPORTED_DATA_TYPES.includes(dataType)) return undefined;
  return payload[dataType];
};

const _compare = (value, threshold, comparator = '>=') => {
  if (value === undefined || value === null) return false;

  const normalizedValue = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
  const normalizedThreshold = typeof threshold === 'boolean' ? (threshold ? 1 : 0) : Number(threshold);
  if (!Number.isFinite(normalizedValue) || !Number.isFinite(normalizedThreshold)) return false;

  switch (comparator) {
    case '>':
      return normalizedValue > normalizedThreshold;
    case '<':
      return normalizedValue < normalizedThreshold;
    case '<=':
      return normalizedValue <= normalizedThreshold;
    case '==':
    case '=':
      return normalizedValue === normalizedThreshold;
    case '>=':
    default:
      return normalizedValue >= normalizedThreshold;
  }
};

const _isCooldownActive = (lastTriggeredAt, cooldownSeconds) => {
  if (!lastTriggeredAt || !cooldownSeconds) return false;
  const elapsedSeconds = (Date.now() - new Date(lastTriggeredAt).getTime()) / 1000;
  return elapsedSeconds < cooldownSeconds;
};

const _createCommandForDevice = async ({ device, action, source }) => {
  const externalDeviceId = _resolveExternalDeviceId(device);
  const commandDevice = _resolveCommandDevice(device);

  console.log(`[${source === COMMAND_SOURCE.SCHEDULE ? 'SCHEDULE' : 'AUTO_RULE'}] Creating command: ${commandDevice}/${action} for ${externalDeviceId}`);

  return deviceService.queueCommand({
    externalDeviceId,
    deviceId: device?._id || null,
    device: commandDevice,
    action,
    source,
  });
};

const _isSameUploadedDevice = (ruleDevice, uploadedDeviceId) => {
  const ruleExternalId = _resolveExternalDeviceId(ruleDevice);
  return ruleExternalId === uploadedDeviceId;
};

const evaluateThresholdsForSnapshot = async ({ payload, device }) => {
  console.log('[AUTO_RULE] Automation disabled for demo stability; skipping threshold evaluation.');
  return;

  const uploadedDeviceId = _cleanExternalDeviceId(payload.deviceId) || DEFAULT_DEVICE_ID;
  const rules = await ThresholdRule.find({ isActive: true }).populate('deviceId');

  for (const rule of rules) {
    const ruleDevice = rule.deviceId;
    if (!ruleDevice || !_isSameUploadedDevice(ruleDevice, uploadedDeviceId)) continue;

    console.log(`[AUTO_RULE] Evaluating rule: ${rule.name}`);

    const dataType = rule.dataType;
    const value = _readValue(payload, dataType);
    const comparator = rule.comparator || '>=';
    const condition = _compare(value, rule.thresholdValue, comparator);
    const targetDeviceId = _resolveExternalDeviceId(ruleDevice);

    console.log(
      `[AUTO_RULE] deviceId=${targetDeviceId}, dataType=${dataType}, value=${value}, threshold=${rule.thresholdValue}, condition=${condition}`
    );

    if (!condition) continue;

    const cooldownSeconds = Number(rule.cooldownSeconds ?? rule.cooldownTime ?? 0);
    if (_isCooldownActive(rule.lastTriggeredAt, cooldownSeconds)) {
      console.log('[AUTO_RULE] Skipped due to cooldown');
      continue;
    }

    const action = _normalizeAction(rule.action);
    if (rule.ruleType === RULE_TYPE.AUTO_CONTROL && action) {
      await _createCommandForDevice({
        device: ruleDevice,
        action,
        source: COMMAND_SOURCE.THRESHOLD,
      });
    }

    const alertContent = `[${rule.name}] ${dataType} = ${value}${rule.thresholdUnit || ''} reached threshold ${rule.thresholdValue}${rule.thresholdUnit || ''}`;
    const alert = await Alert.create({
      ruleId: rule._id,
      deviceId: ruleDevice._id,
      alertContent,
      timestamp: new Date(),
      isRead: false,
    });

    if (ruleDevice.homeId) {
      socketService.emitToHome(ruleDevice.homeId.toString(), WS_EVENTS.ALERT_NEW, {
        alertId: alert._id,
        ruleId: rule._id,
        deviceId: ruleDevice._id,
        alertContent,
        timestamp: alert.timestamp,
      });
    }

    rule.lastTriggeredAt = new Date();
    await rule.save();
  }
};

const _dateKey = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const _timeKey = (date) => {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const _isExceptionDate = (schedule, now) => {
  return (schedule.exceptions || []).some((exDate) => {
    const ex = new Date(exDate);
    return ex.getFullYear() === now.getFullYear() &&
      ex.getMonth() === now.getMonth() &&
      ex.getDate() === now.getDate();
  });
};

const _isInsideScheduleWindow = (schedule, now) => {
  const date = new Date(now);
  const startDay = new Date(schedule.startDay);
  const endDay = new Date(schedule.endDay);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(23, 59, 59, 999);

  if (date < startDay || date > endDay) return false;
  if ((schedule.scheduledDays || []).length && !schedule.scheduledDays.includes(date.getDay())) return false;
  if (_isExceptionDate(schedule, now)) return false;

  const currentTime = _timeKey(now);
  return currentTime >= schedule.startTime && currentTime <= schedule.endTime;
};

const evaluateSchedules = async () => {
  console.log('[SCHEDULE] Automation disabled for demo stability; skipping schedule evaluation.');
  return;

  const now = new Date();
  const schedules = await Schedule.find({ activeStatus: true }).populate('deviceIds');

  for (const schedule of schedules) {
    if (!_isInsideScheduleWindow(schedule, now)) continue;

    console.log(`[SCHEDULE] Active schedule: ${schedule.name}`);

    const windowKey = `${schedule._id}:${_dateKey(now)}:${schedule.startTime}-${schedule.endTime}:${schedule.action}`;
    if (schedule.lastTriggeredWindowKey === windowKey) {
      console.log('[SCHEDULE] Skipped: already triggered for this window');
      continue;
    }

    const action = _normalizeAction(schedule.action);
    if (!action) continue;

    const targetDevices = (schedule.deviceIds || []).filter(Boolean);
    for (const device of targetDevices) {
      await _createCommandForDevice({
        device,
        action,
        source: COMMAND_SOURCE.SCHEDULE,
      });

      device.status = action;
      await device.save();
    }

    schedule.lastTriggeredAt = now;
    schedule.lastTriggeredWindowKey = windowKey;
    await schedule.save();

    const firstDevice = targetDevices[0];
    if (firstDevice?.homeId) {
      socketService.emitToHome(firstDevice.homeId.toString(), WS_EVENTS.SCHEDULE_EXECUTED, {
        scheduleId: schedule._id,
        deviceIds: targetDevices.map((item) => item._id),
        action,
        timestamp: now,
      });
    }
  }
};

const executeActiveSchedules = evaluateSchedules;

module.exports = {
  evaluateThresholdsForSnapshot,
  evaluateSchedules,
  executeActiveSchedules,
};
