#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

usage() {
    echo "Usage: $0 [major|minor|patch|version]"
    echo "       $0 --version <major|minor|patch|version>"
    echo
    echo "Examples:"
    echo "  $0 patch"
    echo "  $0 0.0.2"
    echo "  VERSION_SPEC=patch $0"
}

VERSION_SPEC="${VERSION_SPEC:-}"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    exit 0
fi

if [ "${1:-}" = "--version" ]; then
    shift
    if [ -z "${1:-}" ]; then
        echo "Error: --version requires a version spec." >&2
        usage
        exit 1
    fi
    if [ -n "$VERSION_SPEC" ]; then
        echo "Error: provide a version via argument or VERSION_SPEC, not both." >&2
        exit 1
    fi
    VERSION_SPEC="$1"
    shift
fi

if [ "$#" -gt 1 ]; then
    echo "Error: too many arguments." >&2
    usage
    exit 1
fi

if [ "$#" -eq 1 ]; then
    if [ -n "$VERSION_SPEC" ]; then
        echo "Error: provide a version via argument or VERSION_SPEC, not both." >&2
        exit 1
    fi
    VERSION_SPEC="$1"
fi

# Define Java Home as requested
export JAVA_HOME=$HOME/.local/jdk/jdk-17.0.19+10
export PATH=$JAVA_HOME/bin:$PATH

# Add Volta to PATH if it exists
if [ -d "$HOME/.volta" ]; then
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"
fi

# Add NVM/FNM to PATH if they exist
if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

if [ -d "$HOME/.fnm" ]; then
    export PATH="$HOME/.fnm:$PATH"
    eval "$(fnm env)"
fi

echo "=== Environment Info ==="
echo "JAVA_HOME: $JAVA_HOME"
java -version
echo "Node version: $(node -v)"
echo "PATH: $PATH"

# Project paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/app/android"
OUTPUT_DIR="$SCRIPT_DIR/app/dist/apks"

if [ -n "$VERSION_SPEC" ]; then
    echo "=== Updating mobile app version before Android build: $VERSION_SPEC ==="
    node "$SCRIPT_DIR/scripts/bump-app-version.js" "$VERSION_SPEC"
else
    echo "=== Mobile app version bump skipped; pass major, minor, patch, or x.y.z to update before build ==="
fi

APP_VERSION="$(
    node -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const appConfigPath = path.join(root, "app", "app.json");
const appPackagePath = path.join(root, "app", "package.json");
let version = "";

if (fs.existsSync(appConfigPath)) {
    const appConfig = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));
    version = appConfig.expo?.android?.version || appConfig.expo?.version || "";
}

if (!version && fs.existsSync(appPackagePath)) {
    const appPackage = JSON.parse(fs.readFileSync(appPackagePath, "utf8"));
    version = appPackage.version || "";
}

if (!version) {
    throw new Error("Unable to resolve app version");
}

process.stdout.write(version);
' "$SCRIPT_DIR"
)"
APP_VERSION_SLUG="$(printf '%s' "$APP_VERSION" | tr -c '[:alnum:]._-' '-')"
echo "App version: $APP_VERSION"

# Check if node_modules exists, install if missing
if [ ! -d "$SCRIPT_DIR/app/node_modules" ]; then
    echo "node_modules not found in app/. Installing dependencies..."
    cd "$SCRIPT_DIR/app"
    bun install
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# ABIs to build
ARCHS=("armeabi-v7a" "arm64-v8a" "x86" "x86_64")

cd "$ANDROID_DIR"

echo "=== Stopping Gradle Daemon to refresh environment ==="
./gradlew --stop

clean_manually() {
    echo "=== Cleaning build artifacts manually to avoid CMake dependency loops ==="
    rm -rf build/ .gradle/ app/build/ app/.cxx/
}

# Run initial clean
clean_manually

for ARCH in "${ARCHS[@]}"; do
    echo "============================================="
    echo "Building APK for architecture: $ARCH"
    echo "============================================="
    
    # Clean previous build artifacts for safety between ARCH builds
    clean_manually
    
    # Build release APK for specific ABI
    ./gradlew assembleRelease -PreactNativeArchitectures="$ARCH"
    
    APK_SRC="app/build/outputs/apk/release/app-release.apk"
    APK_DEST="$OUTPUT_DIR/app-release-$APP_VERSION_SLUG-$ARCH.apk"
    
    if [ -f "$APK_SRC" ]; then
        cp "$APK_SRC" "$APK_DEST"
        echo "Successfully built and copied: $APK_DEST"
    else
        echo "Error: Output APK not found at $APK_SRC"
        exit 1
    fi
done

echo "============================================="
echo "All builds completed! Output APKs:"
ls -lh "$OUTPUT_DIR"
echo "============================================="
