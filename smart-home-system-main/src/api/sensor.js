import { apiRequest, USE_MOCK_DATA } from "./client";
import { normalizeSensor } from "../utils/normalize";
import { getMockHistorySensor, getMockLatestSensor } from "../mock/sensor";

const DEFAULT_DEVICE_ID = "esp32-01";
const unwrap = (payload) =>
  payload && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;

export const getLatestSensor = async (deviceId = DEFAULT_DEVICE_ID) => {
  try {
    const data = unwrap(await apiRequest(`/sensors/latest?deviceId=${encodeURIComponent(deviceId)}`));
    return { data: data ? normalizeSensor(data) : null };
  } catch (error) {
    if (!USE_MOCK_DATA) {
      throw new Error("Unable to load latest sensor data. Backend offline.");
    }

    return {
      data: normalizeSensor(getMockLatestSensor()),
      fallback: true,
      error
    };
  }
};

export const getHistorySensor = async (deviceId = DEFAULT_DEVICE_ID, limit = 50) => {
  try {
    const data = unwrap(
      await apiRequest(`/sensors/history?deviceId=${encodeURIComponent(deviceId)}&limit=${encodeURIComponent(limit)}`)
    );
    const list = Array.isArray(data) ? data : data?.items || data?.data || [];

    return { data: list.map(normalizeSensor) };
  } catch (error) {
    if (!USE_MOCK_DATA) {
      throw new Error("Unable to load sensor history. Backend offline.");
    }

    return {
      data: getMockHistorySensor().map(normalizeSensor),
      fallback: true,
      error
    };
  }
};
