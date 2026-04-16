# Running the Backend & Mobile App

> **What this doc covers:** Day-to-day commands for running the Fastify API and the React Native app, including the fast iteration workflow, Android setup, iOS device default, and common build errors. For first-time install / env configuration, see [`SETUP.md`](SETUP.md). Back to [`../README.md`](../README.md).

## Running the Backend

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
| `getaddrinfo ENOTFOUND db.*.supabase.co` | Using the direct-connect URL instead of the pooler URL | Switch `DATABASE_URL` to the session pooler URL (see [`SETUP.md`](SETUP.md)) |
| `ENETUNREACH` after DNS resolves to IPv6 | Machine has no IPv6 route | Use the pooler URL which resolves to IPv4 |
| `XX000 Tenant or user not found` | Wrong pooler region | Find the correct region — your Supabase dashboard shows it under Settings → Database. Common: `us-west-2`, `us-east-1`, `eu-west-1` |
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required` | Missing Supabase credentials | Only thrown when a route that uses Supabase Storage is hit (image upload). Server starts without them. |
| Port 3000 already in use | Another process on port 3000 | Kill it, or set `PORT=3001` in `.env` |

---

## Running the Mobile App

### Fast iteration workflow (default)

Use this for day-to-day work on screens, navigation, state, and API calls. **You should not run a full native build on every save** — that is what leads to 10–20 minute loops.

1. **API + Metro (required for a physical iPhone):** from the **repo root** (`Orzo/`), run:
   ```bash
   npm run dev:phone
   ```
   This starts **both** the Fastify API (`:3000`) and Metro (`:8081`) in one terminal. Leave it running while you test on the phone; **Ctrl+C** stops both. (Equivalent: two terminals — `cd server && npm run dev` and `cd mobile && npm start`.)

   To **start only what's missing** in the background (e.g. after a reboot), from the repo root: `npm run ensure:phone` (runs [`scripts/ensure-phone-dev.sh`](../scripts/ensure-phone-dev.sh)).
2. **Metro alone (if you already started the server elsewhere):**
   ```bash
   cd mobile
   npm start
   ```
   Same as `./run.sh metro`. Metro keeps its transform cache so startup and rebundling stay fast.
3. **Put the app on the phone** (skip when the app is already installed and you only changed JS; use a **second terminal** while `npm run dev:phone` stays running in the first — or after native changes):
   - **iOS — default for this project:** your **physical iPhone** over **Wi‑Fi**: `cd mobile && ./run.sh device` (see **iOS Step 4** for one-time wireless pairing). This builds, installs, and **opens the app on the phone**, not the simulator.
   - **iOS — simulator (only if you want it):** `cd mobile && ./run.sh sim` — use when you explicitly prefer the simulator (camera flows still need a real device).
   - **Android emulator:** `cd mobile && npx react-native run-android`.
4. **While you edit** files under `mobile/src/**` (and most JavaScript/TypeScript): changes apply via **Fast Refresh**. If something looks stuck, reload (**Cmd+R** in Simulator, or **shake the iPhone → Reload** on device) or use the dev menu. **Do not** run `./run.sh device` / `run-android` again for those edits — that triggers a **slow full Xcode/Gradle build** and is only needed when the **native** side changes.

**JavaScript vs native — what is "fast"**

| You changed | How you preview on the phone |
|---|---|
| `mobile/src/**`, `App.tsx`, styles, navigation, Zustand, etc. | Keep **`npm run dev:phone`** (or Metro + API) running; save the file → **Fast Refresh**, or shake → **Reload**. **No `./run.sh device`.** |
| `LaunchScreen.storyboard`, `Info.plist`, Android `res/`, new native dependency, `Podfile` | Metro **cannot** update these. Run **`./run.sh device`** (or `./run.sh sim`) **once** after the change. `./run.sh device` and `./run.sh sim` **stop any other `xcodebuild` first** so you don't hit a locked DerivedData database. |

**What those repeating "Building the app…" lines mean**

React Native's CLI prints lines like `- Building the app.....` over and over while **`xcodebuild` is running**. That is **one animated progress indicator**, not dozens of separate builds. Stopping **concurrent** `xcodebuild` processes (what `run.sh` does) prevents **two** builds from fighting over DerivedData; it does **not** make a **single** Xcode compile finish faster.

**How long native builds take (not the Metro / Fast Refresh path)**

| When | Typical behavior |
|---|---|
| **You only change `mobile/src/**` (JS/TS)** | **No** `./run.sh device` — seconds with Fast Refresh. |
| **First** device/simulator build after clone, or after **Clean Build Folder** / wiping DerivedData | Often **many minutes** (Pods, Swift/ObjC, all native deps). |
| **Later** `./run.sh device` with small native edits | Usually **much shorter** — incremental compile. Still slower than JS reload. |
| **Terminal looks "stuck" with no new text** | Often **not** a second build. Check **Xcode**, **Keychain**, or **macOS** for code-signing, Apple ID, 2FA, or "verification" dialogs. Until you complete those, `xcodebuild` waits. Opening **`Orzo.xcworkspace`** in Xcode and building once (**Cmd+R**) surfaces the same prompts in the GUI. |

**When you need more than the default**

| Situation | What to run |
|---|---|
| Weird Metro errors, stale resolution, big dependency or branch switch | `cd mobile && npm run start:reset` or `./run.sh metro-fresh` (cold Metro cache) |
| Changed `Podfile` / ran `pod install`, added a library with native code, edited `ios/` or `android/` | Full native install again: **`./run.sh device`** (physical iPhone), or `./run.sh sim` if you chose simulator, or `npx react-native run-android` |
| Release archive, clean-room verification, or Xcode "weird build" | Xcode **Product → Clean Build Folder**, then build; or delete Derived Data only when necessary |

The platform-specific steps below spell out prerequisites and one-time setup; **use `npm start` in Terminal 1** for normal development, not `--reset-cache` every time.

### Android (Windows or macOS)

#### Prerequisites check

```bash
adb devices
# Should print: List of devices attached

java -version
# Should print: openjdk version "17.x.x" or similar
```

If `adb` is not found, `ANDROID_HOME` is not set. See [`SETUP.md`](SETUP.md).
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
npm start
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

If Metro misbehaves after dependency or branch changes, use `npm run start:reset` once (see **Fast iteration workflow** at the top of this section).

#### Step 3: Build and install

In **Terminal 2**:

```bash
cd mobile
npx react-native run-android
```

This compiles the native Android project and installs the app on the emulator. First build takes 3-8 minutes. **After that, leave Metro running and use Fast Refresh** — only re-run this step when the native project changes (see **Fast iteration workflow**).

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

**Documented default:** develop and run on **Lincoln Ware's iPhone** (physical device) **wirelessly** after the one-time **Connect via network** step in Xcode. **`./run.sh device`** targets that phone by UDID in [`mobile/run.sh`](../mobile/run.sh), builds from the CLI, installs, and launches the app on the device. The **simulator** is optional — use **`./run.sh sim`** only when you explicitly want the iOS Simulator instead.

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
npm start
```

Leave this running. Equivalent: `cd mobile && ./run.sh metro`.

Use `npm run start:reset` or `./run.sh metro-fresh` only when you need a cold Metro cache (troubleshooting or large JS tree changes) — not every session.

#### Step 3: Build and run (Cursor-driven workflow, recommended)

A convenience script [`mobile/run.sh`](../mobile/run.sh) provides all common commands without needing Xcode open.

**Normal path — physical iPhone (wireless):** after Metro is running and Step 4 pairing is done once:

```bash
cd mobile
./run.sh device
```

That runs `react-native run-ios` with the UDID for **Lincoln Ware's iPhone** (see comment in `run.sh`). Xcode builds the app, installs it on the phone, and **opens it on the device** over Wi‑Fi (same network as the Mac). It does **not** use the simulator unless you run `./run.sh sim` instead.

**All commands:**

```bash
cd mobile

# Start Metro (default — fast, reuses cache)
./run.sh metro

# Start Metro with empty cache (troubleshooting / rare)
./run.sh metro-fresh

# DEFAULT: physical iPhone — build, install, launch on device (wireless after Step 4)
./run.sh device

# Optional: only when you want the simulator instead of the phone
./run.sh sim

# Optional: different iPhone — UDID from Xcode → Window → Devices and Simulators
# export IOS_DEVICE_UDID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" && ./run.sh device
```

**Key insight:** Most code changes are JS-only (screens, components, styles, state, API calls) and do NOT require a rebuild. Metro Fast Refresh updates the app while Metro stays running. You only need **`./run.sh device`** (or `./run.sh sim` if you use the simulator) again when native code or iOS project settings change (e.g., adding a library with native modules, modifying `project.pbxproj`, after `pod install`).

To list available simulators: `xcrun simctl list devices available`

#### Step 4: Physical iPhone — one-time wireless setup (required for `./run.sh device`)

**One-time wireless debugging setup (requires Xcode + USB):**
1. Connect **Lincoln Ware's iPhone** via USB
2. Open Xcode → Window → Devices and Simulators
3. Select the iPhone, check **"Connect via network"**
4. Wait for the globe icon to appear next to the device
5. Disconnect USB — future **`./run.sh device`** runs deploy **wirelessly** (phone and Mac on the same Wi‑Fi)

**After setup**, use `./run.sh device` from the terminal to build, install, and launch on the phone. No USB or Xcode GUI required for day-to-day runs.

If you replace the phone or the UDID changes, either update the default in `run.sh` or set `IOS_DEVICE_UDID` (see Step 3).

**Alternative (Xcode GUI):**
1. Open `mobile/ios/Orzo.xcworkspace` in Xcode (use `.xcworkspace`, NOT `.xcodeproj`)
2. Select your Apple Developer team: Project Navigator → Orzo target → Signing & Capabilities → Team
3. Connect your iPhone via USB or Wi-Fi, select it as the build target
4. Press **Cmd+R** to build and run

#### Step 5: Run iOS UI tests on a physical iPhone

The project includes an XCUITest target (`OrzoUITests`) with 21 automated UI tests. These tests launch the app on the device and interact with the UI programmatically.

**Prerequisites:**
- Metro must be running (Step 2 above — `npm start` / `./run.sh metro`)
- The API server should be running (`cd server && npm run dev`) if you want tests that depend on API responses to exercise their full paths
- Your iPhone must be selected as the build destination in the Xcode toolbar

**To run:**

1. Open `mobile/ios/Orzo.xcworkspace` in Xcode (use `.xcworkspace`, NOT `.xcodeproj`)
2. Select your iPhone as the destination in the Xcode toolbar
3. Press **Cmd+U** to run all tests

**What to expect:**
- The app will open and close ~20 times on your iPhone (once per test method)
- You'll see a "Downloading" progress bar as Metro sends the JS bundle to the device on each launch
- The full suite takes 10-15 minutes on a physical device because each test relaunches the app and re-downloads the JS bundle
- Results appear in Xcode's Test Navigator (Cmd+6) as green checkmarks or red X marks
- Tests that require specific server responses (e.g., a parse returning warnings) use `guard ... else { return }` and skip gracefully

**If tests can't find elements:**
- React Native elements use `testID` props which map to `accessibilityIdentifier` on iOS
- All XCUITest queries use `app.descendants(matching: .any)["identifier"]` to search the entire element tree regardless of native element type — this is required because React Native's `TouchableOpacity` doesn't always map to a native button
- The debug test (`testAAA_DebugDumpHomeScreen`) prints the full accessibility tree to the Xcode console — run it first if element queries are failing

**To run individual tests:**
- Open Test Navigator (Cmd+6), click the play button next to any specific test

#### iOS-specific notes

- iOS Simulator uses `localhost`, so the default API URL (`http://localhost:3000`) works without changes.
- For a **physical iPhone**, change `BASE_URL` in `mobile/src/services/api.ts` to your Mac's LAN IP: `http://192.168.x.x:3000`. Find your LAN IP with `ifconfig | grep "inet " | grep -v 127.0.0.1`.
- **Metro on a physical iPhone:** Debug builds read **`OrzoDevPackagerHost`** in [`mobile/ios/Orzo/Info.plist`](../mobile/ios/Orzo/Info.plist) (host only, no `http://`, no port). It **must be the same LAN IP** as in `api.ts`, or the phone may load a **stale JS bundle** while API calls still work — so the UI never matches your latest `mobile/src` edits. After changing that plist key, run **`./run.sh device`** once. The simulator ignores this key and still uses the default packager discovery.
- Camera is **not available** in the iOS Simulator. Use a physical device to test camera capture flows.
- The app requires camera permission. The `Info.plist` should contain `NSCameraUsageDescription`. If missing, add it in Xcode: Info tab → add `Privacy - Camera Usage Description` with value `Orzo needs camera access to photograph cookbook pages`.

### Common mobile build errors

| Symptom | Cause | Fix |
|---|---|---|
| `SDK location not found` | `ANDROID_HOME` not set | Set env var to your Android SDK path. Create `mobile/android/local.properties` with `sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk` |
| `JAVA_HOME is not set` | JDK path not configured | Set `JAVA_HOME` to Android Studio's bundled JBR (see prerequisites above) |
| `No connected devices` | Emulator not started | Start an AVD from Android Studio Device Manager before running the build |
| `Could not move temporary workspace` | Gradle file-locking on Windows | Use the `--project-cache-dir C:\tmp\rj-gradle` workaround above |
| `ViewManagerWithGeneratedInterface` errors | Library requires New Architecture | Ensure `newArchEnabled=false` in `mobile/android/gradle.properties` |
| `listen EADDRINUSE :::8081` | Another Metro instance running | Kill it: `Get-NetTCPConnection -LocalPort 8081 \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` (PowerShell) |
| `Unable to resolve module` or SHA-1 error | Metro cache stale | Run `cd mobile && npm run start:reset` or `./run.sh metro-fresh` |
| `pod install` fails (iOS) | CocoaPods not installed or outdated | `gem install cocoapods` then `cd mobile/ios && pod install --repo-update` |
| `StyleSizeLength` / Yoga errors in **RNSVG** (iOS, New Arch) | Upstream `react-native-svg` C++ vs RN 0.76 Yoga | Repo pins **`react-native-svg@15.15.4`** (root `overrides` + `mobile` dep) and applies **`patches/react-native-svg+15.15.4.patch`** via `patch-package` on `npm install`. Ensure **`metro.config.js`** `extraNodeModules` keeps a **single** SVG copy. |
| `folly/json/dynamic.h` not found (iOS compile) | Broken `RCT-Folly` header symlinks on **case-insensitive APFS** | Re-run **`cd mobile/ios && pod install`** — `Podfile` rebuilds `Pods/Headers/Public/RCT-Folly/folly/json`. |
| `No bundle URL present` (iOS) | Metro not running | Start Metro in a separate terminal first |
| Xcode alert **Unable to boot device in current state: Booted** | Simulator already running; tooling tries to boot it again | Use `./run.sh sim` (it shuts down a booted **iPhone 17 Pro** first), or run `xcrun simctl shutdown all`, then build again |
| `database is locked` / `unable to attach DB` (DerivedData `build.db`) | Two **concurrent** `xcodebuild` runs (e.g. Xcode + terminal, or two terminals) | **`./run.sh device`** and **`./run.sh sim`** kill other `xcodebuild` processes before starting. Or run `pkill -9 xcodebuild`, wait a few seconds, then build again |

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
  : "https://api.getorzo.com";
```

Find your LAN IP: `ipconfig` (Windows) or `ifconfig` (macOS).
