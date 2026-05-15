---
description: Verify CSP headers are strict (nonce + strict-dynamic, no unsafe-inline for scripts) and that report-only URI catches violations. Use before milestone push and after any change to middleware or next.config. HIPAA load-bearing per D32.
allowed-tools: Bash(curl *), Bash(pnpm *), Read
---

## Instructions

1. **Start local production server** in background:

   ```bash
   pnpm build && pnpm start &
   SERVER_PID=$!
   sleep 5
   ```

2. **Curl key routes and inspect headers:**

   ```bash
   for path in / /privacy /terms /support /account/delete; do
     echo "=== $path ==="
     curl -sI "http://localhost:3000$path" | grep -iE '^(content-security-policy|strict-transport-security|referrer-policy|x-frame-options|x-content-type-options|permissions-policy|cross-origin-)'
   done
   ```

3. **Verify in each CSP header:**
   - `script-src` contains `'strict-dynamic'` and a per-request nonce (NOT `'unsafe-inline'`, NOT `'unsafe-eval'`)
   - `style-src` strategy is documented (Tailwind v4 emits a known set; if `'unsafe-inline'` is present, ensure ADR justifies it)
   - `connect-src` lists only known endpoints (Sentry ingest, Amplitude, our API at api.my-quilty.com, auth.my-quilty.com)
   - `frame-ancestors 'none'` (or `'self'` if intentional)
   - `report-uri` or `report-to` is set (initially to local logger; production to Sentry CSP reports endpoint)
   - `default-src 'self'` as baseline

4. **Verify other security headers:**
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (default-deny per D33)

5. **Read `middleware.ts`** and confirm nonce is generated per-request (not static, not derived from request data).

6. **Read `next.config.*`** for any header-related config.

7. **Stop the server:** `kill $SERVER_PID`

8. **Report:** any violations or weakening, with the line in middleware/config that should change.

Critical failures must be fixed before milestone push. CSP is the single most retrofit-hostile header per Web Almanac 2025; lock it strict from day one.
