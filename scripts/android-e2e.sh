#!/usr/bin/env bash
# Run the browser tests in real Chrome on an Android emulator (a virtual Pixel 10).
#
#   ./scripts/android-e2e.sh              boot the emulator if needed, then run the tests
#   ./scripts/android-e2e.sh --headed     same, but show the emulator window
#   ./scripts/android-e2e.sh -g calendar  extra arguments go to `playwright test`
#
# Needs the local stack running (`make dev`) and, once:
#   brew install --cask temurin android-commandlinetools android-platform-tools
#   sdkmanager --install emulator platform-tools "platforms;android-36" "system-images;android-36;google_apis;arm64-v8a"
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$(brew --prefix)/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
AVD=spooky-pixel-10
IMAGE="system-images;android-36;google_apis;arm64-v8a"
CDP_PORT=9222

window=(-no-window)
if [ "${1:-}" = "--headed" ]; then
  window=()
  shift
fi

if ! avdmanager list avd -c | grep -qx "$AVD"; then
  echo "Creating the $AVD emulator…"
  echo no | avdmanager create avd -n "$AVD" -k "$IMAGE" -d pixel_10 >/dev/null
fi

log=/tmp/"$AVD".log
if ! adb devices | grep -q '^emulator-'; then
  echo "Booting the emulator (log: $log)…"
  "$ANDROID_HOME/emulator/emulator" -avd "$AVD" "${window[@]}" -no-audio -no-snapshot-save >"$log" 2>&1 &
  emulator_pid=$!
fi
# Wait up to 3 minutes for Android to finish booting; stop early if the emulator dies.
for _ in $(seq 90); do
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
  if [ -n "${emulator_pid:-}" ] && ! kill -0 "$emulator_pid" 2>/dev/null; then
    echo "The emulator exited. Last lines of $log:" >&2
    tail -5 "$log" >&2
    exit 1
  fi
  sleep 2
done
[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] || { echo "The emulator didn't boot within 3 minutes (see $log)." >&2; exit 1; }
echo "Android is up."

# The phone's localhost:3000 is this Mac's dev server (and a secure context, like production).
adb reverse tcp:3000 tcp:3000 >/dev/null

# Start Chrome without its first-run screens, and reach its DevTools from here.
adb shell am set-debug-app --persistent com.android.chrome
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am force-stop com.android.chrome
adb shell am start -a android.intent.action.VIEW -d about:blank com.android.chrome >/dev/null
for _ in $(seq 30); do adb shell cat /proc/net/unix | grep -q chrome_devtools_remote && break; sleep 1; done
adb forward tcp:$CDP_PORT localabstract:chrome_devtools_remote >/dev/null

cd ts/apps/web
# One worker: every test shares the phone's single Chrome.
ANDROID_CDP="http://localhost:$CDP_PORT" npx playwright test --project=android --workers=1 "$@"
