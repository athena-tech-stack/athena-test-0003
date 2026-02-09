"""Download a public diffusion model checkpoint from HuggingFace Hub."""

from athena import BlockContext, block


@block(
    name="DownloadCheckpoint",
    description="Download google/ddpm-cat-256 from HuggingFace Hub",
    outputs=["model_path"],
)
async def download_checkpoint(ctx: BlockContext) -> dict:
    """Download the DDPM cat model checkpoint.

    Downloads google/ddpm-cat-256 from HuggingFace Hub to local cache.
    No credentials needed as it's a public model.

    Returns:
        dict with model_path: local path to the cached model
    """
    from diffusers import DDPMPipeline

    await ctx.emit_progress(0, 1, "Downloading model from HuggingFace Hub...")

    # Download model to local cache (public model, no auth needed)
    model_id = "google/ddpm-cat-256"
    pipeline = DDPMPipeline.from_pretrained(model_id)

    # Get the cache path where the model was downloaded
    # The model is now in HF cache and can be loaded by downstream blocks
    model_path = model_id  # Downstream blocks use the same model_id to load from cache

    await ctx.emit_metric("download/complete", 1.0)
    await ctx.emit_progress(1, 1, "Model downloaded successfully")

    return {"model_path": model_path}
