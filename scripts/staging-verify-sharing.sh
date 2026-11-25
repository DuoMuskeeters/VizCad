#!/usr/bin/env bash
# Faz 4c staging acceptance (docs/09 §10): file delivery (200, 206, 416, safe headers, cross-site refusal), thumbnails and
# link sharing (password gate, proof cookie, revision and revoke, view vs download, Turnstile after three failures, the
# legacy /shared redirect) against the real staging Worker, D1 and R2. Run by hand against STAGING only.
#
#   SITE=https://vizcad-rewrite.<account>.workers.dev \
#   COOKIE='<the whole Cookie header of a signed-in browser session>' \
#   WORKSPACE_ID=<a company workspace the session's user OWNS or administers> \
#   scripts/staging-verify-sharing.sh
#
# Needs curl, jq and python3. Nothing here touches production: the script refuses any SITE that is not the staging Worker.
# It creates its own small files (names start with "verify4c-") and purges them again. The Worker runs on the Free plan
# (10 ms CPU per request), so every request is followed by a short pause and the password checks are few.
#
# Not covered here (by hand, with a phone): opening the link and downloading from a mobile browser; Turnstile itself needs
# a browser, so the script stops at "the next try is refused without a token".
set -euo pipefail
set +B  # no brace expansion: JSON bodies like {"a",...} are built inline

: "${SITE:?set SITE to the staging Worker URL}"
: "${COOKIE:?set COOKIE to a signed-in session Cookie header}"
: "${WORKSPACE_ID:?set WORKSPACE_ID}"
case "$SITE" in https://vizcad-rewrite.*.workers.dev) ;; *) echo "SITE must be the staging Worker (vizcad-rewrite)"; exit 2 ;; esac

PAUSE="${PAUSE:-0.5}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: expected $3, got $2"; fi; }

api() { # api <operation> <json body> -> prints "<status> <body>" (a signed-in app call)
  sleep "$PAUSE"
  curl -sS -o "$WORK/body" -w '%{http_code}' -X POST "$SITE/api/app/$1" \
    -H "Cookie: $COOKIE" -H "Origin: $SITE" -H 'Content-Type: application/json' -d "$2"
  printf ' %s\n' "$(cat "$WORK/body")"
}
status() { printf '%s' "$1" | cut -d' ' -f1; }
json()   { printf '%s' "$1" | cut -d' ' -f2- | jq -r "$2"; }
ws() { printf '"workspaceId":"%s"' "$WORKSPACE_ID"; }

# get <path> [curl args] -> prints the status; headers go to $WORK/h, the body to $WORK/b
get() {
  local path="$1"; shift
  sleep "$PAUSE"
  curl -sS -D "$WORK/h" -o "$WORK/b" -w '%{http_code}' "$SITE$path" "$@"
}
# post <path> <json> [curl args] -> prints the status (no session cookie unless passed)
post() {
  local path="$1" body="$2"; shift 2
  sleep "$PAUSE"
  curl -sS -D "$WORK/h" -o "$WORK/b" -w '%{http_code}' -X POST "$SITE$path" -H "Origin: $SITE" -H 'Content-Type: application/json' -d "$body" "$@"
}
hdr() { grep -i "^$1:" "$WORK/h" | tail -1 | sed -E 's/^[^:]*: *//' | tr -d '\r'; }
body() { jq -r "$1" "$WORK/b"; }

# upload <local file> <name> -> prints the completeUpload response ("<status> <body>")
upload() {
  local size req ticket url ct inm code etag
  size="$(wc -c < "$1" | tr -d ' ')"
  req="$(api requestUpload "{$(ws),\"name\":\"$2\",\"size\":$size}")"
  [ "$(status "$req")" = 200 ] || { echo "$req"; return; }
  ticket="${req#* }"
  url="$(printf '%s' "$ticket" | jq -r '.data.url')"
  ct="$(printf '%s' "$ticket" | jq -r '.data.headers["Content-Type"]')"
  inm="$(printf '%s' "$ticket" | jq -r '.data.headers["If-None-Match"]')"
  code="$(curl -sS -D "$WORK/put-headers" -o /dev/null -w '%{http_code}' -X PUT "$url" -H "Content-Type: $ct" -H "If-None-Match: $inm" --data-binary "@$1")"
  [ "$code" = 200 ] || { echo "PUT-$code {}"; return; }
  etag="$(grep -i '^etag:' "$WORK/put-headers" | tail -1 | sed -E 's/^[^:]*: *//' | tr -d '\r')"
  api completeUpload "{\"uploadId\":\"$(printf '%s' "$ticket" | jq -r '.data.uploadId')\",\"etag\":$(jq -Rn --arg e "$etag" '$e')}"
}

echo "== test files (an STL of 1 KiB and a 4x4 PNG)"
python3 - "$WORK" <<'PY'
import struct, sys, zlib
d = sys.argv[1]
with open(f"{d}/part.stl", "wb") as f:
    f.write(b"A".ljust(80, b" ")); f.write(struct.pack("<I", 20)); f.write(bytes(1000))
def chunk(t, data):
    return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xffffffff)
raw = b"".join(b"\x00" + bytes(16) for _ in range(4))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
open(f"{d}/thumb.png", "wb").write(png)
open(f"{d}/not-an-image.png", "wb").write(b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>")
PY
SIZE="$(wc -c < "$WORK/part.stl" | tr -d ' ')"

echo "== upload"
up="$(upload "$WORK/part.stl" verify4c-part.stl)"; check "upload" "$(status "$up")" 200
FILE="$(json "$up" '.data.fileId')"
check "getFile says the owner may share" "$(json "$(api getFile "{$(ws),\"fileId\":\"$FILE\"}")" '.data.can.share')" true

echo "== member delivery: content, Range, safe headers, cross-site refusal"
code="$(get "/api/files/$FILE/content" -H "Cookie: $COOKIE" -H "Origin: $SITE")"
check "content 200" "$code" 200
check "content size" "$(wc -c < "$WORK/b" | tr -d ' ')" "$SIZE"
check "content-type is opaque" "$(hdr content-type)" application/octet-stream
check "content-disposition is an attachment" "$(hdr content-disposition | cut -c1-41)" 'attachment; filename="verify4c-part.stl"'
check "nosniff" "$(hdr x-content-type-options)" nosniff
check "CSP sandbox" "$(hdr content-security-policy)" sandbox
check "no-store" "$(hdr cache-control)" 'private, no-store'
check "Accept-Ranges" "$(hdr accept-ranges)" bytes
code="$(get "/api/files/$FILE/content" -H "Cookie: $COOKIE" -H "Origin: $SITE" -H 'Range: bytes=0-99')"
check "range 206" "$code" 206
check "range Content-Range" "$(hdr content-range)" "bytes 0-99/$SIZE"
check "range length" "$(wc -c < "$WORK/b" | tr -d ' ')" 100
check "range keeps the safe headers" "$(hdr content-security-policy)/$(hdr x-content-type-options)" sandbox/nosniff
check "range past the end 416" "$(get "/api/files/$FILE/content" -H "Cookie: $COOKIE" -H "Origin: $SITE" -H "Range: bytes=$((SIZE + 10))-")" 416
check "cross-site refused" "$(get "/api/files/$FILE/content" -H "Cookie: $COOKIE" -H 'Sec-Fetch-Site: cross-site')" 403
check "no session" "$(get "/api/files/$FILE/content" -H "Origin: $SITE")" 401
check "unknown file" "$(get "/api/files/nope/content" -H "Cookie: $COOKIE" -H "Origin: $SITE")" 404

echo "== thumbnails: upload, validation, delivery"
check "no thumbnail yet" "$(get "/api/files/$FILE/thumbnail" -H "Cookie: $COOKIE" -H "Origin: $SITE")" 404
put() { sleep "$PAUSE"; curl -sS -o "$WORK/b" -w '%{http_code}' -X POST "$SITE/api/files/$FILE/thumbnail" -H "Cookie: $COOKIE" -H "Origin: $SITE" -H "Content-Type: $2" --data-binary "@$1" "${@:3}"; }
check "an SVG posted as PNG is refused" "$(put "$WORK/not-an-image.png" image/png)" 422
check "wrong content type is refused" "$(put "$WORK/thumb.png" application/json)" 403
check "cross-site thumbnail POST is refused" "$(put "$WORK/thumb.png" image/png -H 'Sec-Fetch-Site: cross-site')" 403
check "valid PNG is stored" "$(put "$WORK/thumb.png" image/png)" 200
check "thumbnail 200" "$(get "/api/files/$FILE/thumbnail" -H "Cookie: $COOKIE" -H "Origin: $SITE")" 200
check "thumbnail type" "$(hdr content-type)" image/png
check "thumbnail safe headers" "$(hdr x-content-type-options)/$(hdr content-security-policy)" nosniff/sandbox
check "thumbnail bytes" "$(cmp -s "$WORK/b" "$WORK/thumb.png" && echo same || echo different)" same

echo "== link with a password"
made="$(api createShareLink "{$(ws),\"fileId\":\"$FILE\",\"level\":\"download\",\"password\":\"verify4c horse\"}")"
check "createShareLink" "$(status "$made")" 200
URL="$(json "$made" '.data.url')"; TOKEN="${URL##*/}"
check "URL shape" "$(printf '%s' "$URL" | grep -Ec "^$SITE/s/[A-Za-z0-9_-]{43}\$")" 1
check "a second link conflicts" "$(status "$(api createShareLink "{$(ws),\"fileId\":\"$FILE\",\"level\":\"view\"}")")" 409
check "copyShareLink returns the same URL" "$(json "$(api copyShareLink "{$(ws),\"fileId\":\"$FILE\"}")" '.data.url')" "$URL"
check "resolve shows only the gate" "$(post /api/s/resolve "{\"token\":\"$TOKEN\"}")/$(body '.data.kind')" 200/password
check "the gate carries nothing of the file" "$(grep -c 'verify4c' "$WORK/b" || true)" 0
check "page headers: no referrer" "$(hdr referrer-policy)/$(hdr cache-control)" 'no-referrer/private, no-store'
check "content without proof is 401" "$(get "/s/$TOKEN/content" -H "Origin: $SITE")" 401
check "a password in the URL is refused" "$(post "/api/s/password?password=verify4c%20horse" "{\"token\":\"$TOKEN\",\"password\":\"verify4c horse\"}")" 400
check "wrong password" "$(post /api/s/password "{\"token\":\"$TOKEN\",\"password\":\"not the password\"}")/$(body '.error')/$(body '.captchaRequired')" 401/LinkPasswordInvalid/false
check "right password" "$(post /api/s/password "{\"token\":\"$TOKEN\",\"password\":\"verify4c horse\"}")" 200
SETCOOKIE="$(hdr set-cookie)"
check "proof cookie attributes" "$(printf '%s' "$SETCOOKIE" | grep -Ec '^__Host-vizcad-share-[A-Za-z0-9-]+=v1\.[0-9]+\.[A-Za-z0-9_-]+; Max-Age=[0-9]+; Path=/; Secure; HttpOnly; SameSite=Lax$')" 1
PROOF="${SETCOOKIE%%;*}"
check "resolve with the proof shows the file" "$(post /api/s/resolve "{\"token\":\"$TOKEN\"}" -H "Cookie: $PROOF")/$(body '.data.file.name')/$(body '.data.file.can.download')" 200/verify4c-part.stl/true
check "the card has no id, key or e-mail" "$(jq -r '.data.file | keys | join(",")' "$WORK/b")" "can,currentVersion,expiresAt,extension,name,sharer,size,thumbnailAvailable,updatedAt"
code="$(get "/s/$TOKEN/content" -H "Origin: $SITE" -H "Cookie: $PROOF")"
check "link content 200" "$code" 200
check "link content size" "$(wc -c < "$WORK/b" | tr -d ' ')" "$SIZE"
check "link headers" "$(hdr x-content-type-options)/$(hdr content-security-policy)/$(hdr referrer-policy)/$(hdr cache-control)" 'nosniff/sandbox/no-referrer/private, no-store'
check "link range 206" "$(get "/s/$TOKEN/content" -H "Origin: $SITE" -H "Cookie: $PROOF" -H 'Range: bytes=10-19')" 206
check "link range header" "$(hdr content-range)" "bytes 10-19/$SIZE"
check "link content cross-site refused" "$(get "/s/$TOKEN/content" -H "Cookie: $PROOF" -H 'Sec-Fetch-Site: cross-site')" 403
check "link thumbnail 200" "$(get "/s/$TOKEN/thumbnail" -H "Origin: $SITE" -H "Cookie: $PROOF")" 200
check "link thumbnail type" "$(hdr content-type)" image/png

echo "== revision: a change invalidates the proof; view level closes the content"
check "updateShareLink (expiry)" "$(status "$(api updateShareLink "{$(ws),\"fileId\":\"$FILE\",\"expiresAt\":$(( $(date +%s) + 86400 ))}")")" 200
check "the old proof no longer opens the content" "$(get "/s/$TOKEN/content" -H "Origin: $SITE" -H "Cookie: $PROOF")" 401
check "the old proof shows the gate again" "$(post /api/s/resolve "{\"token\":\"$TOKEN\"}" -H "Cookie: $PROOF")/$(body '.data.kind')" 200/password
check "removing the password and setting view" "$(status "$(api updateShareLink "{$(ws),\"fileId\":\"$FILE\",\"level\":\"view\",\"password\":null}")")" 200
check "view link: resolve" "$(post /api/s/resolve "{\"token\":\"$TOKEN\"}")/$(body '.data.file.can.download')" 200/false
check "view link: content is closed" "$(get "/s/$TOKEN/content" -H "Origin: $SITE")/$(body '.reason')" 403/INSUFFICIENT_LEVEL
check "view link: thumbnail is open" "$(get "/s/$TOKEN/thumbnail" -H "Origin: $SITE")" 200

echo "== legacy redirect"
check "/shared/<token> redirects" "$(get "/shared/$TOKEN")/$(hdr location)" "302//s/$TOKEN"

echo "== revoke"
check "revokeShareLink" "$(status "$(api revokeShareLink "{$(ws),\"fileId\":\"$FILE\"}")")" 200
check "revoked: resolve" "$(post /api/s/resolve "{\"token\":\"$TOKEN\"}")/$(body '.error')" 404/LinkUnavailable
check "revoked: content" "$(get "/s/$TOKEN/content" -H "Origin: $SITE")" 404
check "revoked: copy" "$(status "$(api copyShareLink "{$(ws),\"fileId\":\"$FILE\"}")")" 404

echo "== three wrong passwords: the next try needs Turnstile (a fresh link, so its counters start at zero)"
made="$(api createShareLink "{$(ws),\"fileId\":\"$FILE\",\"level\":\"download\",\"password\":\"verify4c horse\"}")"
TOKEN2="$(json "$made" '.data.url' | sed 's|.*/||')"
for i in 1 2 3; do
  code="$(post /api/s/password "{\"token\":\"$TOKEN2\",\"password\":\"guess number $i\"}")"
  check "wrong password $i (captchaRequired after the third)" "$code/$(body '.captchaRequired')" "401/$([ "$i" = 3 ] && echo true || echo false)"
done
check "the fourth try without a token" "$(post /api/s/password "{\"token\":\"$TOKEN2\",\"password\":\"verify4c horse\"}")/$(body '.error')" 403/CaptchaFailed
api revokeShareLink "{$(ws),\"fileId\":\"$FILE\"}" >/dev/null

echo "== clean up: trash and purge the test file"
check "trashFile" "$(status "$(api trashFile "{$(ws),\"fileId\":\"$FILE\"}")")" 200
check "purgeFile" "$(status "$(api purgeFile "{$(ws),\"fileId\":\"$FILE\"}")")" 200

echo
echo "== look-ups to run by hand (staging only)"
echo "  pnpm -s wrangler d1 execute vizcad-staging --remote --command \"SELECT event, userId, targetId, ip, substr(userAgent, 1, 40) AS ua FROM security_log ORDER BY createdAt DESC LIMIT 10\""
echo "  pnpm -s wrangler d1 execute vizcad-staging --remote --command \"SELECT action, actorKind, outcome, reason FROM access_log ORDER BY createdAt DESC LIMIT 20\""
echo "  (access_log must hold no IP or user agent; security_log holds both, user agent at most 256 characters)"
echo "  Open the link on a phone: https://.../s/<token> of a link you create in the app, download the file, check the password gate."
echo
echo "passed: $pass, failed: $fail"
[ "$fail" = 0 ]
