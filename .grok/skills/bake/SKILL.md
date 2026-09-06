---
name: bake
description: >
  Pull this session's updates into the Mototelos canonical clone at
  D:\repositories\motorcycle_dynamics_v4. Use when the user says "bake it",
  "bake this", "ok bake this", "pull all updates into the canonical clone",
  or runs /bake.
user-invocable: true
---

# Bake (canonical clone)

Canonical clone: `D:\repositories\motorcycle_dynamics_v4`  
Remote backup: `origin/main`  
This Grok folder is often a separate worktree, not the clone Local Hoster runs.

## Talk

1. First user-visible line: `Ok pulling all updates into the canonical clone...`
2. When finished: confirm path, HEAD short hash, subject, and that they should hard-refresh Local Hoster (http://localhost:5057) if it is already running.
3. If something blocked the pull, say so plainly (conflict, untracked overwrite, network).

## Do

Work from the current worktree, then update D:\.

1. If this worktree is not the canonical clone:
   - Commit any remaining session work the user meant to bake (project source; skip secrets and scratch unless they asked).
   - `git push origin` so `origin/main` has it.
2. In `D:\repositories\motorcycle_dynamics_v4`:
   - `git fetch origin`
   - If untracked files would block checkout (same paths as incoming commits), remove only those overlapping untracked files, or stash local tracked edits first.
   - `git pull --ff-only origin main`
   - If fast-forward is impossible, stop and report; do not force-reset unless they ask.
3. Confirm `git -C D:\repositories\motorcycle_dynamics_v4 log -1 --oneline` matches the baked commit.

Do not bake into this Grok worktree instead of D:\. Do not switch Local Hoster's launch path.
