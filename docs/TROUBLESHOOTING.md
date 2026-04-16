# Troubleshooting

> **What this doc covers:** Symptoms → causes → fixes for the most common failure modes when bringing up the server, the mobile app, or hitting the API. For build-only errors and the iOS/Android build matrix, see [`RUNNING.md`](RUNNING.md). Back to [`../README.md`](../README.md).

## Supabase IPv6 DNS Issue

**Problem:** Supabase direct-connect hostnames (`db.*.supabase.co`) have only AAAA (IPv6) DNS records. Node.js on Windows often cannot resolve or route to these addresses. Symptoms: `getaddrinfo ENOTFOUND`, `ENETUNREACH`.

**Fix:** Use the **session pooler** URL instead. Format: `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`. This resolves to IPv4.

## Missing `.env` File

**Problem:** Server crashes immediately with `DATABASE_URL environment variable is required`.

**Fix:** Copy `server/.env.example` to `server/.env` and fill in values.

## Stale Environment Variables

**Problem:** On Windows, if you previously set `DATABASE_URL` as a system/user environment variable, it overrides the `.env` file.

**Fix:** In PowerShell, run `Remove-Item Env:DATABASE_URL` before starting the server. Or delete the system environment variable.

## Mobile Build Fails — No Android SDK

**Problem:** `npx react-native run-android` fails with "SDK location not found".

**Fix:** Install Android Studio, set `ANDROID_HOME` environment variable. See [`SETUP.md`](SETUP.md).

## Server Running Stale Code After File Changes

**Problem:** You change server files (`server/src/**`), but the running API process keeps serving the old code. Logs don't show expected output (e.g., new `console.log` lines never appear), or behavior doesn't match what's on disk.

**Cause:** The dev server runs via `tsx watch src/app.ts`, which uses a file watcher to detect changes and auto-restart. This watcher does not always fire — particularly when changes are made programmatically (e.g., by an AI agent or a script writing multiple files rapidly), or when new files are created in directories that weren't in the original watch tree. There is no visible error; the server keeps running the stale version silently.

**How to detect:** After making server-side changes, look for the `Server listening at ...` log message in the terminal. If it only appears once (from the original startup), the server never restarted. You can also add or change a `console.log` and verify it appears.

**Fix:** Manually restart the server. Kill the process (`lsof -iTCP:3000 -sTCP:LISTEN -t | xargs kill -9`) and re-run `npm run dev -w @orzo/server` or `npm run dev:phone`. Always restart after major changes to server code — do not trust `tsx watch` to catch everything.

## Folder rename fails (or `Route PATCH:/collections/... not found`)

**Problem:** Mobile shows **Could not rename folder** / generic failure, or a dev sees Fastify **404** with **`Route PATCH:/collections/:id not found`** in the response body.

**Cause:** The API process does not include **`PATCH /collections/:id`** (stale server before pull, or production host not deployed).

**Fix:** Restart local API from current repo (**`npm run dev:phone`**). Verify with
`curl -X PATCH http://127.0.0.1:3000/collections/<uuid> -H "Content-Type: application/json" -d '{"name":"x"}'`
— expect **`{"error":"Collection not found"}`** for a fake UUID (route exists), not a Fastify route-not-found JSON shape. Deploy the same server revision for release builds using **`api.getorzo.com`**.

## Metro Port Conflict

**Problem:** `listen EADDRINUSE :::8081`.

**Fix:** Kill the existing process on port 8081. On Windows: `Get-NetTCPConnection -LocalPort 8081 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`.

## OpenAI Rate Limit or Invalid Key

**Problem:** `POST /drafts/:id/parse` returns 500 for image drafts.

**Fix:** Check `OPENAI_API_KEY` in `.env`. Verify the key is active at https://platform.openai.com/api-keys. Note: URL parsing with JSON-LD structured data does NOT require OpenAI and works without this key.

## Bot-Protected URLs Return Empty Parse

**Problem:** URL drafts for AllRecipes, Simply Recipes, etc. parse but return empty candidates with `NO_SAVE`.

**Cause:** These sites often block server-side HTTP requests (402/403). The plain server-fetch path can still fail there even with the browser-like UA retry.

**Current behavior:** If the user imports from `WebRecipeImportScreen`, the app first tries **`webview-html`** by capturing the loaded page HTML from the in-app browser and sending that HTML into the normal URL parsing cascade. If that capture fails technically, the app falls back once to **`server-fetch-fallback`** and the server retries with its existing `fetchUrl` logic. Clipboard/manual URL entry still uses **`server-fetch`** directly.

**Workaround:** For blocked sites, prefer the in-app browser URL flow over pasted/manual URL entry. If both paths still fail, the site is likely serving a consent wall, challenge page, or other non-recipe HTML to the client/session.

## react-native-screens / react-native-gesture-handler Build Error

**Problem:** Android native build fails with `ViewManagerWithGeneratedInterface` unresolved supertype errors.

**Cause:** The v4.x `react-native-screens` and v2.21+ `react-native-gesture-handler` require React Native's New Architecture (Fabric). With `newArchEnabled=false`, the generated interfaces don't exist.

**Fix:** The project pins `react-native-screens@~3.35.0` and `react-native-gesture-handler@~2.20.2`, which are the last versions compatible with the old architecture. If you upgrade these packages, verify `newArchEnabled` in `mobile/android/gradle.properties`.

## Gradle File-Locking on Windows

**Problem:** `Could not move temporary workspace (...) to immutable location` during Android build.

**Cause:** Gradle 8.x on Windows has a known bug where cache files get locked by the daemon or other processes.

**Fix:** Run the build with `--no-daemon --no-build-cache --project-cache-dir C:\tmp\rj-gradle`. See [`RUNNING.md`](RUNNING.md) for the full command. Also ensure Android Studio is closed when building from the command line.

## Xcode 26.4 `fmt` / Hermes Build Failure

**Problem:** iOS builds can fail in the `fmt` pod with errors like `call to consteval function ... is not a constant expression` from `Pods/fmt/include/fmt/format-inl.h`.

**Cause:** Hermes' bundled `fmt` version enables `consteval` under Apple Clang in Xcode 26.4, but that toolchain/path is currently unreliable for this pod.

**Fix:** The project patches `Pods/fmt/include/fmt/base.h` during `pod install` from `mobile/ios/Podfile` so `FMT_USE_CONSTEVAL` is forced to `0`. If you hit this error:

1. Run `cd mobile/ios && pod install`
2. Rebuild
3. If the error persists, verify the patch exists in `Pods/fmt/include/fmt/base.h`

## `run.sh device` Hides Real Xcode Errors

**Problem:** `./run.sh device` can print only `(2 failures)` and then fail to install an app bundle, which makes the true cause hard to see.

**Cause:** The device build script pipes `xcodebuild` output through `tail -1`, so you only see the last build line.

**Fix:** Run raw `xcodebuild` from `mobile/` when debugging native build failures:

```bash
xcodebuild -workspace ios/Orzo.xcworkspace \
  -scheme Orzo \
  -configuration Debug \
  -destination "id=<YOUR_DEVICE_UDID>" \
  build
```
