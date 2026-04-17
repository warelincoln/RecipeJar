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

---

## Event reference

Quick glossary of everything that now flows into PostHog.

### Server-side (Track A — hot-deployable, live as soon as Railway env vars are set)

| Event | Fires at | Key properties |
|---|---|---|
| `server_parse_completed` | Every parse that produced a candidate (before validation) | `url`, `domain`, `source_type`, `extraction_method`, `parse_duration_ms`, `page_count`, `ingredient_count`, `step_count`, `had_*` booleans |
| `server_parse_validated` | Right after validation runs | All of above **plus** `save_state`, `has_blocking_issues`, `block_codes[]`, `first_block_code`, `retake_codes[]`, `flag_codes[]` |
| `server_parse_failed` | Parse threw (fetch error, OpenAI timeout, etc.) | `url`, `domain`, `error_message`, `error_stage` (`fetch`\|`vision`\|`extract`\|`validate`\|`unknown`), `parse_duration_ms` |
| `server_url_capture_failed` | WebView capture failed and fell back to server fetch | `url`, `domain`, `reason`, `acquisition_method` |
| `server_recipe_saved` | User hit Save and the recipe persisted | `url`, `domain`, `save_state`, `had_user_edits`, `dismissed_issue_count`, times present |

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
