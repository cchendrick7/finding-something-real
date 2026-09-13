/**
 * FSR design tokens — from FSR Branding.pdf.
 *
 * Accents are FUNCTIONAL, not decorative. Sage means confirmed, gold means
 * attention, blush means warmth. Black and white stay the base; that restraint
 * is the thing Janell liked about the concept.
 */

export const color = {
  ink: '#000000',
  inkSoft: '#2E2E2E',
  muted: '#6E6E6E',
  faint: '#9A9A9A',
  paper: '#FBFAF9',
  card: '#FFFFFF',
  line: '#E5E2DE',
  lineSoft: '#F1EEEA',
  wash: '#F5F3F0',

  sage: '#556F5A',
  blue: '#5C7688',
  gold: '#D1A84E',
  blush: '#C79C8E',

  sageWash: '#EDF1EE',
  blueWash: '#EDF1F4',
  goldWash: '#FAF3E5',
  blushWash: '#F8F0EC',

  white: '#FFFFFF',
  danger: '#8C3A3A',
} as const;

/**
 * Brand faces are Noto Serif Display (headings) / Glacial Indifference
 * (subheads) / Codec Pro (body). Codec Pro is a COMMERCIAL licence and app
 * embedding is separate from web — pending Janell's decision, body falls back
 * to the system stack. Swapping it later is a change to this object only.
 */
export const font = {
  serif: '"Noto Serif Display", Georgia, "Times New Roman", serif',
  serifItalic: '"Noto Serif Display", Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 26, xxl: 34 } as const;
export const radius = { sm: 8, md: 10, lg: 14, pill: 999 } as const;

export const type = {
  display: { fontFamily: font.serif, fontSize: 30, lineHeight: 34, color: color.ink },
  h1: { fontFamily: font.serif, fontSize: 27, lineHeight: 31, color: color.ink },
  h2: { fontFamily: font.serif, fontSize: 21, lineHeight: 25, color: color.ink },
  h3: { fontFamily: font.serif, fontSize: 17, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: color.inkSoft },
  small: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: color.muted },
  xs: { fontFamily: font.sans, fontSize: 11, lineHeight: 16, color: color.faint },
  eyebrow: {
    fontFamily: font.sans, fontSize: 10, lineHeight: 14, letterSpacing: 1.8,
    textTransform: 'uppercase' as const, color: color.faint, fontWeight: '500' as const,
  },
} as const;
