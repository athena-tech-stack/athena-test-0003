import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

interface MetricData {
  values: number[];
  current: number;
  min: number;
  max: number;
  avg: number;
}

interface RunData {
  run_id: string;
  run_number?: number;
  name?: string;
  color: string;
  metrics: Record<string, MetricData>;
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

function Sparkline({ values, color, width = 80, height = 24 }: { values: number[], color: string, width?: number, height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Compute min/max
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = width / Math.max(values.length - 1, 1);
    values.forEach((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  }, [values, color, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

function ScalarSummary() {
  const [runs, setRuns] = useState<Record<string, RunData>>({});
  const [allMetricNames, setAllMetricNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const { type, ...data } = event.data;

      if (type === "init") {
        // Can receive multiple run_ids for multi-run view
        const runIds = data.run_ids || [data.run_id];
        const metricNames = data.inputs?.metric_names || ["quality/samples_generated"];

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

          // Subscribe to quality/* metrics for this run
          window.parent.postMessage({
            type: "subscribe_events",
            subscription_id: `metrics-${runId}`,
            run_id: runId,
            filter: {
              event_type: "metric"
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

        // Only track quality/* metrics
        if (!metricName.startsWith("quality/")) return;

        setAllMetricNames(prev => new Set([...prev, metricName]));

        setRuns(prev => {
          const runData = prev[runId];
          if (!runData) return prev;

          const existing = runData.metrics[metricName] || { values: [], current: 0, min: Infinity, max: -Infinity, avg: 0 };
          const newValues = [...existing.values, data.event.value];
          const sum = newValues.reduce((a, b) => a + b, 0);

          return {
            ...prev,
            [runId]: {
              ...runData,
              metrics: {
                ...runData.metrics,
                [metricName]: {
                  values: newValues.slice(-50), // Keep last 50 for sparkline
                  current: data.event.value,
                  min: Math.min(existing.min, data.event.value),
                  max: Math.max(existing.max, data.event.value),
                  avg: sum / newValues.length,
                }
              }
            }
          };
        });
      }

      // Handle backfill response
      if (type === "data" && data.request_id?.startsWith("backfill-") && data.events) {
        const runId = data.request_id.replace("backfill-", "");
        data.events.forEach((evt: any) => {
          if (evt.event_type === "metric" && evt.name.startsWith("quality/")) {
            setAllMetricNames(prev => new Set([...prev, evt.name]));
            setRuns(prev => {
              const runData = prev[runId];
              if (!runData) return prev;
              const existing = runData.metrics[evt.name] || { values: [], current: 0, min: Infinity, max: -Infinity, avg: 0 };
              const newValues = [...existing.values, evt.value];
              const sum = newValues.reduce((a: number, b: number) => a + b, 0);
              return {
                ...prev,
                [runId]: {
                  ...runData,
                  metrics: {
                    ...runData.metrics,
                    [evt.name]: {
                      values: newValues.slice(-50),
                      current: evt.value,
                      min: Math.min(existing.min, evt.value),
                      max: Math.max(existing.max, evt.value),
                      avg: sum / newValues.length,
                    }
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

  const metricNames = Array.from(allMetricNames).sort();

  return (
    <div style={{ height: "100%", background: "#1a1a2e", color: "#eee", fontFamily: "sans-serif", overflow: "auto" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #333", fontSize: "14px", fontWeight: 600 }}>
        Quality Metrics
      </div>
      <div style={{ padding: "12px" }}>
        {metricNames.length === 0 ? (
          <div style={{ color: "#666", textAlign: "center", padding: "20px" }}>
            Waiting for quality/* metrics...
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#888" }}>Metric</th>
                {Object.entries(runs).map(([runId, runData]) => (
                  <th key={runId} style={{ textAlign: "right", padding: "6px 8px" }}>
                    <span style={{ color: runData.color }}>●</span>{" "}
                    {runData.name || `#${runData.run_number || runId.slice(0, 6)}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricNames.map(name => (
                <tr key={name} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "8px", fontWeight: 500 }}>{name.replace("quality/", "")}</td>
                  {Object.entries(runs).map(([runId, runData]) => {
                    const metric = runData.metrics[name];
                    if (!metric) {
                      return <td key={runId} style={{ textAlign: "right", padding: "8px", color: "#444" }}>—</td>;
                    }
                    return (
                      <td key={runId} style={{ textAlign: "right", padding: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                          <Sparkline values={metric.values} color={runData.color} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>{metric.current.toFixed(2)}</div>
                            <div style={{ fontSize: "10px", color: "#666" }}>
                              min: {metric.min.toFixed(2)} / max: {metric.max.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ScalarSummary />);
