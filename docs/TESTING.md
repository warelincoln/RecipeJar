# Testing & E2E Walkthrough

> **What this doc covers:** A scripted `curl`-based end-to-end walkthrough you can run against a local server, plus the highest-priority manual QA scenarios. The full QA matrix lives in [`../QA_CHECKLIST.md`](../QA_CHECKLIST.md). Back to [`../README.md`](../README.md).

## End-to-End Test Flow

This is a scripted walkthrough you can execute against the running server to verify the full pipeline. Uses `curl`. Replace `$DRAFT_ID` and `$RECIPE_ID` with actual UUIDs from responses.

```bash
# 1. Create a draft (201 → returns {id, status: "CAPTURE_IN_PROGRESS"})
curl -s -X POST http://localhost:3000/drafts -H "Content-Type: application/json" -d '{}'

# 2. Upload an image page (201 → returns page with imageUri)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/pages -F "page=@/path/to/recipe-photo.jpg"

# 3. Parse the draft (202 → returns {status: "PARSING"} for image drafts; poll GET /drafts/$DRAFT_ID until status is PARSED or NEEDS_RETAKE)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse -H "Content-Type: application/json" -d '{}'
# Poll until parsing completes:
# curl -s http://localhost:3000/drafts/$DRAFT_ID | jq '.status'

# 4. (Optional) Edit the candidate — triggers revalidation
curl -s -X PATCH http://localhost:3000/drafts/$DRAFT_ID/candidate \
  -H "Content-Type: application/json" \
  -d '{"title":"Fixed Title","ingredients":[{"id":"i1","text":"2 cups flour","orderIndex":0,"isHeader":false}],"steps":[{"id":"s1","text":"Mix ingredients.","orderIndex":0}]}'

# 5. Save the recipe (201 → {recipe, saveDecision}; 422 if BLOCK/RETAKE issues remain)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save -H "Content-Type: application/json" -d '{}'

# 6. Fetch the saved recipe
curl -s http://localhost:3000/recipes/$RECIPE_ID
```

**URL-based flow** (alternative to image — no page upload needed):

```bash
curl -s -X POST http://localhost:3000/drafts/url -H "Content-Type: application/json" -d '{"url":"https://www.bbcgoodfood.com/recipes/easy-pancakes"}'
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save -H "Content-Type: application/json" -d '{}'
```

> **Note:** All non-`/health` endpoints require a `Bearer` token. For curl-driven testing, get a token via `supabase.auth.signInWithPassword()` or the Supabase dashboard and pass it as `-H "Authorization: Bearer $TOKEN"`.

## Manual QA Checklist

Full checklist is in [`../QA_CHECKLIST.md`](../QA_CHECKLIST.md) with 11 scenarios, expected validation issues, save states, and machine transitions for each.

### 5 most important scenarios to test first

| Priority | Scenario | What it proves |
|---|---|---|
| 1 | **Clean single-page recipe (image)** | Happy path works end-to-end: capture → parse → validate → save |
| 2 | **Clean URL recipe (JSON-LD)** | URL cascade extracts structured data correctly |
| 3 | **Weak/blurred image** | RETAKE flow works, retake escalation to BLOCK |
| 4 | **FLAG confirm round-trip** | FLAG issues appear inline, user confirms/dismisses, SAVE produces SAVE_USER_VERIFIED |
| 5 | **Draft resume** | Abandoned drafts can be resumed at the correct machine state |
