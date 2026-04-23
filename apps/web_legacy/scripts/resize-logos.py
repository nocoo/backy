#!/usr/bin/env python3
"""
Generate all derived logo assets from a single master logo.png.

Master: <project-root>/logo.png (high-res, transparent RGBA)

Outputs:
  public/logo-24.png          — sidebar icon (<img src>)
  public/logo-80.png          — login page logo (<img src>)
  src/app/icon.png             — 32x32 browser tab icon (Next.js file convention)
  src/app/apple-icon.png       — 180x180 Apple touch icon (Next.js file convention)
  src/app/favicon.ico          — multi-size 16+32 ICO (Next.js file convention)
  src/app/opengraph-image.png  — 1200x630 OG social card (Next.js file convention)

Usage:
  python3 scripts/resize-logos.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "logo.png"
PUBLIC = ROOT / "public"
APP = ROOT / "src" / "app"

# Brand background color for OG image canvas (dark navy)
OG_BG_COLOR = (15, 23, 42)  # Tailwind slate-900


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not MASTER.exists():
        raise FileNotFoundError(f"Master logo not found: {MASTER}")

    master = Image.open(MASTER).convert("RGBA")
    print(f"Master: {master.size[0]}x{master.size[1]} {master.mode}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)

    # ── public/ assets (referenced by <img src> in components) ──
    resize(master, 24).save(PUBLIC / "logo-24.png", "PNG")
    print("  public/logo-24.png (24x24)")

    resize(master, 80).save(PUBLIC / "logo-80.png", "PNG")
    print("  public/logo-80.png (80x80)")

    # ── src/app/ metadata icons (Next.js file-based convention) ──
    icon32 = resize(master, 32)
    icon32.save(APP / "icon.png", "PNG")
    print("  src/app/icon.png (32x32)")

    apple = resize(master, 180)
    apple.save(APP / "apple-icon.png", "PNG")
    print("  src/app/apple-icon.png (180x180)")

    # favicon.ico — multi-size 16+32
    icon16 = resize(master, 16)
    icon32_ico = resize(master, 32)
    icon16.save(
        APP / "favicon.ico",
        format="ICO",
        append_images=[icon32_ico],
        sizes=[(16, 16), (32, 32)],
    )
    print("  src/app/favicon.ico (16+32)")

    # opengraph-image.png — 1200x630, RGB, brand bg, centered logo
    og_w, og_h = 1200, 630
    og = Image.new("RGB", (og_w, og_h), OG_BG_COLOR)
    logo_size = int(og_h * 0.4)  # ~40% of canvas height
    logo_resized = resize(master, logo_size)
    # Center the logo
    x = (og_w - logo_size) // 2
    y = (og_h - logo_size) // 2
    og.paste(logo_resized, (x, y), logo_resized)  # Use alpha as mask
    og.save(APP / "opengraph-image.png", "PNG")
    print(f"  src/app/opengraph-image.png ({og_w}x{og_h})")

    print("\nDone. All derived assets generated.")


if __name__ == "__main__":
    main()
