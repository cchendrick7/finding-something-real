"""
Play Store feature graphic, 1024x500.

Shown at the top of the Play listing. Same brand system as the icon — sage
ground, Noto Serif Display, the gold rule the app uses under its headings —
so the listing and the app read as one thing.

Text sits well inside the edges: Play overlays UI on this image on some
surfaces, and anything near the border gets covered.
"""
from PIL import Image, ImageDraw, ImageFont

SAGE, PAPER, GOLD = (0x55,0x6F,0x5A), (0xFB,0xFA,0xF9), (0xD1,0xA8,0x4E)
F = 'NotoSerifDisplay-600.ttf'
W, H = 1024, 500

img = Image.new('RGB', (W, H), SAGE)
d = ImageDraw.Draw(img)

title = ImageFont.truetype(F, 78)
sub   = ImageFont.truetype(F, 30)

lines = ['Finding', 'Something', 'Real']
lh = 86
block_h = lh * len(lines) + 34 + 40
top = (H - block_h) / 2
x = 78

for i, line in enumerate(lines):
    d.text((x, top + i * lh), line, font=title, fill=PAPER)

ry = top + lh * len(lines) + 16
d.rounded_rectangle([x, ry, x + 132, ry + 6], radius=3, fill=GOLD)
d.text((x, ry + 30), 'Honest questions about faith  ·  New episodes Wednesdays',
       font=sub, fill=(0xD8, 0xE2, 0xDA))

img.save('feature-graphic.png')
print('feature graphic:', img.size)
