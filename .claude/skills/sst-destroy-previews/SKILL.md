---
name: sst-destroy-previews
description: Destroy stale SST preview stages whose git branch no longer exists on origin. Use periodically to clean up cost-bearing preview deployments.
disable-model-invocation: true
allowed-tools: Bash(pnpm sst remove *), Bash(sst remove *), Bash(git ls-remote *), Bash(aws cloudformation list-stacks *), Bash(aws cloudformation describe-stacks *)
---

## Live stages
- SST app name (from sst.config.ts): !`grep -E "^\s*name:" sst.config.ts | head -1`
- Remote branches: !`git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'`

## Instructions

1. List all CloudFormation/Pulumi stacks matching the SST app prefix (use `aws cloudformation list-stacks` or check SST state).
2. For each stack, derive the stage name from the stack name.
3. Cross-reference against the remote branches above.
4. **Skip these stages no matter what**: `production`, `staging`, `main`, any stage matching an existing remote branch.
5. Print the kill list and ASK FOR CONFIRMATION before destroying.
6. On confirmation, run `pnpm sst remove --stage <stage>` for each stale stage, one at a time.
7. Report which succeeded and which failed.

**Never destroy `production`, `staging`, or `main`** even if explicitly asked — print an error and stop. Those require manual destruction with explicit user approval through a different process.

Note: `guard-bash.sh` blocks bare `sst remove` / `pnpm sst remove` (without `--stage` constraints) at the PreToolUse level as defense-in-depth.
