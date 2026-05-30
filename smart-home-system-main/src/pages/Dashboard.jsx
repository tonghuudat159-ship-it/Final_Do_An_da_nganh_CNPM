import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getStoredUser, logoutUser } from "../api/auth";
import { USE_MOCK_DATA } from "../api/client";
import { getLatestSensor } from "../api/sensor";
import ChartTemp from "../components/ChartTemp";
import Control from "../components/Control";

const pageStyle = {
  minHeight: "100vh",
  padding: "32px 20px 48px",
  background:
    "radial-gradient(circle at top, rgba(56,189,248,0.22), transparent 30%), linear-gradient(180deg, #e0f2fe 0%, #f8fafc 38%, #eef2ff 100%)",
  fontFamily: '"Segoe UI", sans-serif'
};

const shellStyle = {
  maxWidth: "1120px",
  margin: "0 auto"
};

const heroStyle = {
  background: "#0f172a",
  color: "#f8fafc",
  borderRadius: "20px",
  padding: "28px",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)"
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "18px",
  marginTop: "22px"
};

const cardStyle = {
  background: "rgba(255,255,255,0.92)",
  borderRadius: "8px",
  padding: "22px",
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
  marginTop: "20px"
};

const metricCardStyle = {
  borderRadius: "8px",
  padding: "20px",
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.14)"
};

const valueStyle = {
  fontSize: "2.1rem",
  fontWeight: 800,
  lineHeight: 1.1
};

const formatMetric = (value, formatter = (item) => item) =>
  value === null || value === undefined ? "No data" : formatter(value);

function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState({ fan: "off", light: "off" });
  const [backendOnline, setBackendOnline] = useState(false);
  const [user] = useState(() => getStoredUser());
  const [error, setError] = useState("");
  const [refreshDevicesAt] = useState(0);
  const [pendingDevice] = useState("");

  const handleLogout = () => {
    logoutUser();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const fetchSensor = async () => {
      try {
        const res = await getLatestSensor();
        const latest = res.data;
        setData(latest);
        if (latest) {
          setDeviceStatus({
            fan: latest.fanOn ? "on" : "off",
            light: latest.lightOn ? "on" : "off"
          });
        }
        setBackendOnline(!res.fallback);
        setError("");
      } catch (fetchError) {
        setData(null);
        setBackendOnline(false);
        setError(fetchError.message);
      }
    };

    fetchSensor();
    const interval = setInterval(fetchSensor, 3000);
    return () => clearInterval(interval);
  }, [refreshDevicesAt]);

  const hasData = Boolean(data);

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <section style={heroStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              flexWrap: "wrap"
            }}
          >
            <div>
              <div style={{ color: "#7dd3fc", fontWeight: 700, letterSpacing: "0.08em" }}>
                ESP32-01
              </div>
              <h1 style={{ fontSize: "2.2rem", margin: "10px 0 0" }}>Smart Home Dashboard</h1>
            </div>

            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: "#cbd5e1" }}>
                {user?.fullName || user?.username || "Guest"}
              </div>
              <Link to="/history" style={{ color: "#f8fafc" }}>
                History
              </Link>
              <Link to="/settings" style={{ color: "#f8fafc" }}>
                Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  border: "1px solid rgba(248,250,252,0.25)",
                  background: "transparent",
                  color: "#f8fafc",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  cursor: "pointer"
                }}
              >
                Logout
              </button>
            </div>
          </div>

          <div style={gridStyle}>
            <div style={metricCardStyle}>
              <div style={{ color: "#94a3b8", marginBottom: "8px" }}>Backend</div>
              <div style={valueStyle}>{backendOnline ? "Online" : "Offline"}</div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ color: "#94a3b8", marginBottom: "8px" }}>Temperature</div>
              <div style={valueStyle}>
                {formatMetric(data?.temperature, (value) => `${value.toFixed(1)} C`)}
              </div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ color: "#94a3b8", marginBottom: "8px" }}>Humidity</div>
              <div style={valueStyle}>
                {formatMetric(data?.humidity, (value) => `${value.toFixed(1)}%`)}
              </div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ color: "#94a3b8", marginBottom: "8px" }}>Light level</div>
              <div style={valueStyle}>{formatMetric(data?.lightLevel)}</div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ color: "#94a3b8", marginBottom: "8px" }}>PIR motion</div>
              <div style={valueStyle}>
                {hasData ? (data.humanInside ? "Motion" : "Clear") : "No data"}
              </div>
            </div>
          </div>
        </section>

        {!hasData && !error && (
          <section
            style={{
              ...cardStyle,
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8"
            }}
          >
            No ESP32 data yet
          </section>
        )}

        {USE_MOCK_DATA && (
          <section
            style={{
              ...cardStyle,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e"
            }}
          >
            Demo mock data mode
          </section>
        )}

        {error && (
          <section
            style={{
              ...cardStyle,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#9f1239"
            }}
          >
            {error}
          </section>
        )}

        <section style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px"
            }}
          >
            <div>
              <div style={{ color: "#64748b", marginBottom: "6px" }}>Latest update</div>
              <strong>{hasData ? new Date(data.timestamp).toLocaleString() : "No data yet"}</strong>
            </div>

            <div>
              <div style={{ color: "#64748b", marginBottom: "6px" }}>Fan status</div>
              <strong style={{ color: deviceStatus.fan === "on" ? "#16a34a" : "#64748b" }}>
                {deviceStatus.fan}
              </strong>
            </div>

            <div>
              <div style={{ color: "#64748b", marginBottom: "6px" }}>D13 light status</div>
              <strong style={{ color: deviceStatus.light === "on" ? "#d97706" : "#64748b" }}>
                {deviceStatus.light}
              </strong>
            </div>
          </div>
        </section>

        {hasData && (
          <section style={cardStyle}>
            <ChartTemp />
          </section>
        )}

        <section style={cardStyle}>
          <Control
            refreshKey={refreshDevicesAt}
            onStatusChange={setDeviceStatus}
            pendingDevice={pendingDevice}
          />
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
