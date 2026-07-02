import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPepperCacheForTesting,
  isSensitiveKey,
  sanitize,
  sanitizeAsync,
} from '../domain/sanitizer';

describe('isSensitiveKey', () => {
  it('matches known PHI keys', () => {
    expect(isSensitiveKey('email')).toBe(true);
    expect(isSensitiveKey('phone')).toBe(true);
    expect(isSensitiveKey('dob')).toBe(true);
    expect(isSensitiveKey('diagnosis')).toBe(true);
    expect(isSensitiveKey('medication')).toBe(true);
    expect(isSensitiveKey('mrn')).toBe(true);
    expect(isSensitiveKey('phq9')).toBe(true);
  });

  it('matches case-insensitive + dash-normalized variants', () => {
    expect(isSensitiveKey('EMAIL')).toBe(true);
    expect(isSensitiveKey('Email-Address')).toBe(true);
    expect(isSensitiveKey('date-of-birth')).toBe(true);
  });

  it('matches credential keys (defense-in-depth)', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
  });

  it('does not match common non-PHI keys', () => {
    expect(isSensitiveKey('route')).toBe(false);
    expect(isSensitiveKey('status')).toBe(false);
    expect(isSensitiveKey('duration_ms')).toBe(false);
    expect(isSensitiveKey('event_name')).toBe(false);
  });

  it('does not redact bare `state` (collision with OAuth state + form state)', () => {
    // `state` is the canonical OAuth 2.0 state parameter + a common Redux
    // / form-field key; the geographic concept ships under
    // `state_province` / `us_state` to keep the bare key usable.
    expect(isSensitiveKey('state')).toBe(false);
    expect(isSensitiveKey('state_province')).toBe(true);
    expect(isSensitiveKey('us_state')).toBe(true);
  });

  it('catches camelCase variants of denylist keys (Cerebral failure mode)', () => {
    // JS analytics SDKs emit camelCase property names by convention.
    // Without camelCase normalization, `userId` / `patientID` etc. would
    // bypass the denylist — the exact configuration gap the FTC cited
    // in the Cerebral settlement.
    expect(isSensitiveKey('userId')).toBe(true);
    expect(isSensitiveKey('patientID')).toBe(true);
    expect(isSensitiveKey('memberId')).toBe(true);
    expect(isSensitiveKey('creditCard')).toBe(true);
    expect(isSensitiveKey('cardNumber')).toBe(true);
    expect(isSensitiveKey('streetAddress')).toBe(true);
    expect(isSensitiveKey('firstName')).toBe(true);
    expect(isSensitiveKey('socialSecurityNumber')).toBe(true);
    expect(isSensitiveKey('PhoneNumber')).toBe(true);
  });

  it('catches the canonical analytics identifier fields', () => {
    // Industry-canonical analytics SDK identifier fields — every major
    // vendor ships at least one of these by default.
    expect(isSensitiveKey('user_id')).toBe(true);
    expect(isSensitiveKey('userId')).toBe(true);
    expect(isSensitiveKey('distinct_id')).toBe(true);
    expect(isSensitiveKey('subscriber_id')).toBe(true);
    expect(isSensitiveKey('member_id')).toBe(true);
    expect(isSensitiveKey('profile_id')).toBe(true);
  });

  it('catches direct-identifier variants beyond the standard list', () => {
    expect(isSensitiveKey('birthdate')).toBe(true);
    expect(isSensitiveKey('birthDate')).toBe(true);
    expect(isSensitiveKey('birth_date')).toBe(true);
    expect(isSensitiveKey('maidenName')).toBe(true);
    expect(isSensitiveKey('maiden_name')).toBe(true);
  });
});

describe('sanitize (sync)', () => {
  it('redacts PHI keys at any nesting depth', () => {
    const input = {
      route: '/en/account',
      email: 'user@example.com',
      nested: { phone: '+1-555-0100', diagnosis: 'panic disorder' },
      array: [{ medication: 'sertraline' }, { route: '/safe' }],
    };
    const out = sanitize(input);
    expect(out).toMatchObject({
      route: '/en/account',
      email: '[REDACTED]',
      nested: { phone: '[REDACTED]', diagnosis: '[REDACTED]' },
      array: [{ medication: '[REDACTED]' }, { route: '/safe' }],
    });
  });

  it('redacts JWT-shaped strings', () => {
    // Synthetic JWT-shaped value: starts with `ey` (matches the sanitizer
    // pattern, which requires `ey` + 3 base64url segments + length ≥ 40)
    // but NOT `eyJ` (so the repo's secret-scanner does not flag this
    // test fixture as a literal-looking JWT).
    const jwt = 'eyABCDEFGHIJKLMNOP.eyQRSTUVWXYZ12345.aSignatureValueHere';
    expect(sanitize(jwt)).toBe('[REDACTED]');
  });

  it('does NOT redact innocent 3-dot strings (JWT false-positive fix)', () => {
    // Domain names, semvers, and other 3-dot non-JWT strings pass untouched.
    // Real JWTs start with `ey` (base64url of JSON `{`) and are always
    // >= 40 chars in compact form.
    expect(sanitize('auth.my-quilty.com')).toBe('auth.my-quilty.com');
    expect(sanitize('v1.0.0')).toBe('v1.0.0');
    expect(sanitize('api.example.com')).toBe('api.example.com');
  });

  it('redacts HTTP auth headers + session cookies (reviewer fix)', () => {
    const input = {
      route: '/en/account',
      headers: {
        cookie: '__Host-quilty_session=abc',
        authorization: 'Bearer xyz',
        'x-forwarded-for': '203.0.113.5',
        'x-api-key': 'sk_live_xyz',
      },
    };
    const out = sanitize(input) as { route: string; headers: Record<string, string> };
    expect(out.route).toBe('/en/account');
    expect(out.headers.cookie).toBe('[REDACTED]');
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.headers['x-forwarded-for']).toBe('[REDACTED]');
    expect(out.headers['x-api-key']).toBe('[REDACTED]');
  });

  it('redacts personal name fields at any case', () => {
    const out = sanitize({
      first_name: 'Alice',
      lastName: 'Smith',
      DisplayName: 'alice42',
      username: 'aliceeee',
      route: '/en',
    }) as Record<string, string>;
    expect(out.first_name).toBe('[REDACTED]');
    expect(out.lastName).toBe('[REDACTED]');
    expect(out.DisplayName).toBe('[REDACTED]');
    expect(out.username).toBe('[REDACTED]');
    expect(out.route).toBe('/en');
  });

  it('hashes UUID-shaped strings (stable, non-reversible)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = sanitize(uuid) as string;
    expect(out).toMatch(/^id:[0-9a-f]{8}$/);
    // Same input → same hash (stable for debug correlation).
    expect(sanitize(uuid)).toBe(out);
  });

  it('truncates over-long free-text values (above 2500-char ceiling)', () => {
    // The 2500-char ceiling is calibrated for the longest legitimate
    // carrier in the pipeline (the /contact form's 2000-char message
    // field + headroom). Anything beyond that is bounded for log /
    // observability safety.
    const longText = 'a'.repeat(3000);
    const out = sanitize(longText) as string;
    expect(out.length).toBeLessThan(longText.length);
    expect(out).toContain('[truncated]');
  });

  it('preserves contact-form-length strings (2000 chars) intact', () => {
    const payload = 'a'.repeat(2000);
    const out = sanitize(payload);
    expect(out).toBe(payload);
  });

  it('leaves numbers, booleans, and null untouched', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(undefined)).toBe(undefined);
  });

  // Value-pattern regex pass (D67 + D148 extension). The
  // key-based denylist catches { email: "x@y.com" } but free-text
  // fields like a "message" body can carry PHI-shaped substrings
  // the key-based pass would miss. Every string leaf runs through
  // `scrubValuePatterns()` to redact those substrings.
  it('redacts email-shaped substrings inside free-text message fields', () => {
    // The "message" key is NOT in the key denylist by default; the
    // value-pattern pass is what catches the email here.
    const out = sanitize({ greeting: 'reach me at user@example.com tomorrow' }) as {
      greeting: string;
    };
    expect(out.greeting).not.toContain('user@example.com');
    expect(out.greeting).toMatch(/reach me at \[EMAIL\] tomorrow/);
  });

  it('redacts phone-shaped substrings inside free-text fields', () => {
    const out = sanitize({ body: 'call me at (555) 123-4567 please' }) as { body: string };
    expect(out.body).not.toContain('(555) 123-4567');
  });

  it('does NOT redact innocuous numerics that the value-pattern pass excludes', () => {
    const text = 'Order 1234567 shipped, ZIP 94103, version v1.2.3';
    const out = sanitize(text) as string;
    expect(out).toBe(text);
  });

  // Denylist expansion (D67 + D148). Persistent device identifiers
  // + clinical-instrument shorthand + biometric markers + claim IDs
  // are now in the key-based denylist per the FTC Cerebral order's
  // "Covered Information" scope + WA MHMDA's biometric clauses.
  it('redacts the expanded denylist (device_id, advertising_id, npi, phq2, biometric_identifier, claim_id)', () => {
    const out = sanitize({
      device_id: 'abc123',
      advertising_id: 'def456',
      npi: '1234567890',
      phq2: 4,
      biometric_identifier: 'fingerprint-template',
      claim_id: 'CLM-0001',
    }) as Record<string, unknown>;
    expect(out.device_id).toBe('[REDACTED]');
    expect(out.advertising_id).toBe('[REDACTED]');
    expect(out.npi).toBe('[REDACTED]');
    expect(out.phq2).toBe('[REDACTED]');
    expect(out.biometric_identifier).toBe('[REDACTED]');
    expect(out.claim_id).toBe('[REDACTED]');
  });

  it('caps recursion depth defensively', () => {
    // Build a 20-deep nested object — depth limit is 16.
    let leaf: unknown = { value: 'leaf' };
    for (let i = 0; i < 20; i++) {
      leaf = { nested: leaf };
    }
    const out = sanitize(leaf);
    // Drill in; at some level the value becomes [REDACTED] (depth cap).
    let depth = 0;
    let cur: unknown = out;
    while (depth < 20 && cur && typeof cur === 'object' && 'nested' in cur) {
      cur = (cur as { nested: unknown }).nested;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(17);
  });
});

describe('sanitizeAsync', () => {
  it('async-hashes UUID-shaped strings to a 96-bit dev-namespace prefix when no pepper is set', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = await sanitizeAsync(uuid);
    // 96-bit (24 hex char) prefix — NIST SP 800-107r1 collision floor
    // for log-scale volume. `dev:` namespace marks an unsalted hash.
    expect(out).toMatch(/^dev:[0-9a-f]{24}$/);
  });

  it('redacts PHI keys at any depth (parity with sync)', async () => {
    const out = await sanitizeAsync({ email: 'x@y.z', route: '/safe' });
    expect(out).toMatchObject({ email: '[REDACTED]', route: '/safe' });
  });

  it('value-pattern regex pass: free-text email is redacted on the async path', async () => {
    const out = await sanitizeAsync('Contact me at alice@example.com please');
    expect(out).toContain('[EMAIL]');
    expect(out).not.toContain('alice@example.com');
  });

  it('value-pattern regex pass: phone number is redacted on the async path', async () => {
    const out = await sanitizeAsync('Call (555) 123-4567 ASAP');
    expect(out).toContain('[PHONE]');
    expect(out).not.toContain('555');
  });

  it('value-pattern regex pass: SSN is redacted on the async path', async () => {
    const out = await sanitizeAsync('SSN: 123-45-6789 on file');
    expect(out).toContain('[SSN]');
    expect(out).not.toContain('123-45-6789');
  });

  it('value-pattern regex pass: Luhn-validated card number is redacted on the async path', async () => {
    const out = await sanitizeAsync('Charged 4111-1111-1111-1111 today');
    expect(out).toContain('[CARD]');
    expect(out).not.toContain('4111-1111-1111-1111');
  });
});

describe('sanitizeAsync HMAC pseudonymization', () => {
  // Tests parameterise over the QUILTY_PSEUDONYM_PEPPER env var; reset
  // the module-scope cache between cases so the next case re-reads.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetPepperCacheForTesting();
  });

  it('HMAC-namespaces the hash when QUILTY_PSEUDONYM_PEPPER is present', async () => {
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'test-pepper-do-not-use-in-prod');
    __resetPepperCacheForTesting();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = await sanitizeAsync(uuid);
    // hmac.<8-hex value-derived segment>:<24-hex hash>
    expect(out).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
  });

  it('two different peppers produce different hashes AND different segments (cross-env correlation + rotation distinguishability)', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'pepper-prod');
    __resetPepperCacheForTesting();
    const prodHash = await sanitizeAsync(uuid);

    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'pepper-dev');
    __resetPepperCacheForTesting();
    const devHash = await sanitizeAsync(uuid);

    expect(prodHash).not.toBe(devHash);
    expect(prodHash).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
    expect(devHash).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
    // The value-derived segment differs across pepper eras — the audit pipeline can
    // distinguish pre- vs post-rotation pseudonyms without re-hashing history.
    const seg = (h: string) => h.split(':')[0];
    expect(seg(prodHash)).not.toBe(seg(devHash));
  });

  it('same pepper + same input produces the same hash (deterministic for log-correlation)', async () => {
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'pepper-fixed');
    __resetPepperCacheForTesting();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const first = await sanitizeAsync(uuid);
    const second = await sanitizeAsync(uuid);
    expect(first).toBe(second);
  });

  it('empty pepper string falls back to dev namespace (treats empty as unset)', async () => {
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', '');
    __resetPepperCacheForTesting();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = await sanitizeAsync(uuid);
    expect(out).toMatch(/^dev:[0-9a-f]{24}$/);
  });

  it('T2-15: fetches the CURRENT pepper from the Parameters-and-Secrets extension, preferred over env', async () => {
    // Durable stages set QUILTY_PEPPER_VIA_EXTENSION=1; the Lambda runtime provides
    // AWS_SESSION_TOKEN; the extension serves the current pepper on localhost:2773.
    vi.stubEnv('QUILTY_PEPPER_VIA_EXTENSION', '1');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'env-pepper');
    const extFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ SecretString: 'extension-pepper' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', extFetch);
    __resetPepperCacheForTesting();

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const extHash = await sanitizeAsync(uuid);
    expect(extHash).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
    expect(extFetch).toHaveBeenCalledOnce();

    // Prove the extension value (not env) produced it: the env-pepper hash differs in
    // BOTH the value-derived segment and the body.
    vi.unstubAllGlobals();
    vi.stubEnv('QUILTY_PEPPER_VIA_EXTENSION', '');
    __resetPepperCacheForTesting();
    const envHash = await sanitizeAsync(uuid);
    expect(extHash).not.toBe(envHash);
    expect(extHash.split(':')[0]).not.toBe(envHash.split(':')[0]);
  });

  it('T2-15: the SAME pepper value yields the SAME pseudonym via the extension and via the env (no path-dependent fork)', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    // Path 1: extension serves value X (env holds something else — extension wins).
    vi.stubEnv('QUILTY_PEPPER_VIA_EXTENSION', '1');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'unused-env');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ SecretString: 'shared-value' }), { status: 200 }),
      ),
    );
    __resetPepperCacheForTesting();
    const viaExt = await sanitizeAsync(uuid);

    // Path 2: env holds the SAME value X, no extension.
    vi.unstubAllGlobals();
    vi.stubEnv('QUILTY_PEPPER_VIA_EXTENSION', '');
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'shared-value');
    __resetPepperCacheForTesting();
    const viaEnv = await sanitizeAsync(uuid);

    // Same underlying value => identical pseudonym (segment + body) on both paths.
    expect(viaExt).toBe(viaEnv);
  });

  it('T2-15: falls back to the env pepper AND emits an observable warning when the extension errors', async () => {
    vi.stubEnv('QUILTY_PEPPER_VIA_EXTENSION', '1');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'env-pepper');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('extension unavailable');
      }),
    );
    __resetPepperCacheForTesting();
    const out = await sanitizeAsync('550e8400-e29b-41d4-a716-446655440000');
    // Still HMAC (env safety net), NOT the weak dev: fallback.
    expect(out).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
    // And the fallback is OBSERVABLE (a warn fired, no token/secret) so a fleet-wide
    // extension outage is detectable rather than silent.
    expect(warn).toHaveBeenCalledOnce();
    const warnMsg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(warnMsg).not.toContain('test-session-token');
    expect(warnMsg).not.toContain('env-pepper');
    warn.mockRestore();
  });

  it('T2-15: does NOT call the extension unless the deploy attached it (QUILTY_PEPPER_VIA_EXTENSION unset)', async () => {
    // Even with a session token present, an unset gate => env-only, no localhost call.
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
    vi.stubEnv('QUILTY_PSEUDONYM_PEPPER', 'env-pepper');
    const extFetch = vi.fn();
    vi.stubGlobal('fetch', extFetch);
    __resetPepperCacheForTesting();
    const out = await sanitizeAsync('550e8400-e29b-41d4-a716-446655440000');
    expect(extFetch).not.toHaveBeenCalled();
    expect(out).toMatch(/^hmac\.[0-9a-f]{8}:[0-9a-f]{24}$/);
  });
});
