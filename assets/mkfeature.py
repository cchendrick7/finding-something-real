"""
Play Store feature graphic (1024x500) and store icon (512x512).

    cd assets && python3 mkfeature.py

Same system as the app icon (mkicon.py): an ink ground and the ministry's
emblem in white, with the name set in Noto Serif Display, the face every
heading in the app uses. "REAL" is in capitals because that is how the
ministry writes it, and the line under it is Janell's masthead line from the
Listen screen. The gold hairline is the Rule the app draws under headings.

Text sits well inside the edges: Play overlays UI on this image on some
surfaces, and anything near the border gets covered.

The sage version this replaced dated from build 1, before Janell asked for
black and white (build 12) and before the emblem (26 Sep).
"""
from PIL import Image, ImageDraw, ImageFont

INK, WHITE, GOLD, SOFT = (0, 0, 0), (0xFF, 0xFF, 0xFF), (0xD1, 0xA8, 0x4E), (0xC9, 0xC9, 0xC9)
F = 'NotoSerifDisplay-600.ttf'
EMBLEM = Image.open('fsr-emblem.png').convert('RGBA')
EMBLEM = EMBLEM.crop(EMBLEM.getbbox())


def emblem(width, colour):
    h = round(width * EMBLEM.height / EMBLEM.width)
    out = Image.new('RGBA', (width, h), colour + (255,))
    out.putalpha(EMBLEM.getchannel('A').resize((width, h), Image.LANCZOS))
    return out


# ---- feature graphic
W, H = 1024, 500
img = Image.new('RGBA', (W, H), INK + (255,))
d = ImageDraw.Draw(img)
title = ImageFont.truetype(F, 74)
sub = ImageFont.truetype(F, 27)

lines = ['Finding', 'Something', 'REAL']
lh = 80
block_h = lh * len(lines) + 30 + 64
top = (H - block_h) / 2 - 6
x = 74
for i, line in enumerate(lines):
    d.text((x, top + i * lh), line, font=title, fill=WHITE)
ry = top + lh * len(lines) + 14
d.rounded_rectangle([x, ry, x + 120, ry + 5], radius=2, fill=GOLD)
d.text((x, ry + 26), 'An honest space for young women', font=sub, fill=SOFT)
d.text((x, ry + 26 + 34), 'asking big questions', font=sub, fill=SOFT)

mark = emblem(250, WHITE)
img.alpha_composite(mark, (W - 74 - mark.width, (H - mark.height) // 2))
img.convert('RGB').save('../store/feature-graphic.png')   # Play: 24-bit, no alpha

# ---- store listing icon: 512x512, 32-bit PNG (alpha channel present), < 1 MB
icon = Image.new('RGBA', (512, 512), INK + (255,))
m = emblem(round(512 * 0.63), WHITE)
icon.alpha_composite(m, ((512 - m.width) // 2, (512 - m.height) // 2))
icon.save('../store/play-icon-512.png')
print('feature graphic', img.size, '· store icon', icon.size)
