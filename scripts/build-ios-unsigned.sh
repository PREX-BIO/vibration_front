#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'iOS compilation requires macOS. On Windows, run the GitHub Actions workflow.' >&2
  exit 1
fi

if [[ ! -d ios/Vibration.xcworkspace || ! -f ios/Pods/Manifest.lock ]]; then
  echo 'Generate the native project and install Pods first: npx expo prebuild --platform ios' >&2
  exit 1
fi

# A separate DerivedData directory leaves the developer's Xcode build untouched.
build_dir="$project_root/.test-build/ios-unsigned"
mkdir -p "$build_dir"
export NODE_ENV=production

xcodebuild \
  -workspace ios/Vibration.xcworkspace \
  -scheme Vibration \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$build_dir/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  DEVELOPMENT_TEAM= \
  build 2>&1 | tee "$build_dir/xcodebuild.log"

app_path="$build_dir/DerivedData/Build/Products/Release-iphoneos/Vibration.app"

# Reject simulator, missing native-module, and Metro-dependent artifacts.
test -s "$app_path/main.jsbundle"
platform=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$app_path/Info.plist")
test "$platform" = iPhoneOS
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist")
lipo -verify_arch arm64 "$app_path/$executable"
grep -q 'ContinuousVibrationModule.self' 'ios/Pods/Target Support Files/Pods-Vibration/ExpoModulesProvider.swift'

# Package the device app directly. Xcode's distribution export requires signing
# credentials; each tester will sign this IPA later with their own free account.
staging_dir="$(mktemp -d "$build_dir/package.XXXXXX")"
trap 'rm -rf "$staging_dir"' EXIT
mkdir -p "$staging_dir/Payload"
ditto "$app_path" "$staging_dir/Payload/Vibration.app"
ditto -c -k --keepParent --norsrc "$staging_dir/Payload" "$build_dir/Vibration-unsigned.ipa"
(
  cd "$build_dir"
  shasum -a 256 Vibration-unsigned.ipa > Vibration-unsigned.ipa.sha256
)

printf '\nUnsigned device IPA: %s\n' "$build_dir/Vibration-unsigned.ipa"
