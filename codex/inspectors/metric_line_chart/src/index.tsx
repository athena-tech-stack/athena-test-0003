import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

interface MetricPoint {
  value: number;
  step: number;
  sample_index?: number;
  timestamp: string;
}

interface RunData {
  run_id: string;
  run_number?: number;
  name?: string;
  color: string;
  metrics: Record<string, MetricPoint[]>;
}

// Color palette for multi-run support
const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

function MetricLineChart() {
  const [runs, setRuns] = useState<Record<string, RunData>>({});
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [allMetricNames, setAllMetricNames] = useState<Set<string>>(new Set());
  const colorIndex = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    // Collect all data points for selected metrics
    const allPoints: { runId: string; metric: string; point: MetricPoint }[] = [];
    let maxStep = 0;
    let minValue = Infinity;
    let maxValue = -Infinity;

    Object.entries(runs).forEach(([runId, runData]) => {
      selectedMetrics.forEach(metricName => {
        const points = runData.metrics[metricName] || [];
        points.forEach(point => {
          allPoints.push({ runId, metric: metricName, point });
          maxStep = Math.max(maxStep, point.step);
          minValue = Math.min(minValue, point.value);
          maxValue = Math.max(maxValue, point.value);
        });
      });
    });

    if (allPoints.length === 0) {
      ctx.fillStyle = "#666";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data - select metrics below", width / 2, height / 2);
      return;
    }

    // Add padding to value range
    const valueRange = maxValue - minValue || 1;
    minValue -= valueRange * 0.05;
    maxValue += valueRange * 0.05;

    // Draw grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const value = maxValue - ((maxValue - minValue) * i) / 5;
      ctx.fillStyle = "#666";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(value.toFixed(3), padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const x = padding.left + (chartWidth * i) / 5;
      const step = Math.round((maxStep * i) / 5);
      ctx.fillText(step.toString(), x, height - padding.bottom + 20);
    }

    // Draw lines for each run and metric combination
    Object.entries(runs).forEach(([runId, runData]) => {
      selectedMetrics.forEach(metricName => {
        const points = runData.metrics[metricName] || [];
        if (points.length === 0) return;

        // Group by sample_index if present
        const grouped: Record<string, MetricPoint[]> = {};
        points.forEach(p => {
          const key = p.sample_index?.toString() || "default";
          (grouped[key] = grouped[key] || []).push(p);
        });

        Object.values(grouped).forEach(group => {
          group.sort((a, b) => a.step - b.step);

          ctx.strokeStyle = runData.color;
          ctx.lineWidth = 2;
          ctx.beginPath();

          group.forEach((point, idx) => {
            const x = padding.left + (point.step / maxStep) * chartWidth;
            const y = padding.top + ((maxValue - point.value) / (maxValue - minValue)) * chartHeight;

            if (idx === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });

          ctx.stroke();
        });
      });
    });

    // Draw legend
    const legendY = height - 15;
    let legendX = padding.left;
    Object.entries(runs).forEach(([runId, runData]) => {
      ctx.fillStyle = runData.color;
      ctx.fillRect(legendX, legendY - 8, 12, 12);
      ctx.fillStyle = "#aaa";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      const label = runData.name || `Run ${runData.run_number || runId.slice(0, 8)}`;
      ctx.fillText(label, legendX + 16, legendY);
      legendX += ctx.measureText(label).width + 30;
    });

  }, [runs, selectedMetrics]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const { type, ...data } = event.data;

      if (type === "init") {
        // Can receive multiple run_ids for multi-run view
        const runIds = data.run_ids || [data.run_id];
        const metricNames = data.inputs?.metric_names || ["denoise/noise_level", "denoise/predicted_noise_mse", "denoise/snr"];

        setSelectedMetrics(metricNames);

        // Initialize run data structures
        runIds.forEach((runId: string, idx: number) => {
          setRuns(prev => ({
            ...prev,
            [runId]: {
              run_id: runId,
              run_number: data.run_numbers?.[idx],
              name: data.run_names?.[idx],
              color: COLORS[idx % COLORS.length],
              metrics: {},
            }
          }));

          // Subscribe to metrics for this run
          window.parent.postMessage({
            type: "subscribe_events",
            subscription_id: `metrics-${runId}`,
            run_id: runId,
            filter: {
              event_type: "metric",
              names: metricNames
            }
          }, "*");

          // Backfill existing metrics
          window.parent.postMessage({
            type: "query_events",
            request_id: `backfill-${runId}`,
            run_id: runId,
            filter: {
              event_type: "metric"
            }
          }, "*");
        });
      }

      if (type === "event" && data.event?.event_type === "metric") {
        const runId = data.run_id || data.event.run_id;
        const metricName = data.event.name;

        setAllMetricNames(prev => new Set([...prev, metricName]));

        setRuns(prev => {
          const runData = prev[runId];
          if (!runData) return prev;

          const existingPoints = runData.metrics[metricName] || [];
          const newPoint: MetricPoint = {
            value: data.event.value,
            step: data.event.step ?? existingPoints.length,
            sample_index: data.event.sample_index,
            timestamp: data.event.timestamp,
          };

          return {
            ...prev,
            [runId]: {
              ...runData,
              metrics: {
                ...runData.metrics,
                [metricName]: [...existingPoints, newPoint],
              }
            }
          };
        });
      }

      // Handle backfill response
      if (type === "data" && data.request_id?.startsWith("backfill-") && data.events) {
        const runId = data.request_id.replace("backfill-", "");
        data.events.forEach((evt: any) => {
          if (evt.event_type === "metric") {
            setAllMetricNames(prev => new Set([...prev, evt.name]));
            setRuns(prev => {
              const runData = prev[runId];
              if (!runData) return prev;
              const existingPoints = runData.metrics[evt.name] || [];
              return {
                ...prev,
                [runId]: {
                  ...runData,
                  metrics: {
                    ...runData.metrics,
                    [evt.name]: [...existingPoints, {
                      value: evt.value,
                      step: evt.step ?? existingPoints.length,
                      sample_index: evt.sample_index,
                      timestamp: evt.timestamp,
                    }],
                  }
                }
              };
            });
          }
        });
      }
    };

    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "ready" }, "*");

    return () => window.removeEventListener("message", handler);
  }, []);

  const toggleMetric = (name: string) => {
    setSelectedMetrics(prev =>
      prev.includes(name)
        ? prev.filter(m => m !== name)
        : [...prev, name]
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#1a1a2e", color: "#eee", fontFamily: "sans-serif" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #333", fontSize: "14px", fontWeight: 600 }}>
        Denoising Metrics
      </div>
      <div style={{ flex: 1, padding: "8px" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid #333", display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {Array.from(allMetricNames).map(name => (
          <button
            key={name}
            onClick={() => toggleMetric(name)}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              border: "1px solid #444",
              borderRadius: "4px",
              background: selectedMetrics.includes(name) ? "#3b82f6" : "#2a2a3e",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<MetricLineChart />);
