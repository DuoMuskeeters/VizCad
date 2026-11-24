#!/usr/bin/env bash
# Faz 4a staging acceptance (docs/09 §10): real R2 behavior for presigned uploads. Run by hand against STAGING only.
#
#   SITE=https://vizcad-rewrite.<account>.workers.dev \
#   COOKIE='<the whole Cookie header of a signed-in browser session>' \
#   WORKSPACE_ID=<a workspace the session's user may upload to> \
#   scripts/staging-verify-uploads.sh
#
# Needs curl, jq, python3 and (for the D1/R2 look-ups) a logged-in wrangler. Nothing here touches production: the script
# refuses any SITE that is not the staging Worker and only names the staging bucket and database.
set -euo pipefail

: "${SITE:?set SITE to the staging Worker URL}"
: "${COOKIE:?set COOKIE to a signed-in session Cookie header}"
: "${WORKSPACE_ID:?set WORKSPACE_ID}"
case "$SITE" in https://vizcad-rewrite.*.workers.dev) ;; *) echo "SITE must be the staging Worker (vizcad-rewrite)"; exit 2 ;; esac

BUCKET=vizcad-files-staging
DB=vizcad-staging
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: expected $3, got $2"; fi; }

api() { # api <operation> <json body> -> prints "<status> <body>"
  curl -sS -o "$WORK/body" -w '%{http_code}' -X POST "$SITE/api/app/$1" \
    -H "Cookie: $COOKIE" -H "Origin: $SITE" -H 'Content-Type: application/json' -d "$2"
  printf ' %s\n' "$(cat "$WORK/body")"
}
status() { printf '%s' "$1" | cut -d' ' -f1; }
json()   { printf '%s' "$1" | cut -d' ' -f2- | jq -r "$2"; }

# put <ticket-json> <file> [extra curl args]: PUT exactly like the browser would (signed headers only).
put() {
  local url ct inm
  url="$(printf '%s' "$1" | jq -r '.data.url')"
  ct="$(printf '%s' "$1" | jq -r '.data.headers["Content-Type"]')"
  inm="$(printf '%s' "$1" | jq -r '.data.headers["If-None-Match"]')"
  curl -sS -D "$WORK/put-headers" -o /dev/null -w '%{http_code}' -X PUT "$url" \
    -H "Content-Type: $ct" -H "If-None-Match: $inm" --data-binary "@$2" "${@:3}"
}
etag() { grep -i '^etag:' "$WORK/put-headers" | tail -1 | sed -E 's/^[^:]*: *//' | tr -d '\r'; }

echo "== test files"
python3 - "$WORK" <<'PY'
import struct, sys
d = sys.argv[1]
n = 1048575                                  # 84 + 50 * n = 52,428,834 bytes (about 50 MB), a valid binary STL
with open(f"{d}/big.stl", "wb") as f:
    f.write(b"VizCad staging 50MB".ljust(80, b" ")); f.write(struct.pack("<I", n)); f.write(bytes(50 * n))
with open(f"{d}/part.step", "wb") as f:      # 5 MB STEP
    f.write(b"ISO-10303-21;\nHEADER;\n"); f.write(b" " * (5 * 1024 * 1024 - 22))
with open(f"{d}/fake.stl", "wb") as f:       # HTML pretending to be an STL
    f.write(b"<!doctype html><title>x</title><script>alert(1)</script>")
with open(f"{d}/small.stl", "wb") as f:
    f.write(b"S".ljust(80, b" ")); f.write(struct.pack("<I", 1)); f.write(bytes(50))
PY
size() { wc -c < "$1" | tr -d ' '; }

echo "== CORS preflight (PUT with content-type and if-none-match, ETag exposed)"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"cors.stl\",\"size\":$(size "$WORK/small.stl")}")"
check "requestUpload for the CORS probe" "$(status "$req")" 200
url="$(json "$req" '.data.url')"
curl -sS -D "$WORK/cors" -o /dev/null -X OPTIONS "$url" -H "Origin: $SITE" \
  -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type,if-none-match'
grep -qi '^access-control-allow-origin:' "$WORK/cors" && ok "allow-origin present" || bad "no access-control-allow-origin"
grep -i '^access-control-allow-headers:' "$WORK/cors" | grep -qi 'if-none-match' && ok "if-none-match allowed" || bad "if-none-match not allowed"
api cancelUpload "{\"uploadId\":\"$(json "$req" '.data.uploadId')\"}" >/dev/null

echo "== 5 MB STEP: request, PUT, complete"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"verify-5mb.step\",\"size\":$(size "$WORK/part.step")}")"
check "requestUpload" "$(status "$req")" 200
body="${req#* }"
check "PUT" "$(put "$body" "$WORK/part.step")" 200
e="$(etag)"; [ -n "$e" ] && ok "ETag exposed in the PUT response: $e" || bad "no ETag header on PUT"
done_="$(api completeUpload "{\"uploadId\":\"$(json "$req" '.data.uploadId')\",\"etag\":$(jq -Rn --arg e "$e" '$e')}")"
check "completeUpload" "$(status "$done_")" 200
STEP_FILE="$(json "$done_" '.data.fileId')"
step_put="$body"

echo "== second PUT to the same URL is refused (If-None-Match: *)"
check "second PUT" "$(put "$step_put" "$WORK/part.step")" 412

echo "== 50 MB STL"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"verify-50mb.stl\",\"size\":$(size "$WORK/big.stl")}")"
check "requestUpload" "$(status "$req")" 200
body="${req#* }"
check "PUT" "$(put "$body" "$WORK/big.stl")" 200
e="$(etag)"
done_="$(api completeUpload "{\"uploadId\":\"$(json "$req" '.data.uploadId')\",\"etag\":$(jq -Rn --arg e "$e" '$e')}")"
check "completeUpload" "$(status "$done_")" 200

echo "== .dwg is refused before any URL is signed"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"plan.dwg\",\"size\":1000}")"
check "requestUpload .dwg" "$(status "$req")" 415

echo "== HTML named .stl: uploaded, then rejected at completion; the object is queued and deleted"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"verify-fake.stl\",\"size\":$(size "$WORK/fake.stl")}")"
check "requestUpload" "$(status "$req")" 200
body="${req#* }"
check "PUT" "$(put "$body" "$WORK/fake.stl")" 200
e="$(etag)"; FAKE_UPLOAD="$(json "$req" '.data.uploadId')"
done_="$(api completeUpload "{\"uploadId\":\"$FAKE_UPLOAD\",\"etag\":$(jq -Rn --arg e "$e" '$e')}")"
check "completeUpload" "$(status "$done_")" 415
check "error tag" "$(json "$done_" '.error')" UnsupportedFileType

echo "== size mismatch: the signed content-length makes R2 refuse a different body"
req="$(api requestUpload "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"verify-mismatch.stl\",\"size\":$(size "$WORK/small.stl")}")"
check "requestUpload" "$(status "$req")" 200
body="${req#* }"; MISMATCH_UPLOAD="$(json "$req" '.data.uploadId')"
head -c 100 "$WORK/small.stl" > "$WORK/short.bin"
sent="$(put "$body" "$WORK/short.bin")"
if [ "$sent" = 403 ]; then ok "PUT with the wrong size refused by R2 ($sent)"; else bad "PUT with the wrong size was answered $sent (expected 403)"; fi
done_="$(api completeUpload "{\"uploadId\":\"$MISMATCH_UPLOAD\",\"etag\":\"x\"}")"
check "completeUpload without an object" "$(status "$done_")" 409   # UploadIncomplete
check "error tag" "$(json "$done_" '.error')" UploadIncomplete
api cancelUpload "{\"uploadId\":\"$MISMATCH_UPLOAD\"}" >/dev/null

echo
echo "== look-ups to run by hand (staging only; --remote targets the staging resources named in wrangler.jsonc)"
cat <<LOOKUPS
  # The rejected HTML object must be gone from the bucket and the queue row drained:
  pnpm wrangler d1 execute $DB --remote --command "SELECT id, status, r2Key FROM upload_sessions WHERE id = '$FAKE_UPLOAD'"
  pnpm wrangler d1 execute $DB --remote --command "SELECT key, reason, attempts, lastError FROM storage_deletions"
  pnpm wrangler r2 object get "$BUCKET/<r2Key from the first query>" --remote --file /dev/null     # expect: not found
  # The accepted files exist with the verified size and ETag:
  pnpm wrangler d1 execute $DB --remote --command "SELECT id, name, size, contentEtag, r2Key FROM files WHERE id = '$STEP_FILE'"
  # Hourly cron (expire sessions, drain the queue): Workers dashboard -> vizcad-rewrite -> Settings -> Triggers shows both crons.
LOOKUPS
echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
