# Brand Identity & Color Scheme

> **What this doc covers:** The canonical brand palette, typography, and shadow recipes for Orzo. Applies to the mobile app, landing page (`getorzo.com`), emails, App Store listing, marketing materials, and any future web surfaces. Any agent or designer working on Orzo should reference this doc and use these exact values. Back to [`../ROADMAP.md`](../ROADMAP.md) and [`../README.md`](../README.md).

**Established:** 2026-04-10

## Brand direction

**Mood:** Warm, appetizing, kitchen-forward. Mediterranean/terracotta tones that evoke clay pots, warm bread, and home cooking. Distinct from the blue/green palettes used by most recipe apps.

**Tagline:** "Your cookbook, upgraded."

**Icon:** Stylized cream/off-white orzo pasta grains arranged in a circular ring forming an "O" on a terracotta background. Full-bleed square (iOS applies rounded corners automatically). Source files live at `Orzo icon.png` (repo root) and `mobile/ios/Orzo/Images.xcassets/AppIcon.appiconset/icon-*.png` (all 8 iOS sizes: 40, 58, 60, 80, 87, 120, 180, 1024).

## Color tokens

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| **Primary** | Terracotta | `#C4633A` | Primary CTAs, buttons, brand accent, icon background |
| **Primary Hover** | Deep Terracotta | `#A14E2A` | Hover/pressed states on primary elements |
| **Primary Light** | Warm Cream | `#FFF8F0` | Page backgrounds, hero sections, surfaces |
| **Primary 50** | Light Peach | `#FDEEE3` | Subtle backgrounds, feature card tints, selected states |
| **Surface** | White | `#FFFFFF` | Cards, inputs, modals, sheets |
| **Text Primary** | Espresso | `#2D1F14` | Headings, primary body text |
| **Text Secondary** | Warm Gray | `#7A6E64` | Subtitles, helper text, secondary body |
| **Text Tertiary** | Dark Warm Gray | `#4A3F36` | Tertiary labels, muted emphasis |
| **Divider** | Sand | `#E8DFD5` | Borders, separators, dividers |
| **Accent — Amber** | Golden Amber | `#D4952B` | Ratings, highlights, badges, warm accent |
| **Accent — Green** | Sage Green | `#6B8F71` | Success states, verified indicators |
| **Accent — Red** | Paprika | `#C43A3A` | Errors, destructive actions |
| **Accent — Purple** | Warm Taupe | `#8B7355` | Tertiary accent (used sparingly) |
| **Accent — Pink** | Dusty Terracotta | `#B86B4A` | Alternate warm accent |

## Feature card tinted backgrounds (for icon wells)

Used for soft colored circles behind feature icons on the landing page. Each is a desaturated, warm-tinted version of its accent color:

| Accent | Background Tint |
|--------|-----------------|
| Primary (terracotta) | `#FDEEE3` |
| Amber | `#FBF0DC` |
| Green | `#E8F0E9` |
| Red | `#F8E4E4` |
| Purple | `#EDE8E0` |
| Pink | `#F5E6DD` |

## Typography

**Font family:** Inter (Google Fonts) — weights 400, 500, 600, 700. Fallback stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Inter is the closest web-safe font to San Francisco (iOS system font) and keeps the mobile app and web surfaces visually consistent.

## Shadow recipe for warm surfaces

`box-shadow: 0 8px 32px rgba(196, 99, 58, 0.2);` — a warm terracotta-tinted shadow instead of a neutral gray. Use sparingly on hero elements (app icon, primary CTA cards).

## Theme color for browser chrome / status bars

`#FFF8F0` (Warm Cream) — set in `<meta name="theme-color">` on web and as the status bar background on mobile.

## Mobile app application

**Status:** Complete (2026-04-14). The mobile app has been fully migrated from the MVP blue-forward palette to the terracotta palette above.

**What landed:**

- **Canonical palette module:** `mobile/src/theme/colors.ts` exports both raw tokens (`TERRACOTTA`, `ESPRESSO`, `SAGE_GREEN`, `PAPRIKA`, etc.) and semantic aliases (`PRIMARY`, `TEXT_PRIMARY`, `ERROR`, `SUCCESS`, etc.). Components import from this module instead of hardcoding hex values — future palette tweaks are single-file edits.
- **Two new tokens added** for soft food-semantic icon variety: `MUTED_PLUM` (`#8E6B90`) and `DUSTY_ROSE` (`#BC6F83`). These fill hue gaps in the palette while staying in the muted/warm tonal register.
- **37 files migrated** across screens, import flow, recipe management, auth, and shared components. Every blue-family hex and every Tailwind gray is now an imported palette token.
- **`collectionIconRules.ts`:** food-semantic warm tones preserved (pizza red, pumpkin orange, etc.); cool-tone rules (blue/cyan/slate) remapped to warm palette equivalents; bright Tailwind rules softened to muted palette variants (`SAGE_GREEN`, `PAPRIKA`, `DUSTY_ROSE`, `MUTED_PLUM`, `GOLDEN_AMBER`).
- **HomeScreen jar fan:** four fan-out icons (Camera, Photos, URL, Add Folder) each get a distinct contrasting palette color (`GOLDEN_AMBER`, `DUSTY_ROSE`, `SAGE_GREEN`, `MUTED_PLUM`) for visual distinction. Jar FAB "+" background migrated from MVP orange `#fb923c` to `PRIMARY` (terracotta).

**Not migrated (intentional):**

- `#fdba74` on HomeScreen user avatar fallback (already warm and on-brand)
- Warm gradient stops in `ParseRevealEdgeGlow.tsx` (intentional design flourish)
- `LaunchScreen.storyboard` still uses `systemBackgroundColor` (white — not blue, so no flash on cold start, but not warm cream either). Updating requires XML edits that risk Xcode storyboard rendering; left as a small follow-up.

See [`../CHANGELOG.md`](../CHANGELOG.md) 2026-04-14 entry for full hex-to-token migration table. The terracotta palette is the source of truth going forward — any new UI should import from `mobile/src/theme/colors.ts`.
