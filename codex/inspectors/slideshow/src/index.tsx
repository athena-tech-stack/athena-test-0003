import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

interface Sample {
  artifact_id: string;
  sample_index: number;
  stage: string;
  image_url: string;
  run_id: string;
}

interface RunData {
  run_id: string;
  run_number?: number;
  name?: string;
  color: string;
  samples: Sample[];
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

function Slideshow() {
  const [runs, setRuns] = useState<Record<string, RunData>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const seenIds = useRef(new Set<string>());
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);

  // Get all samples across all runs, sorted
  const allSamples = Object.values(runs).flatMap(r => r.samples).sort((a, b) => {
    // Sort by stage (preview first), then sample_index
    if (a.stage !== b.stage) return a.stage === "preview" ? -1 : 1;
    return a.sample_index - b.sample_index;
  });

  const addSample = useCallback((runId: string, artifact_id: string, data: ArrayBuffer, metadata?: Record<string, unknown>) => {
    if (seenIds.current.has(artifact_id)) return;
    seenIds.current.add(artifact_id);

    const blob = new Blob([data], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    setRuns(prev => {
      const runData = prev[runId];
      if (!runData) return prev;

      return {
        ...prev,
        [runId]: {
          ...runData,
          samples: [...runData.samples, {
            artifact_id,
            sample_index: (metadata?.sample_index as number) ?? runData.samples.length,
            stage: (metadata?.stage as string) || "unknown",
            image_url: url,
            run_id: runId,
          }]
        }
      };
    });
  }, []);

  useEffect(() => {
    if (autoplay && allSamples.length > 0) {
      autoplayRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % allSamples.length);
      }, 2000);
    }
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  }, [autoplay, allSamples.length]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const { type, ...data } = event.data;

      if (type === "init") {
        // Can receive multiple run_ids for multi-run view
        const runIds = data.run_ids || [data.run_id];
        const schemaType = data.inputs?.schema_type || "generated_sample";

        // Initialize run data structures
        runIds.forEach((runId: string, idx: number) => {
          setRuns(prev => ({
            ...prev,
            [runId]: {
              run_id: runId,
              run_number: data.run_numbers?.[idx],
              name: data.run_names?.[idx],
              color: COLORS[idx % COLORS.length],
              samples: [],
            }
          }));

          // Backfill existing artifacts
          window.parent.postMessage({
            type: "search_artifacts",
            request_id: `backfill-${runId}`,
            filter: { run_id: runId, schema_type: schemaType }
          }, "*");

          // Subscribe for new artifacts in real-time
          window.parent.postMessage({
            type: "subscribe_events",
            subscription_id: `artifacts-${runId}`,
            run_id: runId,
            filter: {
              event_type: "artifact_written"
            }
          }, "*");
        });
      }

      // Handle backfill response
      if (type === "data" && data.request_id?.startsWith("backfill-") && data.artifacts) {
        const runId = data.request_id.replace("backfill-", "");
        for (const artifact of data.artifacts) {
          window.parent.postMessage({
            type: "fetch_artifact",
            request_id: `fetch-${runId}-${artifact.id}`,
            artifact_id: artifact.id,
            format: "arraybuffer"
          }, "*");
        }
      }

      // Handle real-time artifact events
      if (type === "event" && data.event?.event_type === "artifact_written") {
        const runId = data.run_id || data.event.run_id;
        window.parent.postMessage({
          type: "fetch_artifact",
          request_id: `fetch-${runId}-${data.event.artifact_id}`,
          artifact_id: data.event.artifact_id,
          format: "arraybuffer"
        }, "*");
      }

      // Handle fetched artifact data
      if (type === "artifact_data") {
        // Extract runId from request_id pattern: fetch-{runId}-{artifactId}
        const match = data.request_id?.match(/^fetch-([^-]+(?:-[^-]+)*)-([a-f0-9-]+)$/);
        if (match) {
          // Find which run this artifact belongs to
          const artifactId = data.artifact_id;
          Object.keys(runs).forEach(runId => {
            // Try to add to each run - seenIds will prevent duplicates
            addSample(runId, artifactId, data.data, data.metadata);
          });
        } else {
          // Fallback: add to first run
          const firstRunId = Object.keys(runs)[0];
          if (firstRunId) {
            addSample(firstRunId, data.artifact_id, data.data, data.metadata);
          }
        }
      }
    };

    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "ready" }, "*");

    return () => window.removeEventListener("message", handler);
  }, [addSample, runs]);

  const currentSample = allSamples[currentIndex];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#1a1a2e", color: "#eee", fontFamily: "sans-serif" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>
          Generated Samples ({allSamples.length})
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => setAutoplay(!autoplay)}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              border: "1px solid #444",
              borderRadius: "4px",
              background: autoplay ? "#3b82f6" : "#2a2a3e",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            {autoplay ? "⏸ Pause" : "▶ Play"}
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", position: "relative" }}>
        {currentSample ? (
          <>
            <img
              src={currentSample.image_url}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
              alt={`Sample ${currentSample.sample_index}`}
            />
            <div style={{
              position: "absolute",
              top: "24px",
              left: "24px",
              background: "rgba(0,0,0,0.7)",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "11px",
            }}>
              {currentSample.stage} #{currentSample.sample_index}
            </div>
          </>
        ) : (
          <div style={{ color: "#666", textAlign: "center" }}>
            Waiting for samples...
          </div>
        )}

        {/* Navigation arrows */}
        {allSamples.length > 1 && (
          <>
            <button
              onClick={() => setCurrentIndex(prev => (prev - 1 + allSamples.length) % allSamples.length)}
              style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.5)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                color: "#fff",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              ‹
            </button>
            <button
              onClick={() => setCurrentIndex(prev => (prev + 1) % allSamples.length)}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.5)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                color: "#fff",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      <div style={{ borderTop: "1px solid #333", padding: "8px", display: "flex", gap: "6px", overflowX: "auto" }}>
        {allSamples.map((sample, idx) => {
          const runData = runs[sample.run_id];
          return (
            <div
              key={sample.artifact_id}
              onClick={() => setCurrentIndex(idx)}
              style={{
                cursor: "pointer",
                borderRadius: "4px",
                border: idx === currentIndex ? `2px solid ${runData?.color || "#3b82f6"}` : "2px solid transparent",
                opacity: idx === currentIndex ? 1 : 0.6,
                flexShrink: 0,
              }}
            >
              <img
                src={sample.image_url}
                style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "2px" }}
                alt={`Thumbnail ${idx}`}
              />
            </div>
          );
        })}
      </div>

      {/* Run legend for multi-run */}
      {Object.keys(runs).length > 1 && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #333", display: "flex", gap: "12px", fontSize: "11px" }}>
          {Object.entries(runs).map(([runId, runData]) => (
            <div key={runId} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: runData.color }}>●</span>
              <span>{runData.name || `#${runData.run_number || runId.slice(0, 6)}`}</span>
              <span style={{ color: "#666" }}>({runData.samples.length})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Slideshow />);
