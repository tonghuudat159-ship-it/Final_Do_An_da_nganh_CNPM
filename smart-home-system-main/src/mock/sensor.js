const randomInRange = (min, max) => min + Math.random() * (max - min);

const createSensorPoint = (timestamp = new Date().toISOString()) => ({
  temperature: randomInRange(28, 35),
  humidity: randomInRange(55, 75),
  anomalyScore: 0,
  dataQuality: 1,
  lightLevel: Math.round(randomInRange(120, 180)),
  humanInside: true,
  fanOn: true,
  lightOn: false,
  timestamp
});

export const getMockLatestSensor = () => createSensorPoint();

export const getMockHistorySensor = () =>
  Array.from({ length: 20 }, (_, i) =>
    createSensorPoint(new Date(Date.now() - i * 60000).toISOString())
  );
