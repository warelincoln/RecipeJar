#!/bin/bash
# Default commands favor fast iteration (Metro keeps its cache).
# Use metro-fresh when you need a cold Metro cache — not every session.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IOS_SIM_NAME="iPhone 17 Pro"

# If the target simulator is already booted, Xcode may show:
# "Unable to boot device in current state: Booted". Shut it down first so run-ios can boot cleanly.
shutdown_booted_sim_by_name() {
  local name="$1"
  while IFS= read -r line; do
    [[ "$line" == *"$name"* && "$line" == *"(Booted)"* ]] || continue
    if [[ "$line" =~ \(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\) ]]; then
      xcrun simctl shutdown "${BASH_REMATCH[1]}" 2>/dev/null || true
    fi
  done < <(xcrun simctl list devices 2>/dev/null)
}

# Concurrent xcodebuild runs lock the same DerivedData build.db and fail with "database is locked".
stop_concurrent_xcodebuild() {
  if pgrep -x xcodebuild >/dev/null 2>&1; then
    echo "Stopping other xcodebuild process(es) to avoid DerivedData lock..."
    pkill -9 xcodebuild 2>/dev/null || true
    sleep 2
  fi
}

case "$1" in
  sim)
    stop_concurrent_xcodebuild
    shutdown_booted_sim_by_name "$IOS_SIM_NAME"
    sleep 1
    echo "Starting a single Xcode build for simulator $IOS_SIM_NAME (spinner lines = one build)."
    npx react-native run-ios --simulator "$IOS_SIM_NAME"
    ;;
  device)
    stop_concurrent_xcodebuild
    # Default: Lincoln Ware's iPhone (wireless after Xcode "Connect via network"). Override: IOS_DEVICE_UDID
    UDID="${IOS_DEVICE_UDID:-00008140-00047D103499801C}"
    BUNDLE_ID="app.orzo.ios"
    WORKSPACE="ios/Orzo.xcworkspace"
    DERIVED="$HOME/Library/Developer/Xcode/DerivedData"

    echo "Building for device $UDID..."
    echo "Tip: First build may take 15+ min. Subsequent builds with ccache are much faster (2-5 min)."

    xcodebuild -workspace "$WORKSPACE" -scheme Orzo -configuration Debug \
      -destination "id=$UDID" \
      -derivedDataPath "$DERIVED/Orzo-device" \
      -allowProvisioningUpdates \
      build 2>&1 | tail -1

    APP_PATH="$DERIVED/Orzo-device/Build/Products/Debug-iphoneos/Orzo.app"
    if [ ! -d "$APP_PATH" ]; then
      echo "ERROR: Build failed — no .app bundle found at $APP_PATH"
      exit 1
    fi

    echo "Installing on device..."
    xcrun devicectl device install app --device "$UDID" "$APP_PATH"

    echo "Launching app..."
    xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID"

    echo "Done. App is running on your iPhone."
    ;;
  metro)
    node "$REPO_ROOT/scripts/write-orzo-dev-host.cjs"
    npx react-native start --host 0.0.0.0
    ;;
  metro-fresh)
    node "$REPO_ROOT/scripts/write-orzo-dev-host.cjs"
    npx react-native start --host 0.0.0.0 --reset-cache
    ;;
  *)
    echo "Usage: ./run.sh [sim|device|metro|metro-fresh]"
    echo "  metro         — start Metro (default, fast; reuses cache)"
    echo "  metro-fresh   — start Metro with --reset-cache (troubleshooting / major JS tree changes)"
    echo "  sim           — build/install on iOS Simulator (stops other xcodebuild; shuts down booted $IOS_SIM_NAME if needed)"
    echo "  device        — build/install on physical iPhone (stops other xcodebuild first; UDID: \$IOS_DEVICE_UDID or default)"
    ;;
esac
