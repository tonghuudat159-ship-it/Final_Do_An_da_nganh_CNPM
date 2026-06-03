# Smart Home ESP32 Integration

## Folder Structure

```text
DO_AN_DA_NGANH/
├── docker-compose.yml
├── README_INTEGRATION.md
├── esp32-freertos-tinyml-monitor-main/
│   ├── include/
│   ├── src/
│   ├── lib/
│   ├── disabled_libs/
│   ├── boards/yolo_uno.json
│   ├── platformio.ini
│   └── Makefile
└── smart-home-system-main/
    ├── backend/
    │   └── src/
    │       ├── config/
    │       ├── controllers/
    │       ├── middleware/
    │       ├── models/
    │       ├── routes/
    │       ├── services/
    │       ├── utils/
    │       └── validators/
    ├── public/
    └── src/
        ├── api/
        ├── components/
        ├── mock/
        ├── pages/
        └── utils/
```

Firmware builds from `platformio.ini`, `src/`, `include/`, and `lib/`. `disabled_libs/` is legacy-only.

## System Overview

```text
ESP32 YOLO UNO
  -> reads sensors, controls D13/fan, uploads data, polls commands

Backend
  -> Express API + Swagger + Socket.io + MongoDB
  -> JWT for users, X-Device-Key for ESP32

Frontend
  -> Vite + React app for auth, dashboard, history, settings, and console
```

## Run Full Stack With Docker

From the project root:

```bash
docker compose up -d
```

Services:

```text
mongo     -> localhost:27017
backend   -> http://localhost:5000
frontend  -> http://localhost:5173
swagger   -> http://localhost:5000/api-docs
```

Quick check:

```powershell
curl.exe http://localhost:5000/api/health
docker compose ps
docker compose logs -f backend
```

Stop the stack:

```bash
docker compose down
```

Delete local MongoDB data too:

```bash
docker compose down -v
```

## Backend

Run manually:

```bash
cd smart-home-system-main/backend
npm install
cp .env.example .env
npm run dev
```

PowerShell:

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

`DEVICE_SECRET_KEY` must match firmware `CE_DEVICE_SECRET`:

```text
my_esp32_secret_123
```

Do not commit `.env`.

Backend scripts:

```bash
npm run dev      # run with nodemon
npm start        # run node src/app.js
npm run check    # check the app.js entry syntax
```

Without Docker, run MongoDB on port `27017` or use a real MongoDB Atlas URI.

## Frontend

Run manually:

```bash
cd smart-home-system-main
npm install
cp .env.example .env
npm run dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Frontend `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_USE_MOCK_DATA=false
```

Frontend scripts:

```bash
npm run dev       # dev server at http://localhost:5173
npm run lint      # ESLint
npm run build     # production build
npm run preview   # preview build
```

Use `VITE_USE_MOCK_DATA=true` only for UI demo without backend.

## Firmware

Build/upload/monitor:

```bash
cd esp32-freertos-tinyml-monitor-main
pio run -e yolo_uno
pio run -e yolo_uno -t upload
pio device monitor -b 115200
```

Specify Windows port:

```bash
pio run -e yolo_uno -t upload --upload-port COM5
pio device monitor -p COM5 -b 115200
```

With `make`:

```bash
make build
make upload PORT=COM5
make monitor PORT=COM5
```

Before flashing, edit:

```cpp
#define CE_WIFI_SSID           "your_wifi_ssid"
#define CE_WIFI_PASSWORD       "your_wifi_password"
#define CE_BACKEND_URL         "http://<LAPTOP_LAN_IP>:5000"
#define CE_DEVICE_ID           "esp32-01"
#define CE_DEVICE_SECRET       "my_esp32_secret_123"
```

Do not use `localhost` for ESP32; use the laptop LAN IP.

Firmware tasks:

```text
temp_humi_monitor      -> sensor/LCD state
ce_auto_relay_task     -> local D13/fan auto control
wifi_manager_task      -> WiFi reconnect
http_upload_task       -> sensor upload every 30s
command_poll_task      -> command polling every 10s and status ack
```

Expected serial logs:

```text
[BOOT] Serial initialized at 115200
[BOOT] CE globals initialized
[AUTO_RELAY] Task started
[UPLOAD] Task started
[CMND_POLL] Task started
[WIFI] ...
[UPLOAD] Health check: HTTP 200
[UPLOAD] Success: HTTP 201 ...
```

## Hardware Mapping

```text
Light sensor AO/SIG -> GPIO10 / D7
PIR OUT/SIG         -> GPIO38 / D11
Fan relay IN        -> GPIO47 / D12
Auto-light LED D13  -> GPIO48 / D13
DHT20 SDA           -> GPIO11 / SDA
DHT20 SCL           -> GPIO12 / SCL
LCD I2C             -> address 0x33, 16x2
```

## Local Auto Control

Thresholds:

```cpp
#define FAN_TEMP_THRESHOLD 27.0f
#define LIGHT_THRESHOLD 1500
#define LIGHT_SENSOR_DARK_WHEN_HIGHER 0
```

Logic:

```text
Fan auto ON       -> PIR has stable motion and temperature > FAN_TEMP_THRESHOLD
D13 auto-light ON -> PIR has stable motion and the room is dark
Light manual ON   -> backend command light/on forces D13 ON
Light manual OFF  -> backend command light/off forces D13 OFF
Light auto        -> backend command light/auto returns D13 to auto based on PIR + darkness
Fan manual ON/OFF -> backend command fan/on or fan/off
Fan auto          -> backend command fan/auto returns fan to auto based on PIR + temperature
```

Expected local control cases when both fan and light are in auto mode:

| PIR Motion | Room Dark | Temp > 27 | D13 | Fan |
| ---------- | --------- | --------- | --- | --- |
| No         | Any       | Any       | OFF | OFF |
| Yes        | No        | No        | OFF | OFF |
| Yes        | Yes       | No        | ON  | OFF |
| Yes        | No        | Yes       | OFF | ON  |
| Yes        | Yes       | Yes       | ON  | ON  |

## Light Sensor Calibration

1. Open Serial Monitor at `115200`.
2. Record the `[LIGHT] raw=...` log when the sensor is covered.
3. Record the `[LIGHT] raw=...` log when shining a light on the sensor.
4. If the dark value is higher than the bright value, set `LIGHT_SENSOR_DARK_WHEN_HIGHER 1`.
5. If the dark value is lower than the bright value, keep `LIGHT_SENSOR_DARK_WHEN_HIGHER 0`.
6. Set `LIGHT_THRESHOLD` between the two measured values.
7. Build/upload the firmware again and check the `dark=YES/NO` log.

D13 auto-light requires both PIR motion and a dark room. It does not turn on only because the room is dark.

## API Contract

Health:

```text
GET /api/health
GET /api-docs
```

Auth:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/forgot-password/verify
POST /api/auth/reset-password
GET  /api/auth/me
```

Admin:

```text
GET    /api/admin/users
PATCH  /api/admin/users/:id/role
GET    /api/admin/homes
POST   /api/admin/homes
POST   /api/admin/homes/:homeId/users
DELETE /api/admin/homes/:homeId/users/:userId
GET    /api/admin/devices
GET    /api/admin/devices/unassigned
PATCH  /api/admin/devices/:id/assign
```

Homes and areas:

```text
POST   /api/homes
GET    /api/homes/mine
GET    /api/homes/:homeId
POST   /api/homes/:homeId/areas
GET    /api/homes/:homeId/areas
GET    /api/homes/:homeId/areas/:areaId
PATCH  /api/homes/:homeId/areas/:areaId
DELETE /api/homes/:homeId/areas/:areaId
```

Devices:

```text
GET    /api/devices?homeId=<homeId>
GET    /api/devices?homeId=<homeId>&unassigned=true
POST   /api/devices
GET    /api/devices/:id
PATCH  /api/devices/:id/status
PATCH  /api/devices/:id/area
DELETE /api/devices/:id
POST   /api/devices/command
GET    /api/devices/command?deviceId=esp32-01
POST   /api/devices/status
POST   /api/devices/command/ack
```

Sensors:

```text
POST  /api/sensors/data
GET   /api/sensors/latest?deviceId=esp32-01
GET   /api/sensors/history?deviceId=esp32-01&limit=50
GET   /api/sensors/history?sensorDeviceId=<sensorDeviceId>&limit=50&page=1
GET   /api/sensors/devices?deviceId=<mongoDeviceId>
PATCH /api/sensors/devices/:id/status
```

Threshold rules:

```text
POST   /api/threshold-rules
GET    /api/threshold-rules
GET    /api/threshold-rules?deviceId=<mongoDeviceId>
GET    /api/threshold-rules/:id
PATCH  /api/threshold-rules/:id
PATCH  /api/threshold-rules/:id/toggle
DELETE /api/threshold-rules/:id
```

Schedules:

```text
POST   /api/schedules
GET    /api/schedules
GET    /api/schedules/:id
PATCH  /api/schedules/:id
PATCH  /api/schedules/:id/toggle
DELETE /api/schedules/:id
```

Alerts:

```text
GET   /api/alerts?homeId=<homeId>&isRead=false&limit=20&page=1
PATCH /api/alerts/read-all?homeId=<homeId>
PATCH /api/alerts/:id/read
```

ESP32 requests must use:

```http
X-Device-Key: my_esp32_secret_123
```

User requests after login use:

```http
Authorization: Bearer <token>
```

Allowed command payload:

```json
{
  "deviceId": "esp32-01",
  "device": "fan",
  "action": "on"
}
```

`device` only accepts `fan` or `light`. `action` accepts `on`, `off`, `auto`.

## Backend API Tests

### 1. Health

```powershell
curl.exe http://localhost:5000/api/health
```

Expected: `success: true`.

### 2. Auth

```powershell
curl.exe -X POST http://localhost:5000/api/auth/register `
  -H "Content-Type: application/json" `
  -d "{\"name\":\"Test User\",\"email\":\"test@example.com\",\"passwordHash\":\"12345678\",\"phoneNumber\":\"0901234567\"}"

curl.exe -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"test@example.com\",\"password\":\"12345678\"}"
```

Copy `data.token` from the response to test APIs that require a Bearer token.

### 3. ESP32 Sensor Upload

```powershell
curl.exe -X POST http://localhost:5000/api/sensors/data `
  -H "Content-Type: application/json" `
  -H "X-Device-Key: my_esp32_secret_123" `
  -d "{\"deviceId\":\"esp32-01\",\"temperature\":28.5,\"humidity\":65.3,\"anomalyScore\":0.12,\"dataQuality\":1.0,\"lightLevel\":145,\"humanInside\":true,\"fanOn\":true,\"lightOn\":false}"
```

Expected:

```text
HTTP 201
records include temperature, humidity, anomalyScore, dataQuality, lightLevel, humanInside, fanOn, lightOn
Device esp32-01 is auto-created if it does not exist yet
```

Read latest/history:

```powershell
curl.exe "http://localhost:5000/api/sensors/latest?deviceId=esp32-01"
curl.exe "http://localhost:5000/api/sensors/history?deviceId=esp32-01&limit=10"
```

### 4. Manual Command Queue For ESP32

Create a command:

```powershell
curl.exe -X POST http://localhost:5000/api/devices/command `
  -H "Content-Type: application/json" `
  -d "{\"deviceId\":\"esp32-01\",\"device\":\"fan\",\"action\":\"on\"}"
```

Poll like ESP32:

```powershell
curl.exe "http://localhost:5000/api/devices/command?deviceId=esp32-01" `
  -H "X-Device-Key: my_esp32_secret_123"
```

Expected: the response has a `commands` array. If there is a command, take `commandId` and then ack:

```powershell
curl.exe -X POST http://localhost:5000/api/devices/status `
  -H "Content-Type: application/json" `
  -H "X-Device-Key: my_esp32_secret_123" `
  -d "{\"deviceId\":\"esp32-01\",\"fanOn\":true,\"lightOn\":false,\"executedCommands\":[{\"commandId\":\"<commandId>\",\"status\":\"executed\"}]}"
```

You can use the single-command ack endpoint:

```powershell
curl.exe -X POST http://localhost:5000/api/devices/command/ack `
  -H "Content-Type: application/json" `
  -H "X-Device-Key: my_esp32_secret_123" `
  -d "{\"commandId\":\"<commandId>\",\"success\":true,\"message\":\"OK\"}"
```

### 5. User Flow In Swagger

Open:

```text
http://localhost:5000/api-docs
```

Test flow for the parts that require JWT:

1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. Copy `data.token`, click Authorize, and enter `Bearer <token>`
4. `POST /api/homes`
5. `GET /api/homes/mine`
6. `POST /api/homes/:homeId/areas`
7. `POST /api/devices` with `homeId`, `name`, `type`, optional `externalDeviceId: "esp32-01"`
8. `PATCH /api/devices/:id/status` with `{"action":"on"}`, `{"action":"off"}`, or `{"action":"auto"}`
9. `GET /api/sensors/latest?deviceId=esp32-01`
10. Try CRUD for `threshold-rules`, `schedules`, `alerts`

If admin permission is needed:

1. Register a normal user.
2. Go to the MongoDB `users` collection and change `role` to `admin`.
3. Log in again to get a new token.
4. Test `/api/admin/*`.

## Frontend Tests

Run the UI with the real backend:

```bash
cd smart-home-system-main
npm run dev
```

Open:

```text
http://localhost:5173
```

Manual tests:

```text
Login/Register       -> calls /api/auth/*
Dashboard            -> reads /api/sensors/latest?deviceId=esp32-01
History              -> reads homes/devices/sensor devices/history
Settings             -> manages home, area, device, threshold, schedule
Console              -> admin/user API console, command preview and command queue
Control component    -> sends /api/devices/command for fan/light
Mock mode warning    -> set VITE_USE_MOCK_DATA=true, then npm run dev
```

Check frontend quality:

```bash
cd smart-home-system-main
npm run lint
npm run build
npm run preview
```

## Firmware Tests

### 1. Build

```bash
cd esp32-freertos-tinyml-monitor-main
pio run -e yolo_uno
```

Expected: successful build for the `yolo_uno` board.

### 2. Flash And Monitor

```bash
pio run -e yolo_uno -t upload --upload-port COM5
pio device monitor -p COM5 -b 115200
```

Expected:

```text
WiFi connected
[PIR] raw=...
[LIGHT] raw=..., threshold=..., dark=...
[AUTO] human=..., finalD13=..., fan_D12=...
[UPLOAD] Health check: HTTP 200
[UPLOAD] Success: HTTP 201
[CMND_POLL] Poll ...
```

### 3. Sensor Hardware

```text
DHT20      -> LCD displays Temp/Humi; logs do not contain "Failed to read from DHT sensor!"
PIR        -> after PIR_WARMUP_TIME_MS, motion makes human_inside=true
Light AO   -> raw logs change when covered/exposed to light
LCD        -> alternates between Temp/Humi and PIR/Light
```

### 4. Relay Hardware

```text
Cover light sensor + trigger PIR motion -> D13 ON if light is auto
No PIR motion                           -> D13 OFF and fan OFF in auto
Raise temperature > FAN_TEMP_THRESHOLD  -> fan ON if there is PIR motion and fan is auto
Send command light/on from backend      -> D13 forced ON
Send command light/off from backend     -> D13 forced OFF
Send command light/auto from backend    -> D13 returns to auto
Send command fan/on or fan/off          -> fan relay changes state
Send command fan/auto                   -> fan returns to auto
```

### 5. Network From ESP32 To Backend

If laptop `curl.exe http://localhost:5000/api/health` works but ESP32 upload fails:

```text
1. Check that CE_BACKEND_URL uses the correct laptop LAN IP, for example http://192.168.1.10:5000
2. ESP32 and laptop must be on the same network or must be routable to each other
3. Windows Firewall must allow Node.js or TCP port 5000
4. Backend CLIENT_URL does not affect ESP32, but DEVICE_SECRET_KEY must match CE_DEVICE_SECRET
5. Check Serial log HTTP code/response to identify 401, timeout, or connection failure
```

## End-To-End Test Checklist

1. Run the stack:

```bash
docker compose up -d
```

2. Backend health:

```powershell
curl.exe http://localhost:5000/api/health
```

3. Send simulated sensor data:

```powershell
curl.exe -X POST http://localhost:5000/api/sensors/data `
  -H "Content-Type: application/json" `
  -H "X-Device-Key: my_esp32_secret_123" `
  -d "{\"deviceId\":\"esp32-01\",\"temperature\":28.5,\"humidity\":65.3,\"anomalyScore\":0.12,\"dataQuality\":1.0,\"lightLevel\":145,\"humanInside\":true,\"fanOn\":true,\"lightOn\":false}"
```

4. Open frontend:

```text
http://localhost:5173
```

5. Register/login user, then check Dashboard/History.

6. Create a fan/light command:

```powershell
curl.exe -X POST http://localhost:5000/api/devices/command `
  -H "Content-Type: application/json" `
  -d "{\"deviceId\":\"esp32-01\",\"device\":\"light\",\"action\":\"on\"}"
```

7. Poll command:

```powershell
curl.exe "http://localhost:5000/api/devices/command?deviceId=esp32-01" `
  -H "X-Device-Key: my_esp32_secret_123"
```

8. Build frontend:

```bash
cd smart-home-system-main
npm run lint
npm run build
```

9. Check backend syntax:

```bash
cd smart-home-system-main/backend
npm run check
```

10. Build firmware:

```bash
cd esp32-freertos-tinyml-monitor-main
pio run -e yolo_uno
```

## Troubleshooting

| Symptom                      | Check                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend reports missing env  | Create `backend/.env` from `.env.example`                                                                                                     |
| Mongo connection fail        | Docker Mongo is not healthy, local Mongo is not running, or `MONGODB_URI` is wrong                                                            |
| Frontend API call fails      | Check `VITE_API_BASE_URL`, backend port 5000, CORS `CLIENT_URL`                                                                               |
| ESP32 receives 401           | `CE_DEVICE_SECRET` does not match `DEVICE_SECRET_KEY`                                                                                         |
| ESP32 timeout                | Wrong `CE_BACKEND_URL`, different network, firewall blocking port 5000                                                                        |
| `pio` is not recognized      | Open a PlatformIO terminal or add PlatformIO to PATH; on this machine, you can run `C:\Users\tongh\.platformio\penv\Scripts\pio.exe` directly |
| ESP32 poll has no command    | `/api/devices/command` has not been created, `deviceId` is wrong, or the command has expired                                                  |
| D13 does not turn on in dark | PIR motion is also required; check PIR warmup and `LIGHT_THRESHOLD`                                                                           |
| Fan does not turn on in auto | PIR motion and temperature > `FAN_TEMP_THRESHOLD` are required                                                                                |
