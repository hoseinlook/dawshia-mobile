#!/usr/bin/env bash
# Builds the iOS .ipa in CI (after `expo prebuild --platform ios`).
#
# Without signing secrets: an unsigned .ipa — install it with Sideloadly or
# AltStore, which re-sign it with your Apple ID.
# With IOS_CERTIFICATE_P12_BASE64 + IOS_CERTIFICATE_PASSWORD +
# IOS_PROVISIONING_PROFILE_BASE64 (+ optional IOS_EXPORT_METHOD, default
# "release-testing" a.k.a. ad-hoc): a signed .ipa for the devices in the profile.
#
# Usage: build-ios.sh <output.ipa>
set -euo pipefail

OUT="$1"
WORKSPACE=ios/Dawshia.xcworkspace
SCHEME=Dawshia
ARCHIVE=build/Dawshia.xcarchive
mkdir -p build

if [ -z "${IOS_CERTIFICATE_P12_BASE64:-}" ]; then
  echo "::notice::No iOS signing secrets — building an unsigned .ipa (install with Sideloadly/AltStore)."
  xcodebuild -quiet -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
  rm -rf build/Payload && mkdir -p build/Payload
  cp -R "$ARCHIVE/Products/Applications/$SCHEME.app" build/Payload/
  (cd build && zip -qry "../$OUT" Payload)
  ls -la "$OUT"
  exit 0
fi

# --- Signed build -----------------------------------------------------------
KEYCHAIN="$RUNNER_TEMP/dawshia-signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
cleanup() { security delete-keychain "$KEYCHAIN" 2>/dev/null || true; rm -f "$RUNNER_TEMP/cert.p12"; }
trap cleanup EXIT

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
echo "$IOS_CERTIFICATE_P12_BASE64" | base64 --decode > "$RUNNER_TEMP/cert.p12"
security import "$RUNNER_TEMP/cert.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN"
security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

PROFILE="$RUNNER_TEMP/profile.mobileprovision"
echo "$IOS_PROVISIONING_PROFILE_BASE64" | base64 --decode > "$PROFILE"
security cms -D -i "$PROFILE" > "$RUNNER_TEMP/profile.plist"
PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print UUID' "$RUNNER_TEMP/profile.plist")
PROFILE_NAME=$(/usr/libexec/PlistBuddy -c 'Print Name' "$RUNNER_TEMP/profile.plist")
TEAM_ID=$(/usr/libexec/PlistBuddy -c 'Print TeamIdentifier:0' "$RUNNER_TEMP/profile.plist")
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$PROFILE" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"

METHOD="${IOS_EXPORT_METHOD:-release-testing}"
case "$METHOD" in
  debugging|development) IDENTITY="Apple Development" ;;
  *) IDENTITY="Apple Distribution" ;;
esac

# Manual signing on the app target only (a global profile breaks the CocoaPods targets).
ruby -rxcodeproj -e '
  project = Xcodeproj::Project.open("ios/Dawshia.xcodeproj")
  target = project.targets.find { |t| t.name == "Dawshia" } or abort("Dawshia target not found")
  target.build_configurations.each do |config|
    config.build_settings.merge!(
      "CODE_SIGN_STYLE" => "Manual",
      "DEVELOPMENT_TEAM" => ARGV[0],
      "PROVISIONING_PROFILE_SPECIFIER" => ARGV[1],
      "CODE_SIGN_IDENTITY" => ARGV[2],
    )
  end
  project.save
' "$TEAM_ID" "$PROFILE_NAME" "$IDENTITY"

xcodebuild -quiet -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN"

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>$METHOD</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict><key>com.dawshia.app</key><string>$PROFILE_NAME</string></dict>
</dict>
</plist>
PLIST

xcodebuild -quiet -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist build/ExportOptions.plist -exportPath build/export
cp build/export/*.ipa "$OUT"
ls -la "$OUT"
