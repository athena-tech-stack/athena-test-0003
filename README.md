 Download a public diffusion model checkpoint from
 HuggingFace Hub
 (google/ddpm-cat-256), generate 2 preview samples,
  gate it with a
 slideshow for me to review, then generate 10 full
 samples.

 Break this into these blocks:

 1. DownloadCheckpoint — Download the model from
 HuggingFace Hub to the
    local cache. No credentials needed (public
 model). Output: local
    model path as an artifact.

 2. GeneratePreview — Load the checkpoint (swap to
 DDIMScheduler for
    50-step inference), generate 2 cat face
 samples. Input: model path
    from DownloadCheckpoint. Output: generated
 images as artifacts.

 3. Gate after GeneratePreview — Pause the run and
 attach a slideshow
    inspector so I can review the 2 preview samples
  before continuing.

 4. GenerateFull — Generate 10 samples using the
 same checkpoint and
    scheduler. Input: model path passed through
 GeneratePreview.
    Output: generated images as artifacts.

 ## Metrics

 GeneratePreview and GenerateFull should emit
 per-step denoising
 metrics during each sample's inference loop (50
 steps):

 - `denoise/noise_level` — derived from scheduler
 alpha schedule, starts ~1.0, decays to ~0
 - `denoise/predicted_noise_mse` — prediction error
  from model output
 - `denoise/snr` — signal-to-noise ratio from
 alpha_cumprod schedule

 Use step= for inference step and label
 sample_index= to distinguish
 samples.

 ## Inspectors

 Attach these inspectors to every run:

 - `metric-line-chart` — denoising trajectory
 (select denoise/* metrics)
 - `scalar-summary` — live dashboard of quality/*
 metrics with sparklines
 - `slideshow` - generated samples as a slideshow

 All inspectors must be multi-run by default: when
 multiple runs are
 selected, render each run's differently-colored
 line on the same chart. Do something similar for the generated samples

 ## Gate (by default)

 - Predicate: AfterStep on GeneratePreview (status:
  succeeded)
 - Action: pause
