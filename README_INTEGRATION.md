# Smart Home ESP32 Integration

## Folder Structure

```text
DO_AN_DA_NGANH/
├── esp32-freertos-tinyml-monitor-main/
└── smart-home-system-main/
    ├── backend/
    └── src/
```

## Backend

Run the whole software stack from the project root:

```bash
docker compose up -d
```

This starts:

```text
mongo     -> localhost:27017
backend   -> http://localhost:5000
frontend  -> http://localhost:5173
```

Manual backend run:

```bash
cd smart-home-system-main/backend
npm install
cp .env.example .env
npm run dev
```

PowerShell equivalent for copying env:

```powershell
Copy-Item .env.example .env
```

Backend `.env.example`:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/smart-home
JWT_SECRET=change_this_jwt_secret_please_make_it_at_least_32_chars
JWT_EXPIRES_IN=7d
DEVICE_SECRET_KEY=my_esp32_secret_123
CLIENT_URL=http://127.0.0.1:5173
```

For local demo, `backend/.env` must use either the local MongoDB URI above or your real MongoDB Atlas URI. Do not leave placeholder Atlas values such as `<user>`, `<password>`, or `<cluster-host>` in `MONGODB_URI`.

`DEVICE_SECRET_KEY` in `backend/.env` must match the firmware `CE_DEVICE_SECRET` value. The current integration uses:

```text
my_esp32_secret_123
```

Do not commit `.env`; keep only `.env.example` in source control.

If Docker is not available, install/start MongoDB locally on port `27017`.

## Frontend

```bash
cd smart-home-system-main
npm install
cp .env.example .env
npm run dev
```

Frontend `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_USE_MOCK_DATA=false
```

Set `VITE_USE_MOCK_DATA=true` only for demo mode without a backend. The UI will show a visible mock-mode warning.

## Firmware

```bash
cd esp32-freertos-tinyml-monitor-main
pio run -e yolo_uno
pio run -e yolo_uno -t upload
pio device monitor -b 115200
```

Edit `include/ce_config_global.h` before flashing:

```cpp
#define CE_BACKEND_URL "http://<LAPTOP_LAN_IP>:5000"
```

Do not use `localhost` for ESP32. From the ESP32, `localhost` means the ESP32 itself.

## Hardware Mapping

```text
Light sensor AO/SIG -> GPIO10 / D7
PIR OUT/SIG         -> GPIO38 / D11
Fan relay IN        -> GPIO47 / D12
Auto-light LED D13  -> GPIO48 / D13
DHT20 SDA           -> GPIO11 / SDA
DHT20 SCL           -> GPIO12 / SCL
```

## Light Sensor Calibration

Current firmware exposes:

```cpp
#define LIGHT_SENSOR_DARK_WHEN_HIGHER 1
#define LIGHT_THRESHOLD 145
```

Calibration steps:

1. Open Serial Monitor.
2. Record raw value when the sensor is covered.
3. Record raw value under flashlight.
4. Decide whether the dark value is higher or lower.
5. Set `LIGHT_SENSOR_DARK_WHEN_HIGHER` and `LIGHT_THRESHOLD` accordingly.

The D13 auto-light still requires both PIR motion and room dark. It does not follow the light sensor alone.

## API Contract

```text
POST /api/sensors/data
GET  /api/sensors/latest?deviceId=esp32-01
GET  /api/sensors/history?deviceId=esp32-01&limit=50
POST /api/devices/command
GET  /api/devices/command?deviceId=esp32-01
POST /api/devices/status
GET  /api/health
```

ESP32 requests use:

```http
X-Device-Key: my_esp32_secret_123
```

Allowed commands:

```text
device: fan | light
action: on | off | auto
```

## Curl Tests

PowerShell:

```powershell
curl.exe http://localhost:5000/api/health
curl.exe -X POST http://localhost:5000/api/sensors/data `
  -H "Content-Type: application/json" `
  -H "X-Device-Key: my_esp32_secret_123" `
  -d "{\"deviceId\":\"esp32-01\",\"temperature\":28.5,\"humidity\":65.3,\"anomalyScore\":0.12,\"dataQuality\":1.0,\"lightLevel\":145,\"humanInside\":true,\"fanOn\":true,\"lightOn\":false}"
```

## Expected Local Control Cases

| PIR Motion | Room Dark | Temp > 27 | D13 | Fan |
| ---------- | --------- | --------- | --- | --- |
| No         | Any       | Any       | OFF | OFF |
| Yes        | No        | No        | OFF | OFF |
| Yes        | Yes       | No        | ON  | OFF |
| Yes        | No        | Yes       | OFF | ON  |
| Yes        | Yes       | Yes       | ON  | ON  |

## Windows Firewall

If laptop `curl.exe` works but ESP32 cannot upload, allow Node.js or TCP port `5000` through Windows Firewall.

## Validation Checklist

```bash
docker compose up -d
curl.exe http://localhost:5000/api/health
```

```bash
cd smart-home-system-main/backend
npm install
npm run check
```

```bash
cd smart-home-system-main
npm install
npm run build
```

```bash
cd esp32-freertos-tinyml-monitor-main
pio run -e yolo_uno
```
