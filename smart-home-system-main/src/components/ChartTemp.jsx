import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useEffect, useState } from "react";
import { getHistorySensor } from "../api/sensor";

function ChartTemp() {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getHistorySensor();

        const formatted = res.data.map((item) => ({
          time: new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          }),
          temperature: item.temperature,
          humidity: item.humidity
        }));

        setData(formatted.reverse());
        setError("");
      } catch (fetchError) {
        setError(fetchError.message);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <div style={{ color: "#991b1b" }}>{error}</div>;
  }

  if (!data.length) return <div>Loading chart...</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0, color: "#0f172a" }}>Sensor Trend</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#64748b" />
          <YAxis stroke="#64748b" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#ef4444"
            strokeWidth={3}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="humidity"
            stroke="#2563eb"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ChartTemp;

