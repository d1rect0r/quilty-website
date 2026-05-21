/**
 * Browser-side Logger adapter — silent-in-production, console-only
 * in development.
 *
 * The CloudWatch adapter is Lambda-runtime-only: its `console.log`
 * goes to the CloudWatch transport in Lambda but to the user's
 * DevTools console in the browser. Any sanitized log record written
 * to the browser console is visible to the user, to any installed
 * extension, and to any injected analytics scripts — a low-friction
 * D31/D42d leak vector. The composition root's client container
 * wires THIS adapter instead so logger calls from React Server
 * Components rendered on the client or from client-side hooks no-op
 * silently in production.
 *
 * Development mode keeps console output as a developer-experience
 * affordance; the sanitizer is still composed by the wrapper layer.
 */

import type { LogFields, LogLevel, Logger } from '../ports.js';

function emitDev(level: LogLevel, msg: string, fields: LogFields): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      msg,
      ...fields,
    }),
  );
}

export function makeBrowserLogger(): Logger {
  const isProd = process.env['NODE_ENV'] === 'production';
  return {
    debug(msg: string, fields: LogFields = {}): void {
      if (isProd) return;
      emitDev('debug', msg, fields);
    },
    info(msg: string, fields: LogFields = {}): void {
      if (isProd) return;
      emitDev('info', msg, fields);
    },
    warn(msg: string, fields: LogFields = {}): void {
      if (isProd) return;
      emitDev('warn', msg, fields);
    },
    error(msg: string, fields: LogFields = {}): void {
      if (isProd) return;
      emitDev('error', msg, fields);
    },
  };
}
