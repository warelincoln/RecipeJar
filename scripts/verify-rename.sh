#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ERRORS=0

echo "=== Orzo Rename Verification ==="
echo ""

# 1. Check for remaining "recipejar" references (case-insensitive)
echo "1. Scanning for remaining 'recipejar' references..."
MATCHES=$(grep -ri "recipejar\|recipe.jar" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.cjs' \
  --include='*.json' --include='*.md' --include='*.mdc' --include='*.sh' \
  --include='*.swift' --include='*.m' --include='*.mm' --include='*.kt' \
  --include='*.gradle' --include='*.xml' --include='*.plist' \
  --include='*.storyboard' --include='*.pbxproj' --include='*.xcscheme' \
  --include='*.xcworkspacedata' --include='*.entitlements' \
  --include='Podfile' --include='Dockerfile' --include='Gemfile' \
  --include='.gitignore' \
  --exclude-dir=node_modules --exclude-dir=Pods --exclude-dir=build \
  --exclude-dir=.git \
  --exclude='verify-rename.sh' \
  -l . 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "   FAIL: Found remaining references in:"
  echo "$MATCHES" | while read -r f; do echo "     - $f"; done
  ERRORS=$((ERRORS + 1))
else
  echo "   PASS: No remaining references found."
fi

echo ""

# 2. Verify new iOS paths exist
echo "2. Checking iOS directory structure..."
for path in \
  "mobile/ios/Orzo/Info.plist" \
  "mobile/ios/Orzo/AppDelegate.mm" \
  "mobile/ios/Orzo/Orzo.entitlements" \
  "mobile/ios/Orzo/LaunchScreen.storyboard" \
  "mobile/ios/Orzo.xcodeproj/project.pbxproj" \
  "mobile/ios/Orzo.xcworkspace/contents.xcworkspacedata" \
  "mobile/ios/Orzo.xcodeproj/xcshareddata/xcschemes/Orzo.xcscheme" \
  "mobile/ios/OrzoTests/OrzoTests.m" \
  "mobile/ios/OrzoUITests/OrzoUITests.swift" \
  "mobile/ios/OrzoUITests/ImportFlowUITests.swift"; do
  if [ -f "$path" ]; then
    echo "   PASS: $path"
  else
    echo "   FAIL: Missing $path"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# 3. Verify old iOS paths do NOT exist
echo "3. Checking old paths are removed..."
for path in \
  "mobile/ios/RecipeJar" \
  "mobile/ios/RecipeJarTests" \
  "mobile/ios/RecipeJarUITests" \
  "mobile/ios/RecipeJar.xcodeproj" \
  "mobile/ios/RecipeJar.xcworkspace"; do
  if [ -e "$path" ]; then
    echo "   FAIL: Old path still exists: $path"
    ERRORS=$((ERRORS + 1))
  else
    echo "   PASS: $path removed"
  fi
done

echo ""

# 4. Verify Android package directory
echo "4. Checking Android package structure..."
if [ -d "mobile/android/app/src/main/java/com/getorzo/app" ]; then
  echo "   PASS: com/getorzo/app directory exists"
else
  echo "   FAIL: com/getorzo/app directory missing"
  ERRORS=$((ERRORS + 1))
fi
if [ -e "mobile/android/app/src/main/java/com/recipejar" ]; then
  echo "   FAIL: Old com/recipejar directory still exists"
  ERRORS=$((ERRORS + 1))
else
  echo "   PASS: Old com/recipejar removed"
fi

echo ""

# 5. Verify script rename
echo "5. Checking script rename..."
if [ -f "scripts/write-orzo-dev-host.cjs" ]; then
  echo "   PASS: write-orzo-dev-host.cjs exists"
else
  echo "   FAIL: write-orzo-dev-host.cjs missing"
  ERRORS=$((ERRORS + 1))
fi
if [ -e "scripts/write-recipejar-dev-host.cjs" ]; then
  echo "   FAIL: Old write-recipejar-dev-host.cjs still exists"
  ERRORS=$((ERRORS + 1))
else
  echo "   PASS: Old script removed"
fi

echo ""

# 6. Verify key config values
echo "6. Spot-checking key config values..."
if grep -q '"name": "Orzo"' mobile/app.json; then
  echo "   PASS: app.json name = Orzo"
else
  echo "   FAIL: app.json name not updated"
  ERRORS=$((ERRORS + 1))
fi
if grep -q 'app.orzo.ios' mobile/ios/Orzo/Info.plist; then
  echo "   PASS: Info.plist URL scheme = app.orzo.ios"
else
  echo "   FAIL: Info.plist URL scheme not updated"
  ERRORS=$((ERRORS + 1))
fi
if grep -q 'com.getorzo.app' mobile/android/app/build.gradle; then
  echo "   PASS: build.gradle applicationId = com.getorzo.app"
else
  echo "   FAIL: build.gradle applicationId not updated"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=== Results ==="
if [ $ERRORS -eq 0 ]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "$ERRORS CHECK(S) FAILED"
  exit 1
fi
