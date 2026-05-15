---
description: Deploy a preview stage with SST 3.x. Reads the current branch name, sanitises it for AWS, and deploys to that stage. Reports the preview URL.
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Bash(npx *), Bash(git *), Bash(aws *)
argument-hint: [optional-stage-suffix]
---

## Branch info
- Current branch: !`git branch --show-current`
- AWS identity: !`aws sts get-caller-identity 2>&1 | head -5`

## Instructions

Compute the stage name:
- Take the current branch above
- Lowercase, replace non-alphanumerics with `-`, truncate to 30 chars
- Append `-$0` if an argument was passed

Then run:

```bash
pnpm sst deploy --stage <computed-stage>
```

When the deploy completes:
1. Extract the CloudFront URL from the SST output
2. Print it on its own line prefixed with `PREVIEW_URL=`
3. Open the URL with `open` (macOS) if interactive

If the deploy fails, do NOT retry. Print the error and stop.

**Never deploy to a production stage from this skill** — that requires explicit user authorization and goes through CI per `feedback_push_per_phase`.
