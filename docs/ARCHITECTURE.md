# Architecture

> **What this doc covers:** Deep dive into Orzo's validation engine, save-decision logic, and the dual import architecture (XState machine path + concurrent queue path). For monorepo layout and the high-level data flow diagram, see [`../README.md`](../README.md). For where individual files live, see [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md).

## Validation Engine

Located in `server/src/domain/validation/`. Runs 8 rule modules in this exact order:

```
1. rules.structure       → STRUCTURE_NOT_SEPARABLE (BLOCK)
2. rules.integrity       → CONFIRMED_OMISSION (BLOCK), SUSPECTED_OMISSION (FLAG), MULTI_RECIPE_DETECTED (FLAG, userDismissible)
3. rules.required-fields → TITLE_MISSING (FLAG), INGREDIENTS_MISSING (BLOCK), STEPS_MISSING (BLOCK)
4. rules.servings        → SERVINGS_MISSING (BLOCK)
5. rules.ingredients     → INGREDIENT_MERGED (FLAG), INGREDIENT_NAME_MISSING (FLAG), OCR artifacts (FLAG)
6. rules.steps           → OCR artifacts (FLAG)
7. rules.retake          → LOW_CONFIDENCE_STRUCTURE (RETAKE or BLOCK if limit hit), POOR_IMAGE_QUALITY (RETAKE or BLOCK if limit hit)
```

Note: `rules.description.ts` exists but is **not wired into** `validation.engine.ts`. The `DESCRIPTION_DETECTED` and `INGREDIENT_QTY_OR_UNIT_MISSING` checks were intentionally removed from the validation pipeline.

There are only 3 severities (CORRECTION_REQUIRED was removed — all former CORRECTION_REQUIRED issues now emit FLAG):

| Severity | Effect on save | User action required |
|---|---|---|
| `FLAG` | Does NOT block save | User may confirm/dismiss inline in preview |
| `RETAKE` | Blocks save | User should retake the photo |
| `BLOCK` | Blocks save, no user fix possible | User must start over |

FLAGs represent observations, not errors. A missing quantity ("salt" with no amount) is valid — many recipes write it that way. The system surfaces these so the user is aware, but never prevents saving based on them.

Retake escalation: when `LOW_CONFIDENCE_STRUCTURE` or `POOR_IMAGE_QUALITY` fires, severity is `RETAKE`. After 2 retakes per page (`retakeCount >= 2` on all pages), severity escalates to `BLOCK` as `RETAKE_LIMIT_REACHED`.

Each issue has a severity. The validation result aggregates:
- `hasBlockingIssues` — any BLOCK severity
- `requiresRetake` — any RETAKE severity
- `hasWarnings` — any FLAG severity
- `saveState` — `SAVE_CLEAN` only if no BLOCK and no RETAKE

## Save-Decision Logic

Located in `server/src/domain/save-decision.ts`. Three possible outcomes:

| Condition | saveState | allowed |
|---|---|---|
| Any BLOCK or RETAKE issue exists | `NO_SAVE` | `false` |
| Only FLAGs, and user dismissed at least one | `SAVE_USER_VERIFIED` | `true` |
| No FLAGs, or FLAGs exist but none dismissed | `SAVE_CLEAN` | `true` |

FLAGs never block saving. They are attention-only — the user can confirm/dismiss them inline in the preview screen, but saving is never blocked by FLAGs.

## State Machine & Concurrent Import Architecture

The import system has two distinct paths:

### 1. Concurrent queue path (camera and photo library imports)

Camera/photo imports bypass the XState machine for upload and parse. Instead, `ImportFlowScreen` calls `enqueueImport()` which:
1. Creates a local queue entry in the Zustand `importQueueStore` (with a client-generated `localId` as stable key)
2. Calls `api.drafts.create()` + `api.drafts.addPage()` (with retry and orphan cleanup on failure)
3. Triggers `api.drafts.parse()` (server returns `202 Accepted` immediately)
4. The `importQueuePoller` hook polls `GET /drafts/:id` with exponential backoff (3s → 5s → 10s) until the draft reaches a terminal status

The user sees `ParsingView` with queue context ("Import Another" / "Review Recipes" buttons), and can queue up to 3 concurrent imports. When ready, they review each import via the Import Hub, which launches `ImportFlow` with `resumeDraftId` + `fromHub` — at which point the XState machine takes over for the resume/review/save flow.

### 2. XState machine path (URL imports + hub resume)

Located in `mobile/src/features/import/machine.ts`. XState v5 machine with 9 states. Used for URL imports (which are synchronous and not queued) and for resuming drafts from the Import Hub.

```
idle → capture (NEW_IMAGE_IMPORT — used only for retake from hub)
idle → uploading (PHOTOS_SELECTED — not used in concurrent flow)
idle → creatingUrlDraft (NEW_URL_IMPORT)
idle → resuming (RESUME_DRAFT — hub review/retake)

capture → reorder (DONE_CAPTURING)
reorder → uploading (CONFIRM_ORDER)

creatingUrlDraft → parsing (draft created, draftId assigned)
uploading → parsing (draft created, pages uploaded, draftId assigned)

parsing → previewEdit (clean parse or FLAG-only issues)
parsing → retakeRequired (RETAKE issues)

previewEdit → saving (ATTEMPT_SAVE, no blocking issues or retakes)

retakeRequired → capture (RETAKE_PAGE — retake photo)
retakeRequired → idle (RETAKE_GO_HOME — Photos entry only)

saving → saved (success, final state)
saving → previewEdit (error)
```

The `parseDraft` actor handles the server's `202 Accepted` response by entering a polling loop (`GET /drafts/:id` every 3s) until the parse completes. This is transparent to the machine — it receives the full parse result regardless of whether the server completed synchronously or asynchronously.

The `resumeDraft` actor populates `capturedPages` from the server's page data (including `resolvedImageUrl` for display and `retakeCount`), which the retake and preview screens need.

The `guidedCorrection` and `finalWarningGate` states were removed. FLAG issues are now handled inline in the preview screen (confirm/dismiss buttons) and never block saving. The machine invokes async actors for API calls (`createDraft`, `createUrlDraft`, `uploadDraft`, `parseDraft`, `saveDraft`, `resumeDraft`, `updateCandidate`).

### Server-side concurrency controls

- **Parse semaphore** (`server/src/parsing/parse-semaphore.ts`): max 2 concurrent OpenAI Vision calls; additional requests queue in-memory.
- **Idempotency guards**: `/parse` rejects unless draft status is `READY_FOR_PARSE`, `CAPTURE_IN_PROGRESS`, or `NEEDS_RETAKE`; `/save` rejects if already `SAVED`.
- **Race-safe status updates**: `setParsedCandidate()` uses `WHERE status = 'PARSING'` so a cancelled draft isn't overwritten by a completing parse.
- **Startup cleanup**: resets zombie `PARSING` drafts (stuck >10 min) and deletes `CANCELLED` drafts older than 24 hours.
- **Postgres pool**: increased to `max: 20` to handle concurrent background parses.
