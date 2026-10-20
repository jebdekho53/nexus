"""Convert Futuristic Blue Matrix Software Logo into all application, installer, and website assets."""
import base64
import io
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src_img_path = ROOT / 'Futuristic Blue Matrix Software Logo.png'
if not src_img_path.exists():
    raise FileNotFoundError(f"Missing source logo: {src_img_path}")

im = Image.open(src_img_path).convert('RGBA')
print(f"Loaded logo: {im.size}, mode: {im.mode}")

# 1. Generate 512x512 RGBA PNG
im_512 = im.resize((512, 512), Image.Resampling.LANCZOS)
b512 = io.BytesIO()
im_512.save(b512, format='PNG')
png_512_data = b512.getvalue()

# 2. Generate 256x256 RGBA PNG
im_256 = im.resize((256, 256), Image.Resampling.LANCZOS)
b256 = io.BytesIO()
im_256.save(b256, format='PNG')
png_256_data = b256.getvalue()

# 3. Generate 1024x1024 RGBA PNG
im_1024 = im.resize((1024, 1024), Image.Resampling.LANCZOS)
b1024 = io.BytesIO()
im_1024.save(b1024, format='PNG')
png_1024_data = b1024.getvalue()

# 4. Generate multi-resolution Windows .ico
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
b_ico = io.BytesIO()
im.save(b_ico, format='ICO', sizes=ico_sizes)
ico_data = b_ico.getvalue()
print(f"Generated ICO: {len(ico_data):,} bytes")

# 5. Generate macOS .icns with Apple PNG chunks
im_128 = im.resize((128, 128), Image.Resampling.LANCZOS)
b128 = io.BytesIO()
im_128.save(b128, format='PNG')
d128 = b128.getvalue()

chunks = [
    (b'ic07', d128),
    (b'ic08', png_256_data),
    (b'ic09', png_512_data),
    (b'ic10', png_1024_data),
]
total_len = 8 + sum(8 + len(d) for tag, d in chunks)
icns_data = bytearray(b'icns' + struct.pack('>I', total_len))
for tag, d in chunks:
    chunk_len = 8 + len(d)
    icns_data.extend(tag + struct.pack('>I', chunk_len) + d)
print(f"Generated ICNS: {len(icns_data):,} bytes")

# 6. Generate SVG containing high-res base64 PNG
b64_png = base64.b64encode(png_512_data).decode('ascii')
svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_png}" width="512" height="512"/>
</svg>
'''

# 7. Generate JPEG version for jpg assets
bg = Image.new('RGB', im_512.size, (14, 20, 24))
bg.paste(im_512, mask=im_512.split()[3])
b_jpg = io.BytesIO()
bg.save(b_jpg, format='JPEG', quality=95)
jpg_data = b_jpg.getvalue()

# Write to all destinations
destinations = {
    ROOT / 'resources' / 'icon.png': png_512_data,
    ROOT / 'resources' / 'matrix.ico': ico_data,
    ROOT / 'resources' / 'Matrix.icns': bytes(icns_data),
    ROOT / 'src' / 'renderer' / 'assets' / 'matrix-mark.png': png_512_data,
    ROOT / 'src' / 'renderer' / 'assets' / 'matrix-mark.svg': svg_content.encode('utf-8'),
    ROOT / 'src' / 'renderer' / 'assets' / 'matrix-logo.jpg': jpg_data,
    ROOT / 'services' / 'control-plane' / 'assets' / 'matrix-logo.svg': svg_content.encode('utf-8'),
    ROOT / 'services' / 'control-plane' / 'assets' / 'matrix-mark.png': png_512_data,
    ROOT / 'services' / 'control-plane' / 'assets' / 'matrix-logo.jpg': jpg_data,
    ROOT / 'services' / 'control-plane' / 'assets' / 'matrix.ico': ico_data,
}

for path, data in destinations.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"Wrote {path.relative_to(ROOT)} ({len(data):,} bytes)")

print("All logo assets updated successfully!")
