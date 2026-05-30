export function normalizeSensor(sensor) {
  const payload = sensor?.data ?? sensor;
  if (!payload) return null;

  return {
    deviceId: payload?.deviceId || "esp32-01",
    temperature: Number(payload?.temperature ?? 0),
    humidity: Number(payload?.humidity ?? 0),
    anomalyScore: Number(payload?.anomalyScore ?? 0),
    dataQuality: Number(payload?.dataQuality ?? 0),
    lightLevel: Number(payload?.lightLevel ?? 0),
    humanInside: Boolean(payload?.humanInside),
    fanOn: Boolean(payload?.fanOn),
    lightOn: Boolean(payload?.lightOn),
    timestamp: payload?.createdAt || payload?.timestamp || new Date().toISOString()
  };
}

export function normalizeDevices(payload) {
  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => {
      const key = item?.type || item?.device || item?.name;

      if (!key) {
        return acc;
      }

      acc[key] = item?.status || "off";
      return acc;
    }, {});
  }

  if (payload && typeof payload === "object") {
    if (payload.devices) {
      return normalizeDevices(payload.devices);
    }

    return {
      fan: payload.fanOn === true ? "on" : payload.fan || payload?.fan?.status || "off",
      light: payload.lightOn === true ? "on" : payload.light || payload?.light?.status || "off"
    };
  }

  return { fan: "off", light: "off" };
}
