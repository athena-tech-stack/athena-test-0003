"""DDPM Cat Image Generation Pipeline."""

from athena import entrypoint

from codex.blocks.download_checkpoint import download_checkpoint
from codex.blocks.generate_preview import generate_preview
from codex.blocks.generate_full import generate_full


@entrypoint(
    name="DDPMCatGeneration",
    description="Download DDPM cat model, generate preview, then full samples",
)
def ddpm_cat_generation(config) -> None:
    download_out = download_checkpoint().run()
    preview_out = generate_preview().run(model_path=download_out.model_path)
    generate_full().run(model_path=preview_out.model_path)
