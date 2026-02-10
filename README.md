# DDPM Cat Image Generation Pipeline

Download a public diffusion model checkpoint from HuggingFace Hub (google/ddpm-cat-256), generate 2 preview samples, gate it with a slideshow for me to review, then generate a full batch of samples.

## Blocks

**DownloadCheckpoint** — Download the model from HuggingFace Hub to the local cache. No credentials needed (public model). Output the model path so downstream blocks can load from cache.

**GeneratePreview** — Load the checkpoint, swap to DDIMScheduler for 10-step inference, and generate 2 samples. Use a manual denoising loop (not the pipeline's `__call__`) so you can emit per-step denoising metrics. Register each generated image as an artifact. Pass `model_path` through so GenerateFull can use it. Call `ctx.check_pause()` inside the denoising loop.

**GenerateFull** — Same structure as GeneratePreview but with offset seeds to get different images. Register artifacts tagged as "full" instead of "preview".

Wire these into a linear DAG: DownloadCheckpoint → GeneratePreview → GenerateFull.

## Gate

Pause the run after GeneratePreview succeeds so I can review preview samples before the full batch runs.

## Metrics

Both generation blocks should emit these three metrics at every inference step, with `step=step_idx` and `sample_index=sample_idx` as labels:

- `denoise/noise_level` — derived from the scheduler's cumulative alpha schedule: `1 - alpha_cumprod[t]`. Starts near 1.0 (pure noise), decays toward 0 (clean image).
- `denoise/predicted_noise_mse` — mean squared value of the UNet's noise prediction: `(noise_pred ** 2).mean()`. Shows model prediction magnitude at each step.
- `denoise/snr` — signal-to-noise ratio: `alpha_cumprod[t] / (1 - alpha_cumprod[t])`, clamped to 1000. Starts near 0, rises sharply toward the end.

## Artifacts

Register every generated image as an artifact with schema type `generated_sample`. Include tags distinguishing preview vs full and the sample index. Save as PNGs.

## Inspectors

Build three inspectors. All should be multi-run capable — handle an array of run IDs and render each run's data distinctly, falling back to single-run mode via `init.run_id` when `runs[]` is not provided. All should backfill historical data on init before subscribing to real-time events.

**metric_line_chart** — Interactive line chart for denoising metrics. Include a metric picker dropdown that auto-populates by querying available metrics. Support EMA smoothing toggle, log/linear scale toggle, and hover tooltips. In multi-run mode, render each run as a differently-colored line. Attach as "Denoising Trajectory" with the three denoise/* metric names.

**scalar_summary** — Card grid dashboard that auto-discovers all metrics the run emits. Each metric gets a card with the current value, trend arrow (up/down/flat based on last 5 values), min/max/mean stats, and a sparkline of the last 100 values. Attach as "Quality Dashboard".

**slideshow** — Image gallery for generated sample artifacts. Search for existing artifacts on init and subscribe to `artifact_written` events for new ones. For each artifact, verify it's an image (by content type, file extension, or schema type), fetch the binary data, and display as thumbnails with a lightbox on click. Attach as "Generated Samples" filtered to `schema_type: generated_sample`.
