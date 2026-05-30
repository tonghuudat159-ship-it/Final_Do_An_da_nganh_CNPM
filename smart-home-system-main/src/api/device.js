import { apiRequest, USE_MOCK_DATA } from "./client";
import { normalizeDevices } from "../utils/normalize";
import { deviceStatus } from "../mock/device";

const DEFAULT_DEVICE_ID = "esp32-01";

const unwrap = (payload) =>
  payload && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};

const getFirstHomeId = async () => {
  const homes = asList(unwrap(await apiRequest("/homes/mine")));
  return homes[0]?._id || homes[0]?.id || "";
};

const getHomeDevices = async () => {
  const homeId = await getFirstHomeId();
  if (!homeId) return [];

  return asList(unwrap(await apiRequest(`/devices?homeId=${encodeURIComponent(homeId)}`)));
};

const resolveDeviceId = async (deviceIdOrType) => {
  if (!["fan", "light"].includes(deviceIdOrType)) {
    return deviceIdOrType;
  }

  const devices = await getHomeDevices();
  const device = devices.find((item) => item.type === deviceIdOrType || item.name?.toLowerCase() === deviceIdOrType);
  return device?._id || device?.id || deviceIdOrType;
};

export const getDeviceStatus = async () => {
  try {
    const payload = unwrap(await apiRequest(`/sensors/latest?deviceId=${encodeURIComponent(DEFAULT_DEVICE_ID)}`));
    return { data: normalizeDevices(payload) };
  } catch (error) {
    if (!USE_MOCK_DATA) {
      throw new Error("Unable to load device status. Backend offline.");
    }

    return { data: { ...deviceStatus }, fallback: true, error };
  }
};

export const controlDevice = async (deviceId, action) => {
  try {
    const device = ["fan", "light"].includes(deviceId) ? deviceId : await resolveDeviceId(deviceId);
    const data = await apiRequest("/devices/command", {
      method: "POST",
      body: { deviceId: DEFAULT_DEVICE_ID, device, action }
    });

    if (["fan", "light"].includes(deviceId)) {
      deviceStatus[deviceId] = action;
    }

    return { data };
  } catch (error) {
    if (!USE_MOCK_DATA) {
      throw new Error("Unable to send device command. Backend offline.");
    }

    deviceStatus[deviceId] = action;
    return { data: { deviceId, status: action }, fallback: true, error };
  }
};
