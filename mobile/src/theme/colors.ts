/**
 * Orzo brand palette — the canonical source of truth for mobile UI colors.
 *
 * Values match `ROADMAP.md` → "Brand Identity & Color Scheme" (2026-04-10).
 * Prefer semantic aliases (PRIMARY, TEXT_PRIMARY, etc.) in components over
 * raw palette names so future palette tweaks require changing this file only.
 *
 * Mood: warm, appetizing, kitchen-forward. Mediterranean/terracotta tones.
 */

// ---------------------------------------------------------------------------
// Raw palette
// ---------------------------------------------------------------------------

/** Primary brand color — CTAs, buttons, accents, icon background. */
export const TERRACOTTA = '#C4633A';

/** Hover/pressed state for primary elements. */
export const DEEP_TERRACOTTA = '#A14E2A';

/** Page background — hero sections, surfaces, status bar on mobile. */
export const WARM_CREAM = '#FFF8F0';

/** Subtle tinted background — feature cards, selected states. */
export const LIGHT_PEACH = '#FDEEE3';

/** Primary text — headings, body. */
export const ESPRESSO = '#2D1F14';

/** Secondary text — subtitles, helper text. */
export const WARM_GRAY = '#7A6E64';

/** Tertiary text — muted emphasis, labels. */
export const DARK_WARM_GRAY = '#4A3F36';

/** Borders, separators, dividers. */
export const SAND = '#E8DFD5';

/** Ratings, highlights, badges. */
export const GOLDEN_AMBER = '#D4952B';

/** Success states, verified indicators. */
export const SAGE_GREEN = '#6B8F71';

/** Errors, destructive actions. */
export const PAPRIKA = '#C43A3A';

/** Tertiary accent — used sparingly. */
export const WARM_TAUPE = '#8B7355';

/** Alternate warm accent. */
export const DUSTY_TERRACOTTA = '#B86B4A';

/** Muted plum — softer purple for food-semantic icons (grape, wine, cake). */
export const MUTED_PLUM = '#8E6B90';

/** Dusty rose — softer pink for food-semantic icons (dessert, candy, party). */
export const DUSTY_ROSE = '#BC6F83';

// ---------------------------------------------------------------------------
// Feature card tinted backgrounds (for icon wells)
// ---------------------------------------------------------------------------

export const TINT_TERRACOTTA = '#FDEEE3';
export const TINT_AMBER = '#FBF0DC';
export const TINT_GREEN = '#E8F0E9';
export const TINT_RED = '#F8E4E4';
export const TINT_PURPLE = '#EDE8E0';
export const TINT_PINK = '#F5E6DD';

// ---------------------------------------------------------------------------
// Surface colors
// ---------------------------------------------------------------------------

export const WHITE = '#FFFFFF';
export const BLACK = '#000000';

// ---------------------------------------------------------------------------
// Semantic aliases — prefer these in components
// ---------------------------------------------------------------------------

export const PRIMARY = TERRACOTTA;
export const PRIMARY_HOVER = DEEP_TERRACOTTA;
export const PRIMARY_LIGHT = WARM_CREAM;
export const PRIMARY_50 = LIGHT_PEACH;
export const SURFACE = WHITE;
export const TEXT_PRIMARY = ESPRESSO;
export const TEXT_SECONDARY = WARM_GRAY;
export const TEXT_TERTIARY = DARK_WARM_GRAY;
export const DIVIDER = SAND;
export const SUCCESS = SAGE_GREEN;
export const ERROR = PAPRIKA;
export const WARNING = GOLDEN_AMBER;

// ---------------------------------------------------------------------------
// Bag export for convenience (e.g. `colors.PRIMARY` in dynamic lookups)
// ---------------------------------------------------------------------------

export const colors = {
  TERRACOTTA,
  DEEP_TERRACOTTA,
  WARM_CREAM,
  LIGHT_PEACH,
  ESPRESSO,
  WARM_GRAY,
  DARK_WARM_GRAY,
  SAND,
  GOLDEN_AMBER,
  SAGE_GREEN,
  PAPRIKA,
  WARM_TAUPE,
  DUSTY_TERRACOTTA,
  MUTED_PLUM,
  DUSTY_ROSE,
  TINT_TERRACOTTA,
  TINT_AMBER,
  TINT_GREEN,
  TINT_RED,
  TINT_PURPLE,
  TINT_PINK,
  WHITE,
  BLACK,
  PRIMARY,
  PRIMARY_HOVER,
  PRIMARY_LIGHT,
  PRIMARY_50,
  SURFACE,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  SUCCESS,
  ERROR,
  WARNING,
} as const;

export type OrzoColor = keyof typeof colors;
