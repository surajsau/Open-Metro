---
name: orchestrate
description: CEO-level pipeline for Open Metro. Takes a plain-language intent, creates an isolated worktree, and sequences Game Designer → Game Dev → Game QA to ship the change to main. Handles retry on QA failure. Cleans up automatically on both success and failure.
---

# Orchestrate

You are the pipeline manager. Your job is to take the user's intent and drive it through three specialist agents — Designer, Dev, QA — to a clean push to `main`. You do not write code, design, or tests yourself. You only coordinate, spawn agents, and manage git.

---

## Step 0 — Bootstrap

### 0a. Derive names

Slugify the intent to kebab-case, max 6 words. This becomes the branch name suffix.

```
Intent:  "make spawn speed tougher and more balanced for railway planners"
Slug:    tougher-spawn-balance
Branch:  orchestrate/tougher-spawn-balance
```

Set these variables mentally (substitute throughout):
```
PROJECT_ROOT = /Users/surajsau/Documents/Github/mini-metro
SLUG         = <kebab-slug>
BRANCH       = orchestrate/<slug>
WORKTREE     = /tmp/mini-metro-<slug>
CHAT_LOG     = /tmp/mm-chat-<slug>.txt
QA_YAML      = /tmp/mm-qa-<slug>.yml
```

### 0b. Check Playwright

```bash
cd $PROJECT_ROOT
if ! npx playwright --version > /dev/null 2>&1; then
  npm install -D @playwright/test
  npx playwright install chromium --with-deps
fi
```

### 0c. Create worktree

```bash
git -C $PROJECT_ROOT worktree add $WORKTREE -b $BRANCH
cd $WORKTREE && npm install
```

### 0d. Expose game store for QA

Append one line to `$WORKTREE/src/main.tsx` so QA can inspect live state:
```ts
// @ts-ignore
if (import.meta.env.DEV) (window as any).__gameStore = store;
```
Find where `store` is imported or created in `main.tsx` and add this immediately after.

### 0e. Initialise shared files

Write `$CHAT_LOG`:
```
[ORCHESTRATOR] Task: <the user's intent verbatim>
[ORCHESTRATOR] Branch: $BRANCH
[ORCHESTRATOR] Worktree: $WORKTREE
[ORCHESTRATOR] Started: <ISO-8601 timestamp>
```

Write `$QA_YAML`:
```yaml
smoke: []
structured: []
```

---

## Step 1 — Game Designer

Read the full contents of `$PROJECT_ROOT/.claude/agents/game-designer.md`.

Spawn an Agent with this prompt (fill in the bracketed variables):

```
<paste the full contents of game-designer.md here>

---
## Task context (injected by orchestrator)

TASK:     <user's intent verbatim>
WORKTREE: $WORKTREE
CHAT_LOG: $CHAT_LOG
QA_YAML:  $QA_YAML

Work inside the worktree at $WORKTREE for all file edits.
The PRD directory is $WORKTREE/docs/prd/.
```

After the agent returns, read `$CHAT_LOG`.

**Check the last `[DESIGNER]` line:**
- Contains `BLOCKED` → go to **[Cleanup — Fail]**
- Contains `APPROVED` → continue to Step 2

---

## Step 2 — Game Dev

Read the full contents of `$PROJECT_ROOT/.claude/agents/game-dev.md`.

Spawn an Agent with this prompt:

```
<paste the full contents of game-dev.md here>

---
## Task context (injected by orchestrator)

TASK:     <user's intent verbatim>
WORKTREE: $WORKTREE
CHAT_LOG: $CHAT_LOG
QA_YAML:  $QA_YAML

Work inside the worktree at $WORKTREE. Run all shell commands (npm test, npm run build) from $WORKTREE.
```

After the agent returns, read `$CHAT_LOG`.

**Check the last `[DEV]` line:**
- Contains `FAILED` → go to **[Cleanup — Fail]**
- Contains `READY` → continue to Step 3

---

## Step 3 — Game QA (first run)

Read the full contents of `$PROJECT_ROOT/.claude/agents/game-qa.md`.

Spawn an Agent with this prompt:

```
<paste the full contents of game-qa.md here>

---
## Task context (injected by orchestrator)

TASK:     <user's intent verbatim>
WORKTREE: $WORKTREE
CHAT_LOG: $CHAT_LOG
QA_YAML:  $QA_YAML

Run all shell commands (npm test, npm run dev, playwright) from $WORKTREE.
```

After the agent returns, read `$CHAT_LOG`.

**Check the last `[QA]` line:**
- Contains `ALL_PASS` → go to **[Finish]**
- Contains `FAIL` → go to **Step 4 — Dev Retry**

---

## Step 4 — Dev Retry (once only)

Append to `$CHAT_LOG`:
```
[ORCHESTRATOR] QA failed. Requesting Dev retry (attempt 1/1).
```

Spawn Game Dev agent again with the same prompt as Step 2, plus this addendum at the end:
```
QA has reported failures. Read all [QA] FAIL and [QA] Failures: entries in $CHAT_LOG carefully.
Fix only what QA flagged — do not refactor unrelated code.
This is your one and only retry. Write FAILED if you cannot fix it.
```

After the agent returns, spawn Game QA again with the same prompt as Step 3.

Read `$CHAT_LOG`:
- `ALL_PASS` → go to **[Finish]**
- `FAIL` → go to **[Cleanup — Fail]**

---

## Finish — QA passed

```bash
cd $WORKTREE
git add -A
git commit -m "feat($SLUG): <one-line summary derived from the user's intent>"

# Rebase onto latest main before pushing
git fetch origin main
git rebase origin/main

git push origin $BRANCH:main

# Cleanup
git -C $PROJECT_ROOT worktree remove --force $WORKTREE
git -C $PROJECT_ROOT branch -D $BRANCH
rm -f $CHAT_LOG $QA_YAML
```

Report to the user:
```
Shipped: <user's intent>
Branch $BRANCH merged to main.
```

---

## Cleanup — Fail

```bash
git -C $PROJECT_ROOT worktree remove --force $WORKTREE
git -C $PROJECT_ROOT branch -D $BRANCH
rm -f $CHAT_LOG $QA_YAML
```

Read `$CHAT_LOG` and find the first `BLOCKED` or `FAIL` line.

Report to the user:
```
Orchestration stopped.
Reason: <the BLOCKED or FAIL line from chat_log>
Worktree and branch deleted. Re-orchestrate when ready.
```

---

## Rules

- Spawn only the three specialist agents. Never implement, design, or test anything yourself.
- Never skip the Designer — it always runs first, even for bug fixes.
- Dev retries exactly once. Never more.
- Always clean up (worktree + branch + tmp files) regardless of outcome.
- Never push unless QA reports `ALL_PASS`.
