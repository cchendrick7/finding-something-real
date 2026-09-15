"""
FSR app icon.

Built from the project's own brand tokens (lib/theme.ts) and the brand
typeface (Noto Serif Display) — sage is the accent theme.ts assigns to
"confirmed / grounded", the serif is the face every heading in the app is set
in, and the gold hairline is the same Rule the app draws under its headings.

Sized for the smallest place it appears (a 29px settings row), so the mark is
three letters, the weight is high, and there is no fine detail.
"""
from PIL import Image, ImageDraw, ImageFont

SAGE  = (0x55, 0x6F, 0x5A)
PAPER = (0xFB, 0xFA, 0xF9)
GOLD  = (0xD1, 0xA8, 0x4E)
FONT  = 'NotoSerifDisplay-600.ttf'
TEXT  = 'FSR'

def monogram(size, bg, fg, rule, width_frac=0.62, rule_on=True):
    """
    Fit by WIDTH, not cap height. Three letterspaced capitals are much wider
    than they are tall, so sizing on height alone runs them off both edges —
    which is exactly what the first attempt did.

    `width_frac` is the share of the canvas the whole monogram occupies, so
    the Android foreground can simply ask for less and stay inside the circle
    the system crops to.
    """
    img = Image.new('RGBA', (size, size), (bg + (255,)) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    target_w = size * width_frac

    def measure(pt):
        f = ImageFont.truetype(FONT, pt)
        track = pt * 0.07
        widths = [d.textlength(c, font=f) for c in TEXT]
        return f, track, sum(widths) + track * (len(TEXT) - 1), widths

    pt = int(size * 0.4)
    for _ in range(40):                       # converge on the width
        f, track, total, widths = measure(pt)
        if abs(total - target_w) < size * 0.004:
            break
        pt = max(8, int(pt * target_w / total))
    f, track, total, widths = measure(pt)

    ink = d.textbbox((0, 0), TEXT, font=f)    # actual drawn extent
    cap_h = ink[3] - ink[1]

    block_h = cap_h + (size * 0.10 + max(2, int(size * 0.014)) if rule_on else 0)
    top = (size - block_h) / 2 - size * 0.01  # optical, not mathematical, centre

    x = (size - total) / 2
    for c, w in zip(TEXT, widths):
        d.text((x, top - ink[1]), c, font=f, fill=fg)
        x += w + track

    if rule_on:
        rw = total * 0.58
        rh = max(2, int(size * 0.014))
        ry = top + cap_h + size * 0.07        # clearly BELOW the baseline
        d.rounded_rectangle([(size - rw) / 2, ry, (size + rw) / 2, ry + rh],
                            radius=rh / 2, fill=rule)
    return img

monogram(1024, SAGE, PAPER, GOLD).convert('RGB').save('icon.png')
monogram(512, None, PAPER, GOLD, width_frac=0.44).save('android-icon-foreground.png')
Image.new('RGB', (512, 512), SAGE).save('android-icon-background.png')
monogram(432, None, (255, 255, 255, 255), None, width_frac=0.44,
         rule_on=False).save('android-icon-monochrome.png')
monogram(1024, None, SAGE, GOLD, width_frac=0.46).save('splash-icon.png')
monogram(196, SAGE, PAPER, None, width_frac=0.68, rule_on=False).convert('RGB').save('favicon.png')
print('ok')
