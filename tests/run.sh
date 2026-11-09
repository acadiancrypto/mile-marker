#!/usr/bin/env bash
# Runs the browser test page in headless Edge and reports the result.
# Needs the local server: python -m http.server 8080 (from the project root).
# Exit 0 only when the page reports "All N passed".
set -u
EDGE="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
URL="${1:-http://localhost:8080/tests/}"
PROFILE="$(cygpath -w "${TEMP:-/tmp}")\\mm-test-profile"
dom=$("$EDGE" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --virtual-time-budget=20000 --dump-dom "$URL?t=$RANDOM" 2>/dev/null)
result=$(printf '%s' "$dom" | tr -d '\r' | grep -o '<h1 id="result"[^>]*>[^<]*' | sed 's/.*>//')
printf '%s' "$dom" | tr -d '\r' | grep -o '<li>FAIL[^<]*' | sed 's/<li>//; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g'
echo "${result:-NO RESULT (is the server running on 8080?)}"
case "$result" in "All "*" passed") exit 0 ;; *) exit 1 ;; esac
