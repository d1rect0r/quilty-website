# `cf-functions/` — CloudFront Functions edge-tier harness

CloudFront Functions (CFFs) are AWS's edge-execution runtime: 1ms-budget
JavaScript that runs at every CloudFront PoP, ahead of the origin. CFFs
own a narrow set of edge concerns where the round-trip to the Lambda
origin is wasted CPU: cookie writes, response-header decoration, simple
URL rewrites.

## What this directory contains

Three CFFs that today live in `apps/web/proxy.ts` (Next.js Edge
runtime, executed at the OpenNext Lambda origin):

| CFF                         | Event           | proxy.ts counterpart                       | Activation gate                                             |
| --------------------------- | --------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `gpc-force-off.cff.js`      | viewer-response | `applyGpcForceOffCookie` (proxy.ts)        | end-to-end parity test in staging + 1-week clean bake       |
| `security-headers.cff.js`   | viewer-response | `applySecurityHeaders` baseline (proxy.ts) | **SUPERSEDED by the RHP (T2-6) — do not wire; see gate §2** |
| `robots-tag-defense.cff.js` | viewer-response | `shouldNoindexPath` (proxy.ts)             | Same as above                                               |

All three CFFs run on the VIEWER-RESPONSE pass. An earlier draft used
a two-CFF viewer-request + viewer-response stash for the GPC cookie
write; that design leaked an internal control header to the Lambda
origin and was replaced by a single viewer-response CFF that reads
`event.request.headers['sec-gpc']` directly.

Each CFF is a `function handler(event) { ... }` exported via the
CloudFront Functions runtime API. Parity tests validate that CFF
output matches `proxy.ts` for the same input vector — proving the
edge tier is a behaviour-equivalent shift.

## Architecture

CloudFront Functions run AHEAD of the OpenNext Lambda origin. The
runtime is restricted:

- ES2020 subset (no `async`/`await`; CFF runtime v2 added it but we
  target broad availability).
- No `Buffer`, no Node APIs, no `fetch`. Only the standard JS globals
  (`Object`, `Array`, `String`, `Math`, `JSON`, `Date`) + the `event`
  object that CloudFront passes in.
- 1ms execution budget per invocation. ~10KB compiled bundle limit.
- No external modules. Each CFF is a single self-contained file.

`event` shape (viewer-request / viewer-response variants):

```js
// viewer-request
event = {
  version: '1.0',
  context: { distributionId, requestId, eventType: 'viewer-request' },
  viewer: { ip },
  request: {
    method: 'GET',
    uri: '/en/account/security',
    querystring: {},
    headers: { 'sec-gpc': { value: '1' }, ... },
    cookies: { '__Host-quilty_consent': { value: '...' } },
  },
}

// viewer-response
event = {
  ...,
  request: { /* same shape */ },
  response: {
    statusCode: 200,
    statusDescription: 'OK',
    headers: { 'content-type': { value: 'text/html' }, ... },
    cookies: { },
  },
}
```

A CFF returns either the request (for viewer-request) or the response
(for viewer-response), with header/cookie mutations applied.

## SST wiring (deferred — gated on parity verification)

The SST `transform.cdn` hook is the integration point. At M3+ activation,
the wiring lands in `sst.config.ts`:

```ts
// sst.config.ts (deferred until activation gate)
const cfFunctionFromFile = (name) =>
  new aws.cloudfront.Function(name, {
    runtime: 'cloudfront-js-2.0',
    comment: `${name} — CFF`,
    publish: true,
    code: $resolve([]).apply(() => fs.readFileSync(`cf-functions/${name}.cff.js`, 'utf8')),
  });

new sst.aws.Nextjs('Web', {
  // ...
  transform: {
    cdn: (args) => {
      args.behaviors = args.behaviors.map((b) => ({
        ...b,
        functionAssociations: [
          { eventType: 'viewer-response', functionArn: gpcForceOff.arn },
          { eventType: 'viewer-response', functionArn: securityHeaders.arn },
          { eventType: 'viewer-response', functionArn: robotsTagDefense.arn },
        ],
      }));
    },
  },
});
```

**Activation-gate checklist** (must complete before flipping
`ENABLE_CF_FUNCTIONS=true` in production):

1. **Suppress dual cookie write** — wire a flag in `apps/web/proxy.ts`
   `applyGpcForceOffCookie` that skips the write when an environment
   variable (`QUILTY_CFF_OWNS_GPC_COOKIE=1`) signals the CFF tier is
   active. Without this, the same response carries two
   `Set-Cookie: __Host-quilty_consent=...` headers (one from proxy.ts,
   one from the CFF) and the browser's last-wins semantics produce
   non-deterministic Max-Age values.

2. **`security-headers.cff.js` is SUPERSEDED by the ResponseHeadersPolicy (T2-6, 2026-07)** —
   `sst.config.ts` now sets the full static security-header baseline — including the
   apex-only HSTS ramp (`strictTransportSecurity`, phase-driven via `HSTS_PHASE`) — via a
   native CloudFront ResponseHeadersPolicy attached to every behaviour, so `_next/static`
   assets and CloudFront error bodies carry the headers too. A static ResponseHeadersPolicy
   does this more cheaply and with zero drift surface vs. a hand-maintained CFF. **Therefore,
   if the CFF tier is ever activated, DROP `security-headers.cff.js`** (the RHP is its
   canonical replacement) and wire only the _dynamic_ CFFs — `gpc-force-off.cff.js` and
   `robots-tag-defense.cff.js` — whose per-request logic the static RHP cannot express. Do
   NOT wire `security-headers.cff.js`: its hardcoded `max-age=300` would drift from the
   RHP/app phase value. HSTS ramp source of truth: `quilty-aws/docs/runbooks/hsts-ramp.md`.
   (The file + its parity test are retained for now as reference; they are inert — nothing
   wires them — so they cause no live drift.)

3. **Run AWS CloudFront `test-function` against staging** — the
   in-process `new Function(...)` eval the parity tests use does NOT
   exercise the QuickJS runtime. `aws cloudfront test-function --name
<name> --event-object <stub.json>` is the canonical pre-deploy
   verification.

4. **Soak in staging for 1 week** without rolling back, measuring
   header-emission rates + cookie-write rates against the proxy.ts
   tier's baseline metrics.

Until the gate flips, `proxy.ts` remains the canonical implementation;
CFFs are dormant code in the repo.

## Parity test protocol

Each CFF has a sibling `__tests__/<name>.test.ts` that:

1. Stubs the CloudFront event object via `cf-runtime-stub.ts`.
2. Invokes the CFF handler.
3. Asserts the CFF output (header set, cookie set, URI rewrite) matches
   what `proxy.ts` would produce for the same input.

The stub mirrors only the surface CFFs actually use — header lookup

- cookie read + cookie write + URI inspection. Full CloudFront event
  shape is documented in
  [AWS CloudFront Functions Event Structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html).

## Bundle-size + runtime constraints

| Constraint               | Limit                   | Current                                                                         |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| Bundle size              | 10 KB (deployed source) | <2 KB per CFF                                                                   |
| Execution time           | 1 ms per request        | Hot-path-only header set + cookie write — well under                            |
| External modules         | None                    | Zero — each CFF is single-file ES2020                                           |
| Memory                   | 2 MB peak               | Negligible (no state)                                                           |
| Cryptographic primitives | None in v2              | Cloudflare Workers + Vercel Edge expose `crypto.subtle`; future CDN swap option |

If a CFF approaches these limits, the work belongs at the Lambda origin
(proxy.ts), not at the edge. The `crypto.subtle` absence is also the
reason CSP nonce minting stays at the origin — escaping the CFF
runtime to access randomness would require a hop to Cloudflare Workers
or Vercel Edge, neither of which is wired today.
