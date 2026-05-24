/**
 * Cloudflare Turnstile CaptchaVerifier adapter.
 *
 * Verifies the client-minted Turnstile token against Cloudflare's
 * siteverify endpoint. The endpoint accepts a POST with form-encoded
 * body `secret=<key>&response=<token>&remoteip=<ip>` and returns JSON
 * `{ success, challenge_ts, hostname, action, cdata, error-codes }`.
 *
 * Activation gates (still required at deploy time):
 *   1. Cloudflare BAA covering Turnstile is executed.
 *   2. `TURNSTILE_SECRET_KEY` provisioned in 1Password + injected
 *      via the SST secret pipeline.
 *
 * Pre-activation behaviour: the composition root wires the in-memory
 * adapter (default-pass). The Turnstile adapter activates once both
 * gates are green. The contact form Server Action consumes
 * `CaptchaVerifier` via the container; no swap at the call site
 * is needed.
 *
 * Closure-capture discipline: the secret is captured into a const
 * inside the factory body, NOT retained as an object property. A
 * crash dump that inspected the returned `CaptchaVerifier` would
 * not expose the secret via property walk — the secret lives only
 * in the closure frame of the verify() call.
 *
 * Naming discipline (META-1): "turnstile" appears only in this file
 * path + adapter-internal identifiers. The port + factory are
 * vendor-agnostic.
 */

import type { CaptchaVerifier, VerificationContext, VerificationResult } from '../ports';

export interface TurnstileAdapterOptions {
  /**
   * Cloudflare Turnstile secret key, provisioned via SST secret
   * pipeline. Captured into the closure; not retained on the
   * returned object.
   */
  readonly secretKey: string;
  /**
   * Fetch implementation. Caller-injectable for testability; defaults
   * to the platform global `fetch`.
   */
  readonly fetchImpl?: typeof fetch;
  /**
   * Request timeout in milliseconds. Defaults to 5000 ms — Turnstile
   * recommends ≤ 10 s; we cap below that so a slow verify never
   * stalls the Server Action.
   */
  readonly timeoutMs?: number;
}

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

interface TurnstileResponse {
  readonly success: boolean;
  readonly hostname?: string;
  readonly action?: string;
  readonly challenge_ts?: string;
  readonly cdata?: string;
  readonly 'error-codes'?: readonly string[];
}

export function makeTurnstileCaptchaVerifier(options: TurnstileAdapterOptions): CaptchaVerifier {
  const secret = options.secretKey;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!secret || secret.length === 0) {
    throw new Error(
      'Turnstile secret key is required. Provision via SST secret pipeline (TURNSTILE_SECRET_KEY).',
    );
  }

  return {
    verify: async (token: string, context: VerificationContext): Promise<VerificationResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = new URLSearchParams({
          secret,
          response: token,
          remoteip: context.remoteIp,
        });
        const res = await fetchImpl(VERIFY_ENDPOINT, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          signal: controller.signal,
        });
        if (!res.ok) {
          return { ok: false, reason: `http_${res.status}` };
        }
        const parsed = (await res.json()) as TurnstileResponse;
        if (parsed.success) {
          return {
            ok: true,
            action: parsed.action ?? context.action,
            hostname: parsed.hostname ?? '',
          };
        }
        const reason = parsed['error-codes']?.[0] ?? 'unknown';
        return { ok: false, reason };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, reason: 'timeout' };
        }
        return { ok: false, reason: 'fetch_failed' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
