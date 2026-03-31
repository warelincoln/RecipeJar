/**
 * Lucide icon sizes — 2× the app’s original baseline for consistent hierarchy.
 * Prefer importing `LUCIDE` here over scattering raw pixel values.
 */
export const LUCIDE = {
  xs: 24,
  sm: 32,
  md: 36,
  nav: 40,
  row: 44,
  lg: 48,
  xl: 52,
  fab: 56,
  landing: 96,
  hero: 128,
  /** Home collection strip — 20% smaller than `row`. */
  collectionCardHome: 35,
  /** Jar fan (Camera, Photos, URL, Add Folder) — 35% smaller than `lg`. */
  jarFanAction: 31,
  /** Import ParsingView rotating icons — 35% smaller than `hero`. */
  importParsingHero: 83,
} as const;
