# Analytics Setup — Import Health Observability

> **What this doc covers:** The manual steps to finish wiring Track A (server PostHog via Railway) and Track C (PostHog dashboard). Code for both tracks is already merged. See plan: `/Users/lincolnware/.claude/plans/go-ahead-and-create-polymorphic-shamir.md`.

---

## Track A — Railway environment variables

Server-side PostHog only emits when it sees a valid API key AND `NODE_ENV=production`. Set these in the **Railway dashboard** → your server service → **Variables** tab. No redeploy is needed — Railway auto-restarts the service on variable save.

| Variable | Value | Notes |
|---|---|---|
| `POSTHOG_API_KEY_SERVER` | `phc_CtV84PRqskvxT2HAfHCDQheiZzgd3niCFxNoU82FVPjA` | Same PostHog project as the mobile client, so client + server events land on the same `distinct_id` (= Supabase user id). |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | US region, matches mobile. |
| `ANALYTICS_FIREHOSE_ENABLED` | `true` | Set to `false` to instantly kill all server-side PostHog emissions without a redeploy. |

**Verification after save:**
1. In Railway's Deploys tab, watch the new container start.
2. In the service logs, look for `{"event":"analytics_initialized","host":"https://us.i.posthog.com"}` on boot. If you see `analytics_disabled` with `reason: "missing_api_key"` or `"non_production"`, the env vars didn't take.
3. Trigger a URL import from the TestFlight app (e.g. BBC Good Food).
4. In PostHog → **Activity** (left nav) → filter by event name `server_parse_completed`. The event should appear within ~30 seconds with properties: `url`, `domain: "bbcgoodfood.com"`, `extraction_method: "json-ld"`, `parse_duration_ms > 0`, `source_type: "url"`.

**Kill switch test:**
1. Flip `ANALYTICS_FIREHOSE_ENABLED` to `false` in Railway.
2. Wait ~90s for the restart.
3. Trigger an import; confirm no new events appear in PostHog.
4. Flip back to `true` when done.

---

## Track C — PostHog Dashboard

Build this in the PostHog UI — **no code changes needed, so it iterates freely.**

### Create the dashboard

1. PostHog → **Dashboards** → **New dashboard** → name it `Orzo — Import Health`.
2. Add the five tiles below as **Saved Insights** first, then pin each to the dashboard.

### Tile 1 — Live failure feed

- **Insight type:** Events & actions (SQL or "Events" insight)
- **Filter:** `event = server_parse_validated` AND `properties.has_blocking_issues = true`, last 7 days, sort by time desc.
- **Columns to show:** `timestamp`, `person.email`, `properties.domain`, `properties.url`, `properties.first_block_code`, `properties.extraction_method`, `properties.source_type`
- **Title:** `Failing imports — latest 50`
- **Why:** This is the feed you asked for. Open it, see exactly which URL + site + reason failed most recently.

### Tile 2 — Top failing domains

- **Insight type:** Trends (bar chart, "Total")
- **Event:** `server_parse_validated`
- **Filter:** `properties.has_blocking_issues = true`
- **Breakdown:** `properties.domain`
- **Date range:** Last 14 days
- **Title:** `Domains with the most BLOCKs`

### Tile 3 — Top block codes

- **Insight type:** Trends (bar chart, "Total")
- **Event:** `server_parse_validated`
- **Filter:** `properties.has_blocking_issues = true`
- **Breakdown:** `properties.first_block_code`
- **Date range:** Last 14 days
- **Title:** `Which validation rules fire most`
- **Why:** Tells you whether to fix `SERVINGS_MISSING` or `RETAKE_LIMIT_REACHED` first.

### Tile 4 — Extraction tier funnel

- **Insight type:** Trends (stacked bar, "Total")
- **Event:** `server_parse_completed`
- **Breakdown:** `properties.extraction_method`
- **Secondary breakdown (stack):** `properties.has_blocking_issues`
- **Date range:** Last 14 days
- **Title:** `URL parse tier — fallback funnel`
- **Why:** How many URLs make it to JSON-LD vs fall all the way to AI, and whether AI-tier parses fail more often than JSON-LD. Tells you if the adapter cascade is doing its job.

### Tile 5 — Photo vs URL failure rate trend

- **Insight type:** Trends (line chart, "Weekly")
- **Series A:** `server_parse_validated` where `properties.source_type = "url"` AND `properties.has_blocking_issues = true`
- **Series B:** `server_parse_validated` where `properties.source_type = "image"` AND `properties.has_blocking_issues = true`
- **Date range:** Last 60 days
- **Title:** `Import failure rate — photo vs URL`

### Tile 6 (optional, requires Build 2) — Blocked-screen engagement

Once Build 2 installs Track B client events, add:

- **Insight type:** Funnel
- **Step 1:** `import_blocked_shown`
- **Step 2:** `import_dismissed` within 10 minutes
- **Breakdown:** `properties.first_block_code`
- **Title:** `Blocked screens — dismissed vs pushed through`
- **Why:** Tells you which BLOCK codes make users give up vs push through.

### Tile 7 — Missing hero images feed (SQL)

Every URL save that didn't get a hero image, so you can spot domains whose JSON-LD omits `imageUrl` or whose image URLs 4xx.

- **Insight type:** SQL
- **Query:**

```sql
SELECT
  timestamp,
  properties.domain AS domain,
  properties.url AS url,
  properties.reason AS reason,
  properties.metadata_image_url AS metadata_image_url,
  properties.extraction_method AS tier,
  properties.error_message AS error_message
FROM events
WHERE event = 'server_hero_image_missing'
  AND timestamp > now() - interval 14 day
ORDER BY timestamp DESC
LIMIT 50
```

- **Title:** `URL saves without hero images — latest 50`
- **Why:** Two distinct patterns to watch: `reason = "no_metadata_url"` means the source's JSON-LD/Microdata didn't expose an image (your parser is doing the right thing — pattern tells you which sites need a fallback heuristic). `reason = "download_failed"` means we tried the URL and it errored (403/404/timeout — pattern tells you about bot-protected CDNs).

### Tile 8 — Hero image attachment rate by domain (SQL)

Which domains consistently succeed vs fail at hero attachment. Complements tile 7's raw feed.

- **Insight type:** SQL
- **Query:**

```sql
SELECT
  properties.domain AS domain,
  count() AS saves,
  countIf(properties.hero_image_attached = true) AS with_hero,
  round(countIf(properties.hero_image_attached = true) / count() * 100, 1) AS attach_pct
FROM events
WHERE event = 'server_recipe_saved'
  AND properties.source_type = 'url'
  AND properties.domain IS NOT NULL
  AND timestamp > now() - interval 14 day
GROUP BY domain
ORDER BY saves DESC
LIMIT 20
```

- **Title:** `Hero attachment rate by domain`

### Tile 9 — Which FLAG codes fire most (Trends, bar chart)

Symmetric with tile 3 (block codes). FLAGs are dismissible warnings — tracking them shows you which soft issues keep tripping the validator.

- **Insight type:** Trends → bar chart
- **Event:** `server_parse_validated`
- **Filter:** `properties.has_flags = true`
- **Breakdown:** `properties.first_flag_code`
- **Date range:** Last 14 days
- **Title:** `Which FLAG codes fire most`
- **Why:** FLAGs like `MAJOR_OCR_ARTIFACT`, `DESCRIPTION_DETECTED`, or `MULTI_RECIPE_DETECTED` are signals that the parse succeeded but the content has a quirk. High frequency on one code tells you which quirks are worth handling automatically vs surfacing to the user.

### Tile 10 — Time completeness by domain (SQL)

Per-domain breakdown of how often we get all three times vs partial vs none, plus how often we're relying on AI inference. Call out domains where the source publishes times cleanly (mostly `explicit`) vs where Orzo is guessing (`inferred`).

- **Insight type:** SQL
- **Query:**

```sql
SELECT
  properties.domain AS domain,
  count() AS parses,
  countIf(properties.time_completeness = 'all') AS all_times,
  countIf(properties.time_completeness = 'partial') AS partial,
  countIf(properties.time_completeness = 'none') AS none,
  countIf(properties.has_inferred_time = true) AS any_inferred,
  countIf(properties.has_explicit_time = true) AS any_explicit,
  round(countIf(properties.has_explicit_time = true) / count() * 100, 1) AS explicit_pct
FROM events
WHERE event = 'server_parse_validated'
  AND properties.source_type = 'url'
  AND properties.domain IS NOT NULL
  AND timestamp > now() - interval 14 day
GROUP BY domain
ORDER BY parses DESC
LIMIT 25
```

- **Title:** `Time completeness & inference rate by domain`

### Tile 11 — Inferred-time parses feed (SQL)

Every parse where the TimesReviewBanner would have fired — shows which sites leave Orzo to guess.

- **Insight type:** SQL
- **Query:**

```sql
SELECT
  timestamp,
  properties.domain AS domain,
  properties.url AS url,
  properties.prep_time_source AS prep_src,
  properties.cook_time_source AS cook_src,
  properties.total_time_source AS total_src,
  properties.extraction_method AS tier
FROM events
WHERE event = 'server_parse_validated'
  AND properties.has_inferred_time = true
  AND timestamp > now() - interval 14 day
ORDER BY timestamp DESC
LIMIT 50
```

- **Title:** `Parses where times were AI-inferred`

---

## Event reference

Quick glossary of everything that now flows into PostHog.

### Server-side (Track A — hot-deployable, live as soon as Railway env vars are set)

| Event | Fires at | Key properties |
|---|---|---|
| `server_parse_completed` | Every parse that produced a candidate (before validation) | `url`, `domain`, `source_type`, `extraction_method`, `parse_duration_ms`, `page_count`, `ingredient_count`, `step_count`, `had_*` booleans |
| `server_parse_validated` | Right after validation runs | All of above **plus** `save_state`, `has_blocking_issues`, `block_codes[]`, `first_block_code`, `retake_codes[]`, `flag_codes[]`, `first_flag_code`, `has_flags` |
| `server_parse_failed` | Parse threw (fetch error, OpenAI timeout, etc.) | `url`, `domain`, `error_message`, `error_stage` (`fetch`\|`vision`\|`extract`\|`validate`\|`unknown`), `parse_duration_ms` |
| `server_url_capture_failed` | WebView capture failed and fell back to server fetch | `url`, `domain`, `reason`, `acquisition_method` |
| `server_recipe_saved` | User hit Save and the recipe persisted | `url`, `domain`, `save_state`, `had_user_edits`, `dismissed_issue_count`, times present, **`hero_image_attached`**, **`hero_image_failure_reason`**, **`had_metadata_image_url`** |
| `server_hero_image_missing` | URL import saved without a hero image | `url`, `domain`, `recipe_id`, `extraction_method`, `reason` (`no_metadata_url`\|`download_failed`), `metadata_image_url`, `error_message` |

`server_parse_validated` also now carries `first_flag_code` and `has_flags` (symmetric with the BLOCK side) so FLAG breakdowns work the same way as BLOCK breakdowns in the dashboard.

**Time provenance properties** (on `server_parse_completed`, `server_parse_validated`, and — as `*_final` variants — on `server_recipe_saved`):

- `prep_time_source` / `cook_time_source` / `total_time_source` — one of `"explicit" | "inferred" | null`. `"explicit"` means JSON-LD/Microdata literally stated the time; `"inferred"` means Vision or URL-AI estimated it; `null` means the time field wasn't populated at all.
- `had_prep_time` / `had_cook_time` / `had_total_time` — boolean presence per field.
- `time_completeness` — `"all" | "partial" | "none"`. Scorecard for "did we get every time."
- `has_inferred_time` — any of the three is `"inferred"`. This is "the TimesReviewBanner fired" signal.
- `has_explicit_time` — any of the three came from structured data.
- On `server_recipe_saved`: `prep_time_source_final`, `cook_time_source_final`, `total_time_source_final` are the persisted source after the user had a chance to confirm via the banner (`"user_confirmed"` replaces `"inferred"` when the user accepted or edited). `any_inferred_time_final` / `any_user_confirmed_time` are the convenience booleans.

### Client-side (Track B — ships with Build 2)

| Event | Fires at | Key properties |
|---|---|---|
| `import_started` | User entered a flow (URL/camera/photos) | `source_type` |
| `import_url_entered` | User submitted a URL | `url`, `domain`, `acquisition_method` |
| `import_parsed` | Parse returned to the client | Full `buildImportEventProps()` + `parse_duration_ms` |
| `import_blocked_shown` | `PreviewEditView` rendered with `hasBlockingIssues: true` | Same as `import_parsed` |
| `import_retake_required` | `RetakeRequiredView` rendered | Same as `import_parsed` |
| `import_retake_initiated` | User tapped the retake button | + `page_id` |
| `import_dismissed` | User confirmed cancel on any screen | + `dismissed_from: <state>` |
| `import_save_attempted` | User tapped Save on `PreviewEditView` | Full props |
| `import_saved` | Save succeeded | + `recipe_id` |
| `import_save_failed` | Save threw | + `error_message` |
| `import_timed_out` | 60s parse timeout | + `parse_duration_ms` |
| `import_failed` | Parse actor errored | + `error_message`, `error_stage` |

Client events are gated by PostHog feature flag `analytics_firehose_enabled`. Default-true; flip to `false` in PostHog to kill client emissions within seconds.

---

## Things we explicitly did NOT build

- `parse_failures` Supabase table (long-term forensics). Deferred — revisit if PostHog's 30-day retention becomes a problem.
- Sentry URL tagging. Worth doing later, one-line add.
- OTA / CodePush. Would itself require a rebuild.

---

## Rollout order

1. **Now (hot):** Set Railway env vars → verify `server_parse_*` events in PostHog.
2. **Now (hot):** Build the five dashboard tiles in PostHog UI.
3. **When Build 2 ships:** Client events automatically start flowing, tile 6 becomes populated.
