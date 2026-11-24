#!/usr/bin/env bash
# Faz 4b staging acceptance (docs/09 §10): file list, detail, rename, star, versions, trash, purge and move against the real
# staging Worker, D1 and R2. Run by hand against STAGING only.
#
#   SITE=https://vizcad-rewrite.<account>.workers.dev \
#   COOKIE='<the whole Cookie header of a signed-in browser session>' \
#   WORKSPACE_ID=<a company workspace the session's user OWNS or administers> \
#   scripts/staging-verify-files.sh
#
# Needs curl, jq, python3 and (for the R2 look-ups at the end) a logged-in wrangler. Nothing here touches production: the
# script refuses any SITE that is not the staging Worker and only names the staging bucket and database. It creates its own
# small files (names start with "verify4b-") and purges them again.
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
ws() { printf '"workspaceId":"%s"' "$WORKSPACE_ID"; }

# upload <local file> <name> [targetFileId] -> prints the completeUpload response ("<status> <body>")
upload() {
  local size target='' req ticket url ct inm code etag
  size="$(wc -c < "$1" | tr -d ' ')"
  [ -n "${3:-}" ] && target=",\"targetFileId\":\"$3\""
  req="$(api requestUpload "{$(ws),\"name\":\"$2\",\"size\":$size$target}")"
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

echo "== test files"
python3 - "$WORK" <<'PY'
import struct, sys
d = sys.argv[1]
for name, fill in (("v1.stl", b"A"), ("v2.stl", b"B")):
    with open(f"{d}/{name}", "wb") as f:
        f.write(fill.ljust(80, b" ")); f.write(struct.pack("<I", 2)); f.write(bytes(100))
PY

echo "== upload two files (one gets a second version)"
one="$(upload "$WORK/v1.stl" verify4b-one.stl)"; check "upload one" "$(status "$one")" 200
F1="$(json "$one" '.data.fileId')"
two="$(upload "$WORK/v1.stl" verify4b-two.stl)"; check "upload two" "$(status "$two")" 200
F2="$(json "$two" '.data.fileId')"
v2="$(upload "$WORK/v2.stl" verify4b-ignored.stl "$F1")"; check "upload version 2 of one" "$(status "$v2")" 200

echo "== list, detail, projections"
list="$(api listFiles "{$(ws),\"query\":\"verify4b-\",\"sort\":\"name\"}")"
check "listFiles status" "$(status "$list")" 200
check "listFiles finds both" "$(json "$list" '[.data.items[].name] | join(",")')" "verify4b-one.stl,verify4b-two.stl"
check "list item has no key or user id" "$(json "$list" '.data.items[0] | [has("r2Key"), has("userId"), has("email")] | any')" false
detail="$(api getFile "{$(ws),\"fileId\":\"$F1\"}")"
check "getFile current version" "$(json "$detail" '.data.currentVersion.number')" 2
check "getFile never carries a key" "$(json "$detail" 'tostring | test("w/")')" false

echo "== rename keeps the extension"
renamed="$(api renameFile "{$(ws),\"fileId\":\"$F1\",\"name\":\"verify4b-renamed\"}")"
check "renameFile" "$(json "$renamed" '.data.name')" verify4b-renamed.stl
check "renameFile with a slash" "$(status "$(api renameFile "{$(ws),\"fileId\":\"$F1\",\"name\":\"a/b\"}")")" 400

echo "== star and unstar"
check "starFile" "$(status "$(api starFile "{$(ws),\"fileId\":\"$F1\"}")")" 200
check "starFile twice" "$(status "$(api starFile "{$(ws),\"fileId\":\"$F1\"}")")" 200
starred="$(api listFiles "{$(ws),\"filter\":\"starred\",\"query\":\"verify4b-\"}")"
check "starred filter" "$(json "$starred" '[.data.items[].name] | join(",")')" verify4b-renamed.stl
check "unstarFile" "$(status "$(api unstarFile "{$(ws),\"fileId\":\"$F1\"}")")" 200
check "starred filter after unstar" "$(json "$(api listFiles "{$(ws),\"filter\":\"starred\",\"query\":\"verify4b-\"}")" '.data.items | length')" 0

echo "== versions: list, restore"
vers="$(api listVersions "{$(ws),\"fileId\":\"$F1\"}")"
check "listVersions" "$(json "$vers" '[.data.current.number, (.data.versions | length), .data.versions[0].number] | join(",")')" 2,1,1
V1="$(json "$vers" '.data.versions[0].id')"
restore="$(api restoreVersion "{$(ws),\"fileId\":\"$F1\",\"versionId\":\"$V1\"}")"
check "restoreVersion" "$(json "$restore" '.data.versionNumber')" 3
check "history after restore" "$(json "$(api listVersions "{$(ws),\"fileId\":\"$F1\"}")" '[.data.current.number, (.data.versions | length)] | join(",")')" 3,2
check "unknown version" "$(status "$(api restoreVersion "{$(ws),\"fileId\":\"$F1\",\"versionId\":\"nope\"}")")" 404

echo "== trash, list trash, restore"
check "trashFile" "$(status "$(api trashFile "{$(ws),\"fileId\":\"$F2\"}")")" 200
check "trashed file left the list" "$(json "$(api listFiles "{$(ws),\"query\":\"verify4b-two\"}")" '.data.items | length')" 0
check "getFile on a trashed file" "$(status "$(api getFile "{$(ws),\"fileId\":\"$F2\"}")")" 404
trash="$(api listTrash "{$(ws)}")"
check "listTrash has it" "$(json "$trash" "[.data.items[].id] | index(\"$F2\") != null")" true
check "purgeAt is 30 days after deletedAt" "$(json "$trash" "(.data.items[] | select(.id == \"$F2\") | .purgeAt - .deletedAt)")" 2592000
check "restoreFile" "$(status "$(api restoreFile "{$(ws),\"fileId\":\"$F2\"}")")" 200
check "restored file is listed" "$(json "$(api listFiles "{$(ws),\"query\":\"verify4b-two\"}")" '.data.items | length')" 1

echo "== move into a restricted project (creates and archives verify4b-closed)"
proj="$(api createProject "{$(ws),\"name\":\"verify4b-closed\",\"accessMode\":\"restricted\"}")"
check "createProject" "$(status "$proj")" 200
P1="$(json "$proj" '.data.id')"
prev="$(api previewMoveFile "{$(ws),\"fileId\":\"$F2\",\"targetProjectId\":\"$P1\"}")"
check "previewMoveFile" "$(json "$prev" '.data.effects | [.links, .invitations, .guestGrants, .memberGrants] | join(",")')" 0,0,0,0
check "moveFile with a stale preview" "$(status "$(api moveFile "{$(ws),\"fileId\":\"$F2\",\"targetProjectId\":\"$P1\",\"expected\":{\"links\":1,\"invitations\":0,\"guestGrants\":0,\"memberGrants\":0}}")")" 409
check "moveFile" "$(status "$(api moveFile "{$(ws),\"fileId\":\"$F2\",\"targetProjectId\":\"$P1\",\"expected\":{\"links\":0,\"invitations\":0,\"guestGrants\":0,\"memberGrants\":0}}")")" 200
check "project list shows the moved file" "$(json "$(api listFiles "{$(ws),\"projectId\":\"$P1\"}")" '[.data.items[].name] | join(",")')" verify4b-two.stl
check "moveFile back out" "$(status "$(api moveFile "{$(ws),\"fileId\":\"$F2\",\"targetProjectId\":null}")")" 200

echo "== purge: trash both, purge both, R2 objects must be gone"
KEYS="$(pnpm -s wrangler d1 execute "$DB" --remote --json --command "SELECT r2Key AS k FROM files WHERE id IN ('$F1','$F2') UNION SELECT r2Key FROM file_versions WHERE fileId = '$F1'" 2>/dev/null | jq -r '.[0].results[].k' || true)"
[ -n "$KEYS" ] && ok "collected $(printf '%s\n' "$KEYS" | wc -l | tr -d ' ') R2 keys before the purge" || bad "could not read the keys (is wrangler logged in?)"
check "trash one" "$(status "$(api trashFile "{$(ws),\"fileId\":\"$F1\"}")")" 200
check "trash two" "$(status "$(api trashFile "{$(ws),\"fileId\":\"$F2\"}")")" 200
check "purgeFile one" "$(status "$(api purgeFile "{$(ws),\"fileId\":\"$F1\"}")")" 200
check "purgeFile two" "$(status "$(api purgeFile "{$(ws),\"fileId\":\"$F2\"}")")" 200
check "purged file is gone" "$(status "$(api getFile "{$(ws),\"fileId\":\"$F1\"}")")" 404
gone=0
for key in $KEYS; do
  if pnpm -s wrangler r2 object get "$BUCKET/$key" --remote --file /dev/null >/dev/null 2>&1; then bad "R2 still holds $key"; else gone=$((gone + 1)); fi
done
[ "$gone" -gt 0 ] && ok "$gone R2 objects are gone" || true

api archiveProject "{$(ws),\"projectId\":\"$P1\"}" >/dev/null
echo
echo "== look-ups to run by hand (staging only)"
cat <<LOOKUPS
  pnpm wrangler d1 execute $DB --remote --command "SELECT key, reason, attempts FROM storage_deletions"      # expect: empty (the purge deleted its objects)
  pnpm wrangler d1 execute $DB --remote --command "SELECT action, actorKind, targetId FROM access_log WHERE targetId IN ('$F1','$F2') ORDER BY createdAt"
  # Daily cron (03:30 UTC) purges trash older than 30 days: Workers dashboard -> vizcad-rewrite -> Triggers -> run the cron once, then check the logs for 'purgeExpiredTrash'.
LOOKUPS
echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
