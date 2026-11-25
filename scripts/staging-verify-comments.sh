#!/usr/bin/env bash
# Faz 4d staging acceptance (docs/09 §10): comments, file activity, shared lists and the "recent" filter against the real
# staging Worker and D1. Run by hand against STAGING only.
#
#   SITE=https://vizcad-rewrite.<account>.workers.dev \
#   COOKIE='<the whole Cookie header of a signed-in browser session>' \
#   WORKSPACE_ID=<a company workspace the session's user OWNS or administers> \
#   scripts/staging-verify-comments.sh
#
# Needs curl, jq, python3 and (for the log look-ups at the end) a logged-in wrangler. Nothing here touches production: the
# script refuses any SITE that is not the staging Worker and only names the staging database. It uploads one small file
# (name starts with "verify4d-"), comments on it, then trashes and purges it again. The guest visibility matrix needs a
# second user and is covered by the program tests (comments.test.ts); this script checks the live wiring.
set -euo pipefail
set +B  # no brace expansion: JSON bodies like {"a",...} are built inline

: "${SITE:?set SITE to the staging Worker URL}"
: "${COOKIE:?set COOKIE to a signed-in session Cookie header}"
: "${WORKSPACE_ID:?set WORKSPACE_ID}"
case "$SITE" in https://vizcad-rewrite.*.workers.dev) ;; *) echo "SITE must be the staging Worker (vizcad-rewrite)"; exit 2 ;; esac

DB=vizcad-staging
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: expected $3, got $2"; fi; }

api() { # api <operation> <json body> -> prints "<status> <body>"; a short pause keeps the Free plan's CPU budget happy
  sleep 0.4
  curl -sS -o "$WORK/body" -w '%{http_code}' -X POST "$SITE/api/app/$1" \
    -H "Cookie: $COOKIE" -H "Origin: $SITE" -H 'Content-Type: application/json' -d "$2"
  printf ' %s\n' "$(cat "$WORK/body")"
}
status() { printf '%s' "$1" | cut -d' ' -f1; }
json()   { printf '%s' "$1" | cut -d' ' -f2- | jq -r "$2"; }
ws() { printf '"workspaceId":"%s"' "$WORKSPACE_ID"; }

echo "== test file"
python3 - "$WORK" <<'PY'
import struct, sys
with open(f"{sys.argv[1]}/c.stl", "wb") as f:
    f.write(b"C".ljust(80, b" ")); f.write(struct.pack("<I", 2)); f.write(bytes(100))
PY
size="$(wc -c < "$WORK/c.stl" | tr -d ' ')"
req="$(api requestUpload "{$(ws),\"name\":\"verify4d-comments.stl\",\"size\":$size}")"
check "requestUpload" "$(status "$req")" 200
ticket="${req#* }"
url="$(printf '%s' "$ticket" | jq -r '.data.url')"
ct="$(printf '%s' "$ticket" | jq -r '.data.headers["Content-Type"]')"
inm="$(printf '%s' "$ticket" | jq -r '.data.headers["If-None-Match"]')"
code="$(curl -sS -D "$WORK/put-headers" -o /dev/null -w '%{http_code}' -X PUT "$url" -H "Content-Type: $ct" -H "If-None-Match: $inm" --data-binary "@$WORK/c.stl")"
check "PUT to R2" "$code" 200
etag="$(grep -i '^etag:' "$WORK/put-headers" | tail -1 | sed -E 's/^[^:]*: *//' | tr -d '\r')"
done_="$(api completeUpload "{\"uploadId\":\"$(printf '%s' "$ticket" | jq -r '.data.uploadId')\",\"etag\":$(jq -Rn --arg e "$etag" '$e')}")"
check "completeUpload" "$(status "$done_")" 200
F="$(json "$done_" '.data.fileId')"

echo "== comments: write, reply, list"
c1="$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"  first <b>comment</b>  \"}")"
check "addComment" "$(status "$c1")" 200
check "text is trimmed and stays plain" "$(json "$c1" '.data.content')" 'first <b>comment</b>'
check "version number recorded" "$(json "$c1" '.data.versionNumber')" 1
C1="$(json "$c1" '.data.id')"
check "comment view has no e-mail or user id" "$(json "$c1" '.data | [has("email"), has("userId")] | any')" false
r1="$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"a reply\",\"parentId\":\"$C1\"}")"
check "reply" "$(status "$r1")" 200
R1="$(json "$r1" '.data.id')"
check "reply to a reply" "$(json "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"too deep\",\"parentId\":\"$R1\"}")" '.error')" CommentUnavailable
check "empty comment" "$(status "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"   \"}")")" 400
check "4001 characters" "$(status "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"$(python3 -c 'print("x" * 4001)')\"}")")" 400
check "client scope is rejected" "$(status "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"x\",\"authorScopeAtWrite\":\"internal\"}")")" 400
list="$(api listComments "{$(ws),\"fileId\":\"$F\"}")"
check "listComments" "$(json "$list" '[.data.items[].content] | join("|")')" 'first <b>comment</b>|a reply'
check "reply points at its parent" "$(json "$list" '.data.items[1].parentId')" "$C1"
check "listComments page of one" "$(json "$(api listComments "{$(ws),\"fileId\":\"$F\",\"limit\":1}")" '[(.data.items | length), (.data.nextCursor != null)] | join(",")')" 1,true

echo "== delete keeps the thread"
check "deleteComment" "$(status "$(api deleteComment "{$(ws),\"commentId\":\"$C1\"}")")" 200
check "deleteComment again" "$(status "$(api deleteComment "{$(ws),\"commentId\":\"$C1\"}")")" 200
after="$(api listComments "{$(ws),\"fileId\":\"$F\"}")"
check "tombstone: text gone, flag set, reply stays" "$(json "$after" '[.data.items[0].content, .data.items[0].deleted, (.data.items | length)] | join(",")')" ',true,2'
check "no reply to a deleted comment" "$(json "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"late\",\"parentId\":\"$C1\"}")" '.error')" CommentUnavailable
check "unknown comment" "$(json "$(api deleteComment "{$(ws),\"commentId\":\"nope\"}")" '.error')" CommentUnavailable

echo "== file activity: events only"
act="$(api listFileActivity "{$(ws),\"fileId\":\"$F\"}")"
check "listFileActivity" "$(status "$act")" 200
check "events" "$(json "$act" '[.data.items[].action] | sort | join(",")')" 'comment.created,comment.created,comment.deleted,file.uploaded'
check "rows carry no ids of links, requests or IPs" "$(json "$act" '.data.items[0] | keys | join(",")')" 'action,actor,createdAt,id,outcome'
check "no comment text in the activity" "$(json "$act" 'tostring | test("first|reply")')" false

echo "== recent and shared lists"
recent="$(api listFiles "{$(ws),\"filter\":\"recent\",\"query\":\"verify4d-\"}")"
check "recent filter" "$(status "$recent")" 200
check "recent lists the file I uploaded" "$(json "$recent" '[.data.items[].name] | join(",")')" verify4d-comments.stl
check "listSharedWithMe" "$(status "$(api listSharedWithMe "{$(ws)}")")" 200
by_me="$(api listSharedByMe "{$(ws)}")"
check "listSharedByMe" "$(status "$by_me")" 200
check "an unshared file is not in listSharedByMe" "$(json "$by_me" "[.data.items[].id] | index(\"$F\") == null")" true

echo "== clean up: trash, purge"
check "trashFile" "$(status "$(api trashFile "{$(ws),\"fileId\":\"$F\"}")")" 200
check "no comment on a trashed file" "$(status "$(api addComment "{$(ws),\"fileId\":\"$F\",\"content\":\"x\"}")")" 404
check "purgeFile" "$(status "$(api purgeFile "{$(ws),\"fileId\":\"$F\"}")")" 200

echo
echo "== look-ups to run by hand (staging only)"
cat <<LOOKUPS
  pnpm wrangler d1 execute $DB --remote --command "SELECT action, actorKind, targetKind, targetId, reason FROM access_log WHERE targetId = '$F' ORDER BY createdAt"   # no names, e-mails, text, IPs
  pnpm wrangler d1 execute $DB --remote --command "SELECT count(*) FROM file_comments WHERE fileId = '$F'"                                                          # expect 0 (purge cascades)
  # Daily cron (03:30 UTC): Workers dashboard -> vizcad-rewrite -> Triggers -> run the cron once, then check the logs for 'pruneAccessLog' (deleted: 0 on a young log).
LOOKUPS
echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
