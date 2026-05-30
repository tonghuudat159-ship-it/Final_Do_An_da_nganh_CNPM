export function getSensorDeviceId(device) {
  if (!device) return null;

  const name = typeof device.name === "string" ? device.name.trim() : "";
  return (
    device.externalDeviceId ||
    device.externalId ||
    device.deviceId ||
    (["fan", "light"].includes(device.type) ? "esp32-01" : null) ||
    (name === "esp32-01" ? "esp32-01" : null)
  );
}
