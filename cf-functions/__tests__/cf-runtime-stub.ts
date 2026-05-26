/**
 * Stub of the CloudFront Functions runtime API for Node-side unit
 * testing.
 *
 * CFFs run in AWS's QuickJS-based JS engine; we cannot exercise them
 * in CI without a real CloudFront distribution. This stub mirrors the
 * `event` shape documented in AWS's CFF event-structure reference so
 * unit tests can construct a viewer-request / viewer-response payload,
 * invoke the CFF, and assert the output.
 *
 * Only the surfaces the three current CFFs actually touch are mirrored:
 *
 *   - `event.request.uri`, `event.request.headers`, `event.request.cookies`
 *   - `event.response.headers`, `event.response.cookies`
 *
 * The CFFs are plain JS files; tests `require()` them via Node's CJS
 * surface (Vitest auto-resolves) since each file declares
 * `function handler(event) { ... }` at module scope and the test
 * loader pulls the function into the global.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type CfHeaderMap = Record<string, { value: string }>;

export type CfCookieMap = Record<string, { value: string; attributes?: string }>;

export interface CfRequest {
  method: string;
  uri: string;
  querystring?: Record<string, { value: string }>;
  headers: CfHeaderMap;
  cookies: CfCookieMap;
}

export interface CfResponse {
  statusCode: number;
  statusDescription?: string;
  headers: CfHeaderMap;
  cookies: CfCookieMap;
}

export interface CfViewerRequestEvent {
  version: '1.0';
  context: { distributionId: string; requestId: string; eventType: 'viewer-request' };
  viewer: { ip: string };
  request: CfRequest;
}

export interface CfViewerResponseEvent {
  version: '1.0';
  context: { distributionId: string; requestId: string; eventType: 'viewer-response' };
  viewer: { ip: string };
  request: CfRequest;
  response: CfResponse;
}

export type CfEvent = CfViewerRequestEvent | CfViewerResponseEvent;

/**
 * Load a CFF source file + eval its `handler(event)` function into the
 * current scope. Vitest evaluates this in the test process; the eval is
 * safe because the only inputs are committed source files under
 * `cf-functions/`.
 */
export function loadCfHandler(filename: string): (event: CfEvent) => unknown {
  const source = readFileSync(join(__dirname, '..', filename), 'utf8');
  // `handler` is the canonical CFF entry-point name. Wrap the source
  // in an IIFE that returns the function so we get a bound reference
  // rather than relying on global scope leakage.
  const factory = new Function(`${source}; return handler;`) as () => (event: CfEvent) => unknown;
  return factory();
}

export function makeViewerRequest(overrides: Partial<CfRequest> = {}): CfViewerRequestEvent {
  return {
    version: '1.0',
    context: {
      distributionId: 'TEST_DISTRIBUTION_ID',
      requestId: 'test-request-id',
      eventType: 'viewer-request',
    },
    viewer: { ip: '203.0.113.42' },
    request: {
      method: 'GET',
      uri: '/',
      querystring: {},
      headers: {},
      cookies: {},
      ...overrides,
    },
  };
}

export function makeViewerResponse(
  requestOverrides: Partial<CfRequest> = {},
  responseOverrides: Partial<CfResponse> = {},
): CfViewerResponseEvent {
  return {
    version: '1.0',
    context: {
      distributionId: 'TEST_DISTRIBUTION_ID',
      requestId: 'test-request-id',
      eventType: 'viewer-response',
    },
    viewer: { ip: '203.0.113.42' },
    request: {
      method: 'GET',
      uri: '/',
      querystring: {},
      headers: {},
      cookies: {},
      ...requestOverrides,
    },
    response: {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {},
      cookies: {},
      ...responseOverrides,
    },
  };
}
