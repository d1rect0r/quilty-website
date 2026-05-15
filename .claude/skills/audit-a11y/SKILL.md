---
name: audit-a11y
description: Full accessibility audit using axe-core, Lighthouse, and a manual WCAG 2.2 AA checklist. Use before milestone push and quarterly thereafter. EAA compliance posture (EU, effective June 2025).
disable-model-invocation: true
allowed-tools: Bash(pnpm *), Bash(npx @axe-core/cli *), Bash(npx lighthouse *), Bash(curl *), Bash(kill *), Read
---

## Instructions

Run a three-pronged a11y audit against the local production build:

1. **Build + start production server** with explicit failure handling:

   ```bash
   if ! pnpm --filter web build; then
     echo "BUILD FAILED — aborting a11y audit"
     exit 1
   fi
   pnpm --filter web start &
   SERVER_PID=$!
   trap "kill $SERVER_PID 2>/dev/null" EXIT
   for i in 1 2 3 4 5 6 7 8 9 10; do
     curl -sf http://localhost:3000 >/dev/null && break
     sleep 1
   done
   if ! curl -sf http://localhost:3000 >/dev/null; then
     echo "server failed to come up after 10s — aborting"
     exit 1
   fi
   ```

2. **Automated scan with axe-core:**

   ```bash
   npx @axe-core/cli http://localhost:3000 http://localhost:3000/about http://localhost:3000/privacy http://localhost:3000/support
   ```

3. **Lighthouse a11y category for top routes:**

   ```bash
   npx lighthouse http://localhost:3000 --only-categories=accessibility --quiet --chrome-flags="--headless"
   ```

4. **Server cleanup**: the `trap` above kills the server on exit.

5. **Apply the manual WCAG 2.2 AA checklist:**
   - Keyboard-only walkthrough of every interactive flow (Tab, Shift+Tab, Enter, ESC)
   - Screen reader spot-check (VoiceOver/NVDA) on the landing page + one auth page
   - 200% zoom: layout still usable, no horizontal scroll on text content
   - Forced-colors mode: content still visible
   - Reduced-motion preference: animations respect `prefers-reduced-motion`
   - Color contrast: spot-check brand colors with WebAIM Contrast Checker

6. **Report:**
   - axe violations count by severity
   - Lighthouse score (must be >= 95 for milestone push — same threshold as `/scaffold-page`)
   - Manual checklist pass/fail per category

Critical failures must be filed as `[A11Y]` issues before push.

**Pre-EU-launch:** Budget for a manual audit by TPGi or Deque (~$5-15k). Automation catches ~57% per Deque's own figure; manual audit covers the rest.
