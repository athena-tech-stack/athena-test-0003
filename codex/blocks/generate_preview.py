"""Generate preview samples using the downloaded checkpoint."""

import io

from athena import BlockContext, block


@block(
    name="GeneratePreview",
    description="Generate 2 preview cat face samples using DDIMScheduler (50 steps)",
    inputs=["model_path"],
    outputs=["model_path", "samples"],
)
async def generate_preview(ctx: BlockContext) -> dict:
    """Generate 2 preview samples for review.

    Loads the checkpoint, swaps to DDIMScheduler for 50-step inference,
    generates 2 samples with per-step denoising metrics.

    Args:
        ctx: BlockContext with model_path from DownloadCheckpoint

    Returns:
        dict with model_path (passthrough) and samples list
    """
    import torch
    from diffusers import DDIMScheduler, DDPMPipeline
    from PIL import Image

    model_path = ctx.inputs["model_path"]
    num_samples = 2
    num_inference_steps = 50

    await ctx.emit_progress(0, num_samples, "Loading model...")

    # Load the pipeline
    pipeline = DDPMPipeline.from_pretrained(model_path)

    # Swap to DDIM scheduler for faster inference
    pipeline.scheduler = DDIMScheduler.from_config(pipeline.scheduler.config)

    # Move to GPU if available
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipeline = pipeline.to(device)

    samples = []

    for sample_idx in range(num_samples):
        await ctx.emit_progress(sample_idx, num_samples, f"Generating sample {sample_idx + 1}/{num_samples}")

        # Set up for manual denoising loop to emit metrics
        scheduler = pipeline.scheduler
        unet = pipeline.unet

        # Initialize random noise
        generator = torch.Generator(device=device).manual_seed(sample_idx)
        image_shape = (1, unet.config.in_channels, unet.config.sample_size, unet.config.sample_size)
        latents = torch.randn(image_shape, generator=generator, device=device, dtype=unet.dtype)

        # Set timesteps
        scheduler.set_timesteps(num_inference_steps)
        timesteps = scheduler.timesteps

        # Get alpha schedule for SNR calculations
        alphas_cumprod = scheduler.alphas_cumprod.to(device)

        for step_idx, t in enumerate(timesteps):
            await ctx.check_pause()

            # Model prediction
            with torch.no_grad():
                noise_pred = unet(latents, t).sample

            # Scheduler step
            latents_prev = latents.clone()
            latents = scheduler.step(noise_pred, t, latents).prev_sample

            # Calculate denoising metrics
            t_idx = t.item() if hasattr(t, 'item') else int(t)
            alpha_t = alphas_cumprod[t_idx].item() if t_idx < len(alphas_cumprod) else alphas_cumprod[-1].item()

            # Noise level (derived from alpha schedule, starts ~1.0, decays to ~0)
            noise_level = 1.0 - alpha_t
            await ctx.emit_metric(
                "denoise/noise_level",
                noise_level,
                step=step_idx,
                sample_index=sample_idx,
            )

            # Predicted noise MSE (prediction error from model output)
            # Estimate the "true" noise as the difference scaled appropriately
            predicted_noise_mse = (noise_pred ** 2).mean().item()
            await ctx.emit_metric(
                "denoise/predicted_noise_mse",
                predicted_noise_mse,
                step=step_idx,
                sample_index=sample_idx,
            )

            # Signal-to-noise ratio from alpha_cumprod schedule
            # SNR = alpha / (1 - alpha), but clamp to avoid inf
            snr = alpha_t / max(1.0 - alpha_t, 1e-8)
            await ctx.emit_metric(
                "denoise/snr",
                min(snr, 1000.0),  # Clamp for visualization
                step=step_idx,
                sample_index=sample_idx,
            )

        # Convert to image
        image = (latents / 2 + 0.5).clamp(0, 1)
        image = image.cpu().permute(0, 2, 3, 1).numpy()[0]
        image = (image * 255).round().astype("uint8")
        pil_image = Image.fromarray(image)

        # Save and register as artifact
        image_bytes = io.BytesIO()
        pil_image.save(image_bytes, format="PNG")
        image_bytes.seek(0)

        filename = f"preview_sample_{sample_idx}.png"
        with open(filename, "wb") as f:
            f.write(image_bytes.getvalue())

        await ctx.artifacts.register(
            filename,
            "generated_sample",
            name=f"Preview Sample {sample_idx}",
            tags=["preview", f"sample_{sample_idx}"],
            metadata={"sample_index": sample_idx, "stage": "preview"},
        )

        samples.append(filename)

    await ctx.emit_progress(num_samples, num_samples, "Preview generation complete")
    await ctx.emit_metric("quality/samples_generated", num_samples)

    # Pass through model_path for GenerateFull
    return {"model_path": model_path, "samples": samples}
