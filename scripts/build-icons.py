# Builds every icon size from the official app icon (assets/app-icon-source.png) WITHOUT altering it:
# only uniform resizing, plus plain padding (same off-white as the image background) where a
# platform requires a safe zone (maskable / adaptive). Nothing is cropped.
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'app-icon-source.png')
BG = (252, 251, 250)
src = Image.open(SRC).convert('RGB')

def fit(size, scale=1.0):
    inner = round(size * scale)
    img = src.resize((inner, inner), Image.LANCZOS)
    if scale == 1.0:
        return img
    canvas = Image.new('RGB', (size, size), BG)
    canvas.paste(img, ((size - inner) // 2, (size - inner) // 2))
    return canvas

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)

if len(sys.argv) > 2 and sys.argv[1] == '--android':
    out = sys.argv[2]
    for d, s in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        save(fit(s), os.path.join(out, f'mipmap-{d}', 'ic_launcher.png'))
    save(fit(320), os.path.join(out, 'drawable', 'splash_logo.png'))
    # zellige tile for the native splash background
    tile = Image.new('RGB', (8, 8), (250, 246, 238))
    save(tile, os.path.join(out, 'drawable', 'splash_pattern.png'))
else:
    pub = os.path.join(ROOT, 'public', 'icons')
    save(fit(512), os.path.join(pub, 'app-icon.png'))
    save(fit(192), os.path.join(pub, 'icon-192.png'))
    save(fit(512), os.path.join(pub, 'icon-512.png'))
    save(fit(512, 0.8), os.path.join(pub, 'maskable-512.png'))
    save(fit(180), os.path.join(pub, 'apple-touch-icon.png'))
    save(fit(64), os.path.join(ROOT, 'public', 'favicon.png'))
    print('icons ok')
