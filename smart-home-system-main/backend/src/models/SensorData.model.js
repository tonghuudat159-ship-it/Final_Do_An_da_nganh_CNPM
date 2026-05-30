const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
  {
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      default: null,
      index: true,
    },
    externalDeviceId: {
      type: String,
      trim: true,
      index: true,
    },
    recordType: {
      type: String,
      enum: ["device_snapshot", "sensor_value"],
      default: "sensor_value",
      index: true,
    },
    sensorDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SensorDevice",
      default: null,
      index: true,
    },
    value: {
      type: Number,
      default: null,
    },
    unit: {
      type: String,
      trim: true,
      default: "",
    },
    temperature: { type: Number, default: null },
    humidity: { type: Number, default: null },
    anomalyScore: { type: Number, default: null },
    dataQuality: { type: Number, default: null },
    lightLevel: { type: Number, default: null },
    humanInside: { type: Boolean, default: null },
    fanOn: { type: Boolean, default: null },
    lightOn: { type: Boolean, default: null },
  },
  { timestamps: true }
);

sensorDataSchema.index({ sensorDeviceId: 1, createdAt: -1 });
sensorDataSchema.index({ externalDeviceId: 1, recordType: 1, createdAt: -1 });

module.exports = mongoose.model("SensorData", sensorDataSchema);
