# RecipeJar

## 1. What This Project Is

RecipeJar converts cookbook page photos and recipe URLs into structured digital recipes. It is a **trust-gated, validation-first** ingestion system. No recipe is saved unless it passes a deterministic validation engine. The system never trusts AI output directly — every parsed result is validated, and the user must explicitly resolve or acknowledge all issues before a save is allowed.

**What is implemented (MVP):**

- Fastify API server with full draft lifecycle (create, upload pages, parse, edit, validate, save)
- GPT-4o Vision image parsing (sends page photos to OpenAI, receives structured extraction)
- URL recipe parsing with 3-tier cascade: JSON-LD structured data → DOM boundary extraction → AI fallback
- Deterministic validation engine with 7 rule modules and 16 issue codes
- Save-decision logic with 3 save states (`SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`)
- Drizzle ORM schema with 7 PostgreSQL tables, indexes, cascade deletes
- Supabase Storage integration for recipe page images
- XState v5 state machine for mobile import flow (11 states, all transitions defined)
- React Native mobile app shell with navigation, screens, Zustand store, API client
- 74 automated tests (validation, parsing, save-decision, API integration, state machine)

**What is NOT implemented:**

- User authentication and multi-user data ownership (single-user MVP)
- Offline/local-first sync
- Recipe search, tagging, or collections
- Recipe editing after save
- Recipe sharing or export
- Production deployment configuration

---

## 2. Current Status

### Proven Live

All of the following were executed against a real Supabase PostgreSQL database and real OpenAI API key:

| What | Evidence |
|---|---|
| `drizzle-kit push` | All 7 tables, indexes, and foreign keys applied to Supabase |
| Fastify server startup | Listens on `0.0.0.0:3000` |
| `GET /health` | Returns `{"status":"ok"}` |
| `POST /drafts` | Image draft created in real DB, returns UUID and `CAPTURE_IN_PROGRESS` |
| `GET /drafts/:id` | Round-trips draft with pages and warningStates arrays |
| `POST /drafts/url` | URL draft created with `sourceType: "url"` |
| URL parse (JSON-LD) | BBC Good Food "Easy pancakes" — extracted title, 6 ingredients, 5 steps. Validation: `SAVE_CLEAN` |
| `POST /drafts/:id/save` | Recipe persisted to `recipes` table with ingredients and steps |
| `GET /recipes/:id` | Full recipe retrieval confirmed |
| Supabase Storage bucket creation | `recipe-pages` bucket created programmatically |
| Supabase Storage image upload | JPEG uploaded, public URL generated, cleanup confirmed |
| Image upload via API | `POST /drafts/:id/pages` multipart upload stores file in Supabase Storage, creates `draft_pages` row |
| GPT-4o Vision parse | Image parse pipeline called OpenAI, correctly identified non-recipe content, validation flagged expected issues |
| OpenAI API connectivity | GPT-4o model `gpt-4o-2024-08-06` responds, JSON mode works |

### Proven by Tests Only

| What | Test count | Coverage |
|---|---|---|
| Validation engine | 26 tests | All 16 issue codes, all severity levels, `canEnterCorrectionMode` logic |
| Save-decision logic | 8 tests | `SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`, partial dismissal |
| Parsing + normalization | 16 tests | `normalizeToCandidate`, `buildErrorCandidate`, JSON-LD extraction, DOM boundary |
| API integration | 16 tests | All 11 draft endpoints + 2 recipe endpoints, full parse-edit-save flow |
| XState machine | 8 tests | Resume routing, retake escalation, warning gate, guided correction |

### Proven on Android Emulator

| What | Evidence |
|---|---|
| Android native build | Gradle compiles all native modules, APK installs on emulator |
| Metro JS bundle | ~9 MB bundle loads, hot reload works |
| App startup + navigation | HomeScreen renders, navigation to RecipeDetail and ImportFlow works |
| Camera permission | Declared in AndroidManifest.xml, Android permission dialog appears |

### Not Yet Proven

| What | Why |
|---|---|
| iOS build (Simulator or device) | Requires macOS with Xcode. `ios/` directory and Podfile exist but `pod install` and `run-ios` not yet executed. |
| Camera capture flow | Requires physical device with camera or emulator with camera simulation |
| Multi-page image ordering UX | Screens exist but no device runtime test |
| Real cookbook photo parsing quality | GPT-4o API works, but accuracy on real handwritten/printed cookbook pages is untested |
| Bot-protected URL parsing | AllRecipes, Simply Recipes return 402/403. JSON-LD sites (BBC Good Food) work. |

---

## 3. System Architecture

### Monorepo Layout

```
RecipeJar/              ← npm workspace root
├── shared/             ← TypeScript domain types (no runtime deps)
├── server/             ← Fastify API + Drizzle ORM + parsers + validation
└── mobile/             ← React Native app + XState machine + Zustand store
```

Workspaces are linked via npm workspaces. `shared/` is referenced as `@recipejar/shared` by both `server/` and `mobile/`.

### Data Flow

```
Input (image or URL)
  → Parse (GPT-4o Vision for images, JSON-LD/DOM/AI cascade for URLs)
  → Normalize (raw extraction → ParsedRecipeCandidate with parseSignals)
  → Validate (7 rule modules run in fixed order → ValidationResult)
  → Edit (user corrects in PreviewEdit or GuidedCorrection)
  → Re-validate (PATCH /candidate triggers revalidation)
  → Save Decision (decideSave checks issues + dismissed warnings)
  → Save (recipe + ingredients + steps + source pages persisted atomically)
```

### Validation Engine

Located in `server/src/domain/validation/`. Runs 7 rule modules in this exact order:

```
1. rules.structure       → STRUCTURE_NOT_SEPARABLE (BLOCK)
2. rules.integrity       → CONFIRMED_OMISSION (BLOCK), SUSPECTED_OMISSION (CORRECTION_REQUIRED), MULTI_RECIPE_DETECTED (BLOCK)
3. rules.required-fields → TITLE_MISSING (CORRECTION_REQUIRED), INGREDIENTS_MISSING (BLOCK), STEPS_MISSING (BLOCK)
4. rules.ingredients     → INGREDIENT_MERGED, INGREDIENT_NAME_MISSING (CORRECTION_REQUIRED), INGREDIENT_QTY_OR_UNIT_MISSING (FLAG), OCR artifacts
5. rules.steps           → STEP_MERGED (CORRECTION_REQUIRED), OCR artifacts
6. rules.description     → DESCRIPTION_DETECTED (FLAG)
7. rules.retake          → LOW_CONFIDENCE_STRUCTURE (RETAKE or BLOCK if limit hit), POOR_IMAGE_QUALITY (RETAKE or BLOCK if limit hit)
```

Each issue has a severity. The validation result aggregates:
- `hasBlockingIssues` — any BLOCK severity
- `hasCorrectionRequiredIssues` — any CORRECTION_REQUIRED severity
- `requiresRetake` — any RETAKE severity
- `hasWarnings` — any FLAG severity
- `saveState` — `SAVE_CLEAN` only if no BLOCK, no CORRECTION_REQUIRED, no RETAKE
- `canEnterCorrectionMode` — true if (CORRECTION_REQUIRED or RETAKE) and no BLOCK

### Save-Decision Logic

Located in `server/src/domain/save-decision.ts`. Three possible outcomes:

| Condition | saveState | allowed |
|---|---|---|
| Any BLOCK, CORRECTION_REQUIRED, or RETAKE issue exists | `NO_SAVE` | `false` |
| Only FLAGs, and user dismissed at least one | `SAVE_USER_VERIFIED` | `true` |
| No FLAGs, or FLAGs exist but none dismissed | `SAVE_CLEAN` | `true` |

FLAGs never block saving. They trigger the warning gate UI so the user acknowledges them, but the user can always proceed.

### State Machine

Located in `mobile/src/features/import/machine.ts`. XState v5 machine with 11 states:

```
idle → capture (NEW_IMAGE_IMPORT)
idle → parsing (NEW_URL_IMPORT)
idle → resuming (RESUME_DRAFT)

capture → reorder (DONE_CAPTURING)
reorder → parsing (CONFIRM_ORDER)

parsing → previewEdit (clean parse)
parsing → retakeRequired (RETAKE issues)
parsing → guidedCorrection (CORRECTION_REQUIRED status)

previewEdit → saving (ATTEMPT_SAVE, SAVE_CLEAN, no warnings)
previewEdit → finalWarningGate (ATTEMPT_SAVE, has FLAGs only)
previewEdit → guidedCorrection (ENTER_CORRECTION)

retakeRequired → parsing (RETAKE_SUBMITTED)
retakeRequired → guidedCorrection (ENTER_CORRECTION)

guidedCorrection → previewEdit (CORRECTION_COMPLETE)

finalWarningGate → previewEdit (REVIEW_REQUESTED)
finalWarningGate → saving (SAVE_ANYWAY)

saving → saved (success, final state)
saving → previewEdit (error)
```

The machine invokes async actors for API calls (`createDraft`, `parseDraft`, `saveDraft`, `resumeDraft`, `updateCandidate`). Each actor calls the corresponding API endpoint.

---

## 4. Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| **Node.js** | 18.0.0 | https://nodejs.org/en/download — use LTS |
| **npm** | 9.0.0 | Bundled with Node.js |
| **Android Studio** | 2024.x (Ladybug+) | https://developer.android.com/studio — needed for Android emulator |
| **JDK** | 17 | Bundled with Android Studio, or https://adoptium.net/ |
| **CocoaPods** | 1.14+ | macOS only: `gem install cocoapods` |
| **Xcode** | 15+ | macOS only: App Store |

### Android Studio Setup (Windows)

1. Download and install Android Studio from https://developer.android.com/studio
2. During install, ensure these are checked: Android SDK, Android SDK Platform, Android Virtual Device
3. Open Android Studio → Settings → Languages & Frameworks → Android SDK
4. In SDK Platforms tab: install **Android 14 (API 34)** or higher
5. In SDK Tools tab: install **Android SDK Build-Tools 35.0.0**, **Android SDK Command-line Tools**, **Android Emulator**
6. Set environment variables:
   ```
   ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
   PATH += %ANDROID_HOME%\platform-tools
   PATH += %ANDROID_HOME%\emulator
   ```
7. Create an AVD: Android Studio → Device Manager → Create Virtual Device → Pixel 7 → API 34 → Download system image → Finish

Verify: open a terminal and run `adb devices`. If it prints `List of devices attached`, Android SDK is configured.

---

## 5. Environment Variables

Create `server/.env` by copying `server/.env.example`:

```bash
cd server
cp .env.example .env
```

Then fill in these values:

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-proj-your-key
PORT=3000
```

### Where to get each value

| Variable | Where to find it | What breaks if missing |
|---|---|---|
| `DATABASE_URL` | Supabase dashboard → Settings → Database → Connection string → select **Session pooler** tab. Use the pooler URL, not the direct connection URL. If your password has special characters (`@`, `*`, `/`, `&`), URL-encode them. | Server cannot start. All database operations fail. `drizzle-kit push` fails. |
| `SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL | Image upload/download fails. Draft page upload returns 500. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` key (under "Project API keys") | Image upload fails. Same as above. |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys → Create new secret key | `POST /drafts/:id/parse` fails for image drafts. URL AI fallback fails. JSON-LD and DOM extraction still work. |
| `PORT` | Optional. Defaults to `3000`. | Nothing. |

### Critical: Use the Session Pooler URL

Supabase direct-connect hostnames (`db.*.supabase.co`) resolve to IPv6-only addresses. Many Windows machines and some networks cannot route IPv6. The session pooler (`aws-0-REGION.pooler.supabase.com`) has IPv4 and works everywhere.

The pooler URL format:
```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Note the username is `postgres.PROJECT_REF` (with a dot), not just `postgres`.

### URL-encoding passwords

If your Supabase password contains special characters, encode them:

| Character | Encoded |
|---|---|
| `@` | `%40` |
| `*` | `%2A` |
| `/` | `%2F` |
| `&` | `%26` |
| `#` | `%23` |
| `+` | `%2B` |

Example: password `@Fht*mB_Q7/&-Uz` becomes `%40Fht%2AmB_Q7%2F%26-Uz`

---

## 6. First-Time Setup

Every command below should be run from the monorepo root (`RecipeJar/`) unless stated otherwise.

### Step 1: Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/RecipeJar.git
cd RecipeJar
```

### Step 2: Install all dependencies

```bash
npm install
```

Expected output ends with:

```
added XXX packages, and audited YYY packages in Zs
```

This installs dependencies for all three workspaces (`shared`, `server`, `mobile`) via npm workspaces.

### Step 3: Configure environment

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and fill in all four required values. See Section 5 above.

### Step 4: Create Supabase Storage bucket

In your Supabase dashboard: Storage → New bucket → Name: `recipe-pages` → Public: **enabled** → Create.

This bucket stores uploaded recipe page images.

### Step 5: Push database schema

```bash
cd server
npx drizzle-kit push
```

Expected output:

```
Reading config file 'drizzle.config.ts'
Using 'postgres' driver for database querying
[✓] Pulling schema from database...
[✓] Changes applied
```

This creates 7 tables: `drafts`, `draft_pages`, `draft_warning_states`, `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_source_pages`.

If you see `ECONNREFUSED` or `ENOTFOUND`: your `DATABASE_URL` is wrong, or you are not using the pooler URL. See Section 5.

### Step 6: Start the server

```bash
cd server
npm run dev
```

Expected output:

```
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
{"level":30,"msg":"Server listening on http://127.0.0.1:3000"}
```

### Step 7: Verify health

In a separate terminal:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

If using PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

### Step 8: Run tests

```bash
cd server
npm test
```

Expected output:

```
 ✓ tests/save-decision.test.ts (8 tests)
 ✓ tests/validation.engine.test.ts (26 tests)
 ✓ tests/machine.test.ts (8 tests)
 ✓ tests/parsing.test.ts (16 tests)
 ✓ tests/integration.test.ts (16 tests)

 Test Files  5 passed (5)
      Tests  74 passed (74)
```

All 74 tests should pass. Tests mock the database, Supabase, and OpenAI — they do not require live credentials.

---

## 7. Running the Backend

### Start command

```bash
cd server
npm run dev
```

This runs `tsx watch src/app.ts` — it auto-reloads on file changes.

For production (no watch):

```bash
cd server
npm start
```

### Expected logs on startup

```json
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
{"level":30,"msg":"Server listening at http://[LAN_IP]:3000"}
{"level":30,"msg":"Server listening on http://127.0.0.1:3000"}
```

Each incoming request logs:

```json
{"level":30,"reqId":"req-1","req":{"method":"GET","url":"/health"},"msg":"incoming request"}
{"level":30,"reqId":"req-1","res":{"statusCode":200},"responseTime":0.5,"msg":"request completed"}
```

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Error: DATABASE_URL environment variable is required` | `.env` file missing or `DATABASE_URL` not set | Create `server/.env` from `.env.example`, fill in values |
| `ECONNREFUSED 127.0.0.1:5432` | `DATABASE_URL` points to localhost or a stale env var is overriding `.env` | Check `.env` has the Supabase pooler URL. In PowerShell, run `Remove-Item Env:DATABASE_URL` to clear stale vars |
| `getaddrinfo ENOTFOUND db.*.supabase.co` | Using the direct-connect URL instead of the pooler URL | Switch `DATABASE_URL` to the session pooler URL (see Section 5) |
| `ENETUNREACH` after DNS resolves to IPv6 | Machine has no IPv6 route | Use the pooler URL which resolves to IPv4 |
| `XX000 Tenant or user not found` | Wrong pooler region | Find the correct region — your Supabase dashboard shows it under Settings → Database. Common: `us-west-2`, `us-east-1`, `eu-west-1` |
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required` | Missing Supabase credentials | Only thrown when a route that uses Supabase Storage is hit (image upload). Server starts without them. |
| Port 3000 already in use | Another process on port 3000 | Kill it, or set `PORT=3001` in `.env` |

---

## 8. Running the Mobile App

### Android (Windows or macOS)

#### Prerequisites check

```bash
adb devices
# Should print: List of devices attached

java -version
# Should print: openjdk version "17.x.x" or similar
```

If `adb` is not found, `ANDROID_HOME` is not set. See Section 4.
If `java` is not found, set `JAVA_HOME` to Android Studio's bundled JDK:
- **Windows:** `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"` (PowerShell, per-session) or set it permanently via System Properties → Environment Variables.
- **macOS:** `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`

#### Step 1: Start an Android emulator

Open Android Studio → Device Manager → click the play button on your AVD.

Or from terminal:

```bash
emulator -avd YOUR_AVD_NAME
```

To list available AVDs: `emulator -list-avds`

Wait until the emulator fully boots to the home screen.

#### Step 2: Start Metro bundler

In **Terminal 1**:

```bash
cd mobile
npx react-native start --reset-cache
```

Expected output:

```
info Welcome to React Native v0.76
info Starting dev server on port 8081...

Welcome to Metro v0.81.5
Fast - Scalable - Integrated

info Dev server ready
```

Leave this terminal running. **Do NOT press `a` to launch the app** — use the manual Gradle command below instead (see "Windows Gradle workaround").

#### Step 3: Build and install

In **Terminal 2**:

```bash
cd mobile
npx react-native run-android
```

This compiles the native Android project and installs the app on the emulator. First build takes 3-8 minutes. Subsequent builds are faster.

##### Windows Gradle workaround

On Windows, Gradle 8.x has a known file-locking bug in `.gradle/` cache directories. If you see:

```
Could not move temporary workspace (...) to immutable location
```

Use this command instead of `npx react-native run-android`:

```powershell
cd mobile\android
Remove-Item -Recurse -Force .\.gradle -ErrorAction SilentlyContinue
.\gradlew.bat app:installDebug --no-daemon --no-build-cache --project-cache-dir C:\tmp\rj-gradle -PreactNativeDevServerPort=8081
```

This bypasses the problematic default cache location. Metro (running in Terminal 1) will serve the JavaScript bundle once the native app is installed.

#### Step 4: Server URL for Android emulator

The Android emulator cannot reach `localhost`. The API client is already configured for this — in dev mode it uses `http://10.0.2.2:3000` which maps to the host machine's `localhost:3000`. No code change needed.

If you change the server port, update `mobile/src/services/api.ts` accordingly.

### iOS (macOS only)

#### Prerequisites

- Xcode 15+ (App Store)
- CocoaPods: `gem install cocoapods` (or `brew install cocoapods`)
- Xcode Command Line Tools: `xcode-select --install`

#### Step 1: Install iOS dependencies

```bash
cd mobile/ios
pod install
cd ..
```

If `pod install` fails with version conflicts, try:

```bash
cd mobile/ios
pod install --repo-update
cd ..
```

#### Step 2: Start Metro bundler

In **Terminal 1**:

```bash
cd mobile
npx react-native start --reset-cache
```

Leave this running.

#### Step 3: Build and run on iOS Simulator

In **Terminal 2**:

```bash
cd mobile
npx react-native run-ios
```

This builds the Xcode project and launches the app in the iOS Simulator. First build takes 5-10 minutes.

To target a specific simulator:

```bash
npx react-native run-ios --simulator="iPhone 16"
```

To list available simulators: `xcrun simctl list devices available`

#### Step 4: Build and run on a physical iPhone

1. Open `mobile/ios/RecipeJar.xcworkspace` in Xcode (use `.xcworkspace`, NOT `.xcodeproj`)
2. Select your Apple Developer team: Project Navigator → RecipeJar target → Signing & Capabilities → Team
3. Change the Bundle Identifier to something unique (e.g., `com.yourname.recipejar`)
4. Connect your iPhone via USB or Wi-Fi, select it as the build target in the Xcode toolbar
5. Press **Cmd+R** to build and run
6. On first install, you may need to trust the developer certificate on the device: Settings → General → VPN & Device Management → trust your profile

#### iOS-specific notes

- iOS Simulator uses `localhost`, so the default API URL (`http://localhost:3000`) works without changes.
- For a **physical iPhone**, change `BASE_URL` in `mobile/src/services/api.ts` to your Mac's LAN IP: `http://192.168.x.x:3000`. Find your LAN IP with `ifconfig | grep "inet " | grep -v 127.0.0.1`.
- Camera is **not available** in the iOS Simulator. Use a physical device to test camera capture flows.
- The app requires camera permission. The `Info.plist` should contain `NSCameraUsageDescription`. If missing, add it in Xcode: Info tab → add `Privacy - Camera Usage Description` with value `RecipeJar needs camera access to photograph cookbook pages`.

### Common mobile build errors

| Symptom | Cause | Fix |
|---|---|---|
| `SDK location not found` | `ANDROID_HOME` not set | Set env var to your Android SDK path. Create `mobile/android/local.properties` with `sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk` |
| `JAVA_HOME is not set` | JDK path not configured | Set `JAVA_HOME` to Android Studio's bundled JBR (see prerequisites above) |
| `No connected devices` | Emulator not started | Start an AVD from Android Studio Device Manager before running the build |
| `Could not move temporary workspace` | Gradle file-locking on Windows | Use the `--project-cache-dir C:\tmp\rj-gradle` workaround above |
| `ViewManagerWithGeneratedInterface` errors | Library requires New Architecture | Ensure `newArchEnabled=false` in `mobile/android/gradle.properties` |
| `listen EADDRINUSE :::8081` | Another Metro instance running | Kill it: `Get-NetTCPConnection -LocalPort 8081 \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` (PowerShell) |
| `Unable to resolve module` or SHA-1 error | Metro cache stale | Run `npx react-native start --reset-cache` |
| `pod install` fails (iOS) | CocoaPods not installed or outdated | `gem install cocoapods` then `cd mobile/ios && pod install --repo-update` |
| `No bundle URL present` (iOS) | Metro not running | Start Metro in a separate terminal first |

### Physical device (Android)

For a USB-connected Android device:

1. Enable Developer Options and USB Debugging on the device
2. Connect via USB, accept the debugging prompt
3. `adb devices` should list the device
4. `npx react-native run-android` targets the physical device

For physical device networking, change `BASE_URL` in `mobile/src/services/api.ts` to your machine's LAN IP:

```typescript
const BASE_URL = __DEV__
  ? "http://192.168.x.x:3000"
  : "https://api.recipejar.app";
```

Find your LAN IP: `ipconfig` (Windows) or `ifconfig` (macOS).

---

## 9. End-to-End Test Flow

This is a scripted walkthrough you can execute against the running server to verify the full pipeline. Uses `curl`. Replace `$DRAFT_ID` and `$RECIPE_ID` with actual UUIDs from responses.

### 9.1 Create a draft

```bash
curl -s -X POST http://localhost:3000/drafts \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (201):

```json
{
  "id": "UUID",
  "status": "CAPTURE_IN_PROGRESS",
  "sourceType": "image",
  "originalUrl": null,
  "parsedCandidateJson": null,
  "editedCandidateJson": null,
  "validationResultJson": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Save the `id` as `$DRAFT_ID`.

### 9.2 Upload an image page

```bash
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/pages \
  -F "page=@/path/to/recipe-photo.jpg"
```

Expected response (201):

```json
{
  "id": "UUID",
  "draftId": "$DRAFT_ID",
  "orderIndex": 0,
  "imageUri": "$DRAFT_ID/UUID.jpg",
  "retakeCount": 0,
  "ocrText": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 9.3 Parse the draft

```bash
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (200):

```json
{
  "status": "PARSED",
  "candidate": {
    "title": "Recipe Title",
    "ingredients": [...],
    "steps": [...],
    "parseSignals": { "structureSeparable": true, ... }
  },
  "validationResult": {
    "saveState": "SAVE_CLEAN",
    "issues": [...],
    "hasBlockingIssues": false
  }
}
```

The `status` field will be one of: `PARSED`, `NEEDS_RETAKE`, `IN_GUIDED_CORRECTION`.

### 9.4 Edit the candidate (optional)

```bash
curl -s -X PATCH http://localhost:3000/drafts/$DRAFT_ID/candidate \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fixed Title",
    "ingredients": [{"id":"i1","text":"2 cups flour","orderIndex":0,"isHeader":false}],
    "steps": [{"id":"s1","text":"Mix ingredients.","orderIndex":0}]
  }'
```

Expected response (200): updated draft with re-validated `validationResult`.

### 9.5 Save the recipe

```bash
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (201):

```json
{
  "recipe": {
    "id": "RECIPE_UUID",
    "title": "Recipe Title",
    "saveState": "SAVE_CLEAN",
    "ingredients": [...],
    "steps": [...]
  },
  "saveDecision": {
    "saveState": "SAVE_CLEAN",
    "allowed": true,
    "isUserVerified": false,
    "hasUnresolvedWarnings": false
  }
}
```

If validation has unresolved BLOCK/CORRECTION_REQUIRED/RETAKE issues, this returns **422** with `"error": "Cannot save"`.

### 9.6 Fetch the saved recipe

```bash
curl -s http://localhost:3000/recipes/$RECIPE_ID
```

Expected response (200): full recipe with `title`, `ingredients`, `steps`, `saveState`.

### 9.7 URL-based flow (alternative to image)

```bash
# Create URL draft
curl -s -X POST http://localhost:3000/drafts/url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbcgoodfood.com/recipes/easy-pancakes"}'

# Parse (no image upload needed)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse \
  -H "Content-Type: application/json" \
  -d '{}'

# Save
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 10. Manual QA Checklist

Full checklist is in `QA_CHECKLIST.md` with 11 scenarios, expected validation issues, save states, and machine transitions for each.

### 5 most important scenarios to test first

| Priority | Scenario | What it proves |
|---|---|---|
| 1 | **Clean single-page recipe (image)** | Happy path works end-to-end: capture → parse → validate → save |
| 2 | **Clean URL recipe (JSON-LD)** | URL cascade extracts structured data correctly |
| 3 | **Weak/blurred image** | RETAKE flow works, retake escalation to guidedCorrection |
| 4 | **Warning gate round-trip** | FLAG issues trigger warning gate, SAVE_ANYWAY produces SAVE_USER_VERIFIED |
| 5 | **Draft resume** | Abandoned drafts can be resumed at the correct machine state |

---

## 11. Key Concepts

### Validation Severities

There are 5 severity levels, ordered from least to most severe:

| Severity | Effect on save | User action required | Example |
|---|---|---|---|
| `PASS` | None | None | (not emitted — absence of issues means pass) |
| `FLAG` | Does NOT block save | User should acknowledge via warning gate | `DESCRIPTION_DETECTED`, `INGREDIENT_QTY_OR_UNIT_MISSING` |
| `CORRECTION_REQUIRED` | **Blocks save** | User must fix in guided correction | `TITLE_MISSING`, `SUSPECTED_OMISSION`, `INGREDIENT_MERGED` |
| `RETAKE` | **Blocks save** | User should retake the photo | `LOW_CONFIDENCE_STRUCTURE`, `POOR_IMAGE_QUALITY` |
| `BLOCK` | **Blocks save**, no correction possible | User must start over or enter guided correction if allowed | `STRUCTURE_NOT_SEPARABLE`, `INGREDIENTS_MISSING`, `RETAKE_LIMIT_REACHED` |

### SAVE_CLEAN vs SAVE_USER_VERIFIED

- `SAVE_CLEAN`: No issues of any kind, or only un-dismissed FLAGs. The recipe saved exactly as the system validated it.
- `SAVE_USER_VERIFIED`: The user dismissed at least one FLAG in the warning gate. The recipe is saved, but the system records that the user overrode a warning.
- `NO_SAVE`: Cannot save. BLOCK, CORRECTION_REQUIRED, or RETAKE issues remain.

### Why FLAGs do not block save

FLAGs represent observations, not errors. A missing quantity ("salt" with no amount) is valid — many recipes write it that way. A detected description is informational. The system surfaces these so the user is aware, but never prevents saving based on them.

### Why omission cannot be downgraded

`CONFIRMED_OMISSION` is always `BLOCK`. `SUSPECTED_OMISSION` is always `CORRECTION_REQUIRED`. These severities cannot be weakened because missing recipe content fundamentally compromises the recipe. If the system suspects content is missing, the user must confirm or correct — there is no "dismiss" option for omissions.

### Retake escalation

When `LOW_CONFIDENCE_STRUCTURE` or `POOR_IMAGE_QUALITY` fires:
1. First occurrence: severity is `RETAKE` — user can retake the photo
2. After 2 retakes per page (`retakeCount >= 2` on all pages): severity escalates to `BLOCK` as `RETAKE_LIMIT_REACHED`
3. At this point, `canEnterCorrectionMode` becomes true (if no other BLOCK issues), and the user enters guided correction to manually fix the content

---

## 12. Project Structure

```
RecipeJar/
├── package.json                          # npm workspace root
├── .gitignore
├── README.md                             # this file
├── QA_CHECKLIST.md                       # manual QA test scenarios
│
├── shared/                               # shared TypeScript types (no runtime deps)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # barrel export
│       └── types/
│           ├── draft.types.ts            # DraftStatus, RecipeDraft, EditedRecipeCandidate, DraftWarningState
│           ├── parsed-candidate.types.ts # ParsedRecipeCandidate, parseSignals shape
│           ├── recipe.types.ts           # Recipe, RecipeIngredientEntry, RecipeStepEntry
│           ├── save-decision.types.ts    # SaveDecision, RecipeSaveState
│           ├── signal.types.ts           # IngredientSignal, StepSignal, SourcePage
│           └── validation.types.ts       # ValidationResult, ValidationIssue, ValidationSeverity, ValidationIssueCode
│
├── server/                               # Fastify API server
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                      # template for environment variables
│   ├── drizzle.config.ts                 # Drizzle Kit configuration
│   ├── vitest.config.ts                  # test runner config
│   ├── drizzle/                          # generated migration SQL
│   │   └── 0000_new_raider.sql
│   ├── src/
│   │   ├── app.ts                        # server entry point, Fastify setup, route registration
│   │   ├── api/
│   │   │   ├── drafts.routes.ts          # 11 draft endpoints (create, upload, parse, edit, save, etc.)
│   │   │   └── recipes.routes.ts         # 2 recipe endpoints (list, get by id)
│   │   ├── domain/
│   │   │   ├── save-decision.ts          # decideSave() — determines SAVE_CLEAN / SAVE_USER_VERIFIED / NO_SAVE
│   │   │   └── validation/
│   │   │       ├── validation.engine.ts  # validateRecipe() — runs all 7 rule modules
│   │   │       ├── rules.structure.ts    # STRUCTURE_NOT_SEPARABLE
│   │   │       ├── rules.integrity.ts    # CONFIRMED_OMISSION, SUSPECTED_OMISSION, MULTI_RECIPE_DETECTED
│   │   │       ├── rules.required-fields.ts # TITLE_MISSING, INGREDIENTS_MISSING, STEPS_MISSING
│   │   │       ├── rules.ingredients.ts  # per-ingredient signals (merged, missing name, qty, OCR)
│   │   │       ├── rules.steps.ts        # per-step signals (merged, OCR)
│   │   │       ├── rules.description.ts  # DESCRIPTION_DETECTED
│   │   │       └── rules.retake.ts       # LOW_CONFIDENCE_STRUCTURE, POOR_IMAGE_QUALITY, RETAKE_LIMIT_REACHED
│   │   ├── observability/
│   │   │   └── event-logger.ts           # structured event logging (draft_created, parse_started, etc.)
│   │   ├── parsing/
│   │   │   ├── normalize.ts             # normalizeToCandidate(), buildErrorCandidate()
│   │   │   ├── image/
│   │   │   │   └── image-parse.adapter.ts # GPT-4o Vision: sends page images, receives structured extraction
│   │   │   └── url/
│   │   │       ├── url-parse.adapter.ts  # orchestrates 3-tier cascade: structured → DOM → AI
│   │   │       ├── url-fetch.service.ts  # fetches URL HTML with timeout and user-agent
│   │   │       ├── url-structured.adapter.ts # extracts JSON-LD Recipe schema
│   │   │       ├── url-dom.adapter.ts    # Cheerio-based DOM boundary extraction
│   │   │       └── url-ai.adapter.ts     # GPT-4o fallback for unstructured HTML
│   │   └── persistence/
│   │       ├── db.ts                     # Drizzle client initialization (lazy, uses DATABASE_URL)
│   │       ├── schema.ts                # 7 table definitions with indexes and FK cascades
│   │       ├── drafts.repository.ts     # CRUD for drafts, pages, warning states
│   │       └── recipes.repository.ts    # CRUD for recipes, ingredients, steps, source pages
│   └── tests/
│       ├── validation.engine.test.ts    # 26 tests — all validation rules
│       ├── save-decision.test.ts        # 8 tests — save decision logic
│       ├── parsing.test.ts             # 16 tests — normalization, error candidate, extractors
│       ├── integration.test.ts         # 16 tests — all API endpoints (mocked DB/storage)
│       └── machine.test.ts            # 8 tests — XState machine transitions
│
└── mobile/                              # React Native app
    ├── package.json
    ├── tsconfig.json
    ├── app.json                         # native project name: "RecipeJar"
    ├── index.js                         # app entry point
    ├── App.tsx                          # root component, NavigationContainer, stack navigator
    ├── babel.config.js                  # RN babel preset + reanimated plugin
    ├── metro.config.js                  # monorepo watch folders, shared alias
    ├── react-native.config.js           # CLI project source dirs
    ├── Gemfile                          # Ruby deps for CocoaPods (iOS)
    ├── .gitignore
    ├── android/                         # Android native project (com.recipejar)
    ├── ios/                             # iOS native project (RecipeJar)
    └── src/
        ├── features/
        │   └── import/
        │       ├── machine.ts           # XState v5 import flow state machine (11 states)
        │       ├── CaptureView.tsx      # camera capture UI
        │       ├── ReorderView.tsx      # page reorder UI
        │       ├── ParsingView.tsx      # loading/parsing UI
        │       ├── PreviewEditView.tsx  # recipe preview and edit UI
        │       ├── RetakeRequiredView.tsx # retake prompt UI
        │       ├── GuidedCorrectionView.tsx # manual correction UI
        │       ├── WarningGateView.tsx  # warning acknowledgment UI
        │       └── SavedView.tsx        # success UI
        ├── navigation/
        │   └── types.ts                # RootStackParamList type definition
        ├── screens/
        │   ├── HomeScreen.tsx           # recipe list, FABs for import
        │   ├── ImportFlowScreen.tsx     # renders state machine views
        │   └── RecipeDetailScreen.tsx   # single recipe view
        ├── services/
        │   └── api.ts                  # API client (drafts + recipes endpoints)
        └── stores/
            └── recipes.store.ts        # Zustand store for recipe list
```

---

## 13. Common Failure Points

### Supabase IPv6 DNS Issue

**Problem:** Supabase direct-connect hostnames (`db.*.supabase.co`) have only AAAA (IPv6) DNS records. Node.js on Windows often cannot resolve or route to these addresses. Symptoms: `getaddrinfo ENOTFOUND`, `ENETUNREACH`.

**Fix:** Use the **session pooler** URL instead. Format: `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`. This resolves to IPv4.

### Missing `.env` File

**Problem:** Server crashes immediately with `DATABASE_URL environment variable is required`.

**Fix:** Copy `server/.env.example` to `server/.env` and fill in values.

### Stale Environment Variables

**Problem:** On Windows, if you previously set `DATABASE_URL` as a system/user environment variable, it overrides the `.env` file.

**Fix:** In PowerShell, run `Remove-Item Env:DATABASE_URL` before starting the server. Or delete the system environment variable.

### Mobile Build Fails — No Android SDK

**Problem:** `npx react-native run-android` fails with "SDK location not found".

**Fix:** Install Android Studio, set `ANDROID_HOME` environment variable. See Section 4.

### Metro Port Conflict

**Problem:** `listen EADDRINUSE :::8081`.

**Fix:** Kill the existing process on port 8081. On Windows: `Get-NetTCPConnection -LocalPort 8081 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`.

### OpenAI Rate Limit or Invalid Key

**Problem:** `POST /drafts/:id/parse` returns 500 for image drafts.

**Fix:** Check `OPENAI_API_KEY` in `.env`. Verify the key is active at https://platform.openai.com/api-keys. Note: URL parsing with JSON-LD structured data does NOT require OpenAI and works without this key.

### Bot-Protected URLs Return Empty Parse

**Problem:** URL drafts for AllRecipes, Simply Recipes, etc. parse but return empty candidates with `NO_SAVE`.

**Cause:** These sites block server-side HTTP requests (402/403). The server-side fetch gets rejected.

**Workaround:** Use recipe sites that serve JSON-LD (BBC Good Food, most WordPress recipe blogs). This is a known MVP limitation.

### react-native-screens / react-native-gesture-handler Build Error

**Problem:** Android native build fails with `ViewManagerWithGeneratedInterface` unresolved supertype errors.

**Cause:** The v4.x `react-native-screens` and v2.21+ `react-native-gesture-handler` require React Native's New Architecture (Fabric). With `newArchEnabled=false`, the generated interfaces don't exist.

**Fix:** The project pins `react-native-screens@~3.35.0` and `react-native-gesture-handler@~2.20.2`, which are the last versions compatible with the old architecture. If you upgrade these packages, verify `newArchEnabled` in `mobile/android/gradle.properties`.

### Gradle File-Locking on Windows

**Problem:** `Could not move temporary workspace (...) to immutable location` during Android build.

**Cause:** Gradle 8.x on Windows has a known bug where cache files get locked by the daemon or other processes.

**Fix:** Run the build with `--no-daemon --no-build-cache --project-cache-dir C:\tmp\rj-gradle`. See Section 8 for the full command. Also ensure Android Studio is closed when building from the command line.

---

## 14. Development Workflow

### Adding a validation rule

1. Create a new file in `server/src/domain/validation/` following the pattern of existing rule files (e.g., `rules.description.ts`)
2. The function signature must be: `(candidate: ParsedRecipeCandidate) => ValidationIssue[]`
3. Add the issue code to `shared/src/types/validation.types.ts` → `ValidationIssueCode` union
4. Import and add your rule to the `issues` array in `validation.engine.ts` — order matters (rules run top to bottom)
5. Add tests in `server/tests/validation.engine.test.ts`

### Modifying parsing

- **Image parsing:** Edit `server/src/parsing/image/image-parse.adapter.ts`. This constructs the GPT-4o prompt and parses the response.
- **URL parsing:** The cascade is in `server/src/parsing/url/url-parse.adapter.ts`. It tries structured data first (`url-structured.adapter.ts`), then DOM extraction (`url-dom.adapter.ts`), then AI fallback (`url-ai.adapter.ts`). To change priority or add a new extraction method, modify the cascade in `url-parse.adapter.ts`.
- **Normalization:** `server/src/parsing/normalize.ts` converts raw extraction output into `ParsedRecipeCandidate` with `parseSignals`. To add new signals, extend the `parseSignals` interface in `shared/src/types/parsed-candidate.types.ts`.

### Adding API endpoints

1. Create or edit a route file in `server/src/api/`
2. Register it in `server/src/app.ts` via `app.register(yourRoutes)`
3. Add integration tests in `server/tests/integration.test.ts`

### Extending the state machine

1. Edit `mobile/src/features/import/machine.ts`
2. Add new states to the `states` object
3. Add new events to the `ImportEvent` union type
4. If the state invokes an async operation, add a new actor in the `actors` object of `setup()`
5. Create the corresponding view component in `mobile/src/features/import/`
6. Add the state→component mapping in `mobile/src/screens/ImportFlowScreen.tsx`
7. Add tests in `server/tests/machine.test.ts`

---

## 15. Next Steps / Known Gaps

### Mobile runtime validation

The Android build is proven — the app compiles, installs on an emulator, and runs successfully with navigation working across all screens. The iOS build has not yet been executed. The first `pod install` + `run-ios` may surface CocoaPods linking issues with `react-native-vision-camera` or `react-native-reanimated` that require Podfile adjustments or Xcode build settings changes.

### Camera integration

`react-native-vision-camera` is declared as a dependency but the `CaptureView.tsx` component has not been tested on a real camera. Camera permission is declared in `AndroidManifest.xml`. For iOS, add `NSCameraUsageDescription` to `Info.plist` (see Section 8). The iOS Simulator does not support camera — use a physical device for camera testing.

### Image parsing quality

GPT-4o Vision API is connected and functional. Actual extraction quality on real cookbook photos (handwritten, glossy pages, multi-column layouts, faded text) is untested. The validation engine will catch many extraction failures, but the parser prompts may need tuning based on real-world results.

### Bot-protected URLs

Server-side fetching is blocked by major recipe sites (AllRecipes, Simply Recipes, Food Network). The JSON-LD cascade works for sites that serve structured data. Options for future work: client-side URL extraction (fetch from the mobile app's webview), or a headless browser service.

### Authentication

The MVP is single-user. There is no authentication, no user table, no data-ownership enforcement. All drafts and recipes are globally accessible. Adding auth requires: a user table, session/JWT middleware on Fastify, user_id foreign keys on drafts/recipes, and RLS policies in Supabase.

### Offline / local-first

Not implemented. The mobile app requires network access to the API server for all operations. Future work: local SQLite database with sync, optimistic UI updates.
