"""
FSR app icon: the ministry's emblem, white on an ink tile.

    cd assets && python3 mkicon.py

History, because the icon has changed twice and each change was a decision:

  1. A sage monogram set in the app's heading face (build 1).
  2. Black and white (build 12). Janell saw the sage tile on her phone and asked
     for black and white, which is also what the brand document says the base
     is: the accents are meant to be functional, and an icon is not a function.
     Both directions were rendered first. A paper tile all but disappears against
     the white of an App Store listing and a Settings row; the ink tile holds
     down to the 29px settings icon.
  3. The FSR emblem itself (Janell's feedback round, 26 Sep): ink tile, white
     emblem. fsr-emblem.png is the ministry's own artwork, 5000x5000 with a
     transparent ground; nothing here redraws it, only places and recolours it.

Every size is generated from the one source, so the mark is changed in one
place. Placement is by the emblem's WIDTH as a share of the canvas.

Rebuilt on 24 Oct 2026 after the original script was lost; the 1024 icon it
produces matches the one shipped in build 18 when both are reduced to 120px.
"""
from PIL import Image

INK = (0x00, 0x00, 0x00)        # color.ink in lib/theme.ts
WHITE = (0xFF, 0xFF, 0xFF)
EMBLEM = Image.open('fsr-emblem.png').convert('RGBA')
EMBLEM = EMBLEM.crop(EMBLEM.getbbox())  # the artwork's own margins are not ours


def mark(size, fg, bg=None, width_frac=0.63):
    """The emblem in `fg`, `width_frac` of the canvas wide, centred on `bg`."""
    canvas = Image.new('RGBA', (size, size), (bg + (255,)) if bg else (0, 0, 0, 0))
    w = round(size * width_frac)
    h = round(w * EMBLEM.height / EMBLEM.width)
    alpha = EMBLEM.getchannel('A').resize((w, h), Image.LANCZOS)
    solid = Image.new('RGBA', (w, h), fg + (255,))
    solid.putalpha(alpha)
    canvas.alpha_composite(solid, ((size - w) // 2, (size - h) // 2))
    return canvas


# iOS and the store listing. No transparency allowed, hence RGB.
mark(1024, WHITE, INK).convert('RGB').save('icon.png')

# Android adaptive icon. The launcher shows the middle two thirds and crops
# that to a circle (or squircle), so the foreground asks for less width.
mark(512, WHITE, width_frac=0.44).save('android-icon-foreground.png')
Image.new('RGB', (512, 512), INK).save('android-icon-background.png')
mark(432, WHITE, width_frac=0.44).save('android-icon-monochrome.png')  # themed icons

# Splash: shown on paper (#FBFAF9, app.json), so the emblem is ink.
mark(1024, INK, width_frac=0.46).save('splash-icon.png')

# Android notification icon: the status bar shows only the alpha channel,
# tinted by the system, so it is the emblem in white on nothing. 96px is the
# xxxhdpi size of the 24dp icon; Android wants about 2dp clear on each side.
# Wired up as the expo-notifications plugin's `icon` in app.json.
mark(96, WHITE, width_frac=0.82).save('notification-icon.png')

# Web tab icon.
mark(196, WHITE, INK, width_frac=0.68).convert('RGB').save('favicon.png')
