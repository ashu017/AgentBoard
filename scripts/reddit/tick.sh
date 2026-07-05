#!/usr/bin/env bash
# One tick (runs every 5 min via launchd): handle EXACTLY ONE subreddit — the one
# the watermark points at — then advance the watermark. Once the week's pass is
# done, ticks are no-ops until a new ISO week. Reads Reddit + writes Telegram
# only; never posts to Reddit. The human uploads by hand.
#
# Invoked by launchd (ops/launchd/com.agentboard.reddit-tick.plist).
set -euo pipefail

# Resolve repo root (this script lives in scripts/reddit/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

LOG="${ROOT}/drafts/reddit/tick-$(date +%Y%m%d).log"
mkdir -p "${ROOT}/drafts/reddit"

# Ask the watermark for this tick's sub (JSON: {"sub":"...","index":N} or "null").
PICK=$(node -e "import('./scripts/reddit/seeds.mjs').then(async (s) => { const { nextSub } = await import('./scripts/reddit/watermark.mjs'); const r = nextSub({ subs: s.seedNames() }); process.stdout.write(JSON.stringify(r)); })")

if [ "$PICK" = "null" ]; then
  echo "[tick] $(date) — week's pass complete; idling." | tee -a "$LOG"
  exit 0
fi

SUB=$(printf '%s' "$PICK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).sub))")
echo "[tick] $(date) — drafting for r/${SUB}…" | tee -a "$LOG"

# Headless Claude Code: reuse the reddit-marketer agent to produce ONE draft.
PROMPT="Use the reddit-marketer agent. Research r/${SUB} (run fetch-top.mjs ${SUB}), then write ONE value-first draft post to drafts/reddit/${SUB}-weekly.md following the agent's draft format. Do not post to Reddit. After writing, print ONLY the final draft file's contents to stdout."

if DRAFT=$(claude -p "$PROMPT" 2>>"$LOG") && [ -n "$(printf '%s' "$DRAFT" | tr -d '[:space:]')" ]; then
  if node scripts/reddit/send-telegram.mjs "r/${SUB} — weekly draft:

${DRAFT}" >>"$LOG" 2>&1; then
    # Advance ONLY after a successful draft+send, so a failed tick retries this sub.
    node -e "import('./scripts/reddit/watermark.mjs').then(m => m.advance())"
    echo "[tick] ✓ sent r/${SUB} and advanced watermark" | tee -a "$LOG"
  else
    echo "[tick] ✗ telegram send failed for r/${SUB} — watermark NOT advanced (retry next tick)" | tee -a "$LOG"
    exit 1
  fi
else
  echo "[tick] ✗ draft failed for r/${SUB} — watermark NOT advanced (retry next tick)" | tee -a "$LOG"
  exit 1
fi
