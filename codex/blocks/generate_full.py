"""Generate full set of samples using the downloaded checkpoint."""

import io

from athena import BlockContext, block


@block(
    name="GenerateFull",
    description="Generate 10 full cat face samples using DDIMScheduler (50 steps)",
    inputs=["model_path"],
    outputs=["samples"],
)
async def generate_full(ctx: BlockContext) -> dict:
    """Generate 10 full samples.

    Loads the checkpoint, uses DDIMScheduler for 50-step inference,
    generates 10 samples with per-step denoising metrics.

    Args:
        ctx: BlockContext with model_path passed through from GeneratePreview

    Returns:
        dict with samples list
    """
    import torch
    from diffusers import DDIMScheduler, DDPMPipeline
    from PIL import Image

    model_path = ctx.inputs["model_path"]
    num_samples = 10
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

        # Initialize random noise (use offset seed to get different samples from preview)
        generator = torch.Generator(device=device).manual_seed(sample_idx + 100)
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
            predicted_noise_mse = (noise_pred ** 2).mean().item()
            await ctx.emit_metric(
                "denoise/predicted_noise_mse",
                predicted_noise_mse,
                step=step_idx,
                sample_index=sample_idx,
            )

            # Signal-to-noise ratio from alpha_cumprod schedule
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

        filename = f"full_sample_{sample_idx}.png"
        with open(filename, "wb") as f:
            f.write(image_bytes.getvalue())

        await ctx.artifacts.register(
            filename,
            "generated_sample",
            name=f"Full Sample {sample_idx}",
            tags=["full", f"sample_{sample_idx}"],
            metadata={"sample_index": sample_idx, "stage": "full"},
        )

        samples.append(filename)

    await ctx.emit_progress(num_samples, num_samples, "Full generation complete")
    await ctx.emit_metric("quality/samples_generated", num_samples)

    return {"samples": samples}
