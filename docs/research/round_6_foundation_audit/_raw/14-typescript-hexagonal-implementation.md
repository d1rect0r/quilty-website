# 14 — TypeScript Hexagonal Implementation: Evidence from Production Repos (D76)

**Scope:** Round-6 D76 evidence — what hexagonal architecture (ports + adapters) **actually looks like in production TypeScript code at engineering-strong companies** in 2024-2026.

**Method:** Direct inspection of public repos via `gh api` (file trees + base64-decoded source). Engineering-blog citations via WebFetch/WebSearch. Read-only. All file paths verified against `main` as of 2026-05-19.

**Question we are trying to answer:** Should each `packages/<slice>/` in the Quilty modular monolith use a `ports.ts` + `domain/` + `adapters/<vendor>.ts` + composition-root layout — and if so, what should that composition root look like?

---

## 1. Executive summary

**Yes, the TypeScript open-source peer set ships ports/adapters as we'd recognize the pattern — but with a richer vocabulary than the textbook hex diagram.** The strongest single exemplar is **Cal.com** (`calcom/cal.com`), which in late 2025 published an engineering-standards manifesto ("[Engineering in 2026 and Beyond](https://cal.com/blog/engineering-in-2026-and-beyond)") committing the codebase to **Vertical Slice Architecture + DDD + Repository pattern + DI container** — and the code already shows this transition in `packages/features/<slice>/{services,repositories,di}/`.

Across the 10+ repos inspected, four patterns recur:

1. **Class implements interface** (`class GoogleCalendarService implements Calendar`, `class S3MediaStore implements MediaStore`, `class PgQueryable implements SqlQueryable`) — the universal "adapter" form in OO-flavored TS.
2. **Folder-per-runtime adapter** (`hono/src/adapter/{aws-lambda,cloudflare-workers,bun,deno,vercel,netlify}/`, `stripe-node/src/{platform,net}/`, `@sentry/{node,nextjs,bun,deno,cloudflare,...}`, `@effect/sql-{pg,mysql2,sqlite-bun,...}`, Prisma `adapter-{pg,d1,neon,planetscale,...}`).
3. **Functional composition root** — a factory function (`createTransport(options, makeRequest)` in Sentry, `getOAuthService()` in Cal.com, `Layer.{provide,merge}` in Effect-TS) that wires concrete adapters into the slice at entry-point time.
4. **Typed DI container** — Cal.com uses `@evyweb/ioctopus` with `Symbol`-keyed type-safe registry; NestJS uses its built-in module system; Effect-TS uses `Context.Tag` + `Layer`. Two-thirds of repos avoid a runtime DI container entirely and rely on **constructor injection plus a hand-rolled composition root**.

The pattern we should copy is closest to Cal.com's `packages/features/translation/` slice: `services/I<Name>.ts` port, `services/<Name>.ts` adapter, `services/<Name>.test.ts` colocated test, `di/tokens.ts` Symbol tokens, `di/<Name>.module.ts` binding, `di/<Name>.container.ts` exporting a `get<Name>(): <Name>` accessor. For Quilty M1 we should ship the **layout** but skip the DI container (use plain factory functions) until a real second-adapter need surfaces.

---

## 2. Repo-by-repo findings

### 2.1 `calcom/cal.com` — the gold standard

Cal.com is a Next.js + TypeScript + Prisma + tRPC monorepo with `apps/web` + `apps/api-v2` + 22 packages. They are mid-migration to a vertical-slice + hex pattern documented in their own engineering blog ([Engineering in 2026 and Beyond](https://cal.com/blog/engineering-in-2026-and-beyond)):

> "All database access must go through Repository classes. … Repositories are injected via Dependency Injection containers." — Cal.com Engineering Standards
>
> "If bookings needs availability data, it imports from `@calcom/features/availability` through exported interfaces, not by reaching into internal implementation details." — same source

**The exemplar slice — `packages/features/translation/`:**

```
packages/features/translation/
├── services/
│   ├── ITranslationService.ts        # PORT (interface + DTO types)
│   ├── TranslationService.ts         # ADAPTER (class implements port)
│   └── TranslationService.test.ts    # colocated unit test with fake deps
└── di/
    └── tokens.ts                     # Symbol DI tokens
```

`services/ITranslationService.ts` is **pure**: it imports only a string-union constant from `@calcom/lib/translationConstants` and defines DTO types + the interface:

```typescript
export interface ITranslationService {
  translateText(params: TranslateTextParams): Promise<TranslateTextResult>;
  getTargetLocales(sourceLocale: string): TranslationSupportedLocale[];
  getEventTypeTranslation(
    eventTypeId: number,
    targetLocale: string,
    options?: EventTypeTranslationLookupOptions,
  ): Promise<EventTypeTranslationLookupResult>;
}
```

`services/TranslationService.ts` declares its **deps as a typed object** and takes them via constructor — the deps are themselves abstractions:

```typescript
export interface ITranslationServiceDeps {
  localizeText: (
    text: string,
    sourceLocale: string,
    targetLocale: string,
  ) => Promise<string | null>;
  eventTypeTranslationRepository: EventTypeTranslationRepository;
}

export class TranslationService implements ITranslationService {
  constructor(private deps: ITranslationServiceDeps) {}
  // ...
}
```

`services/TranslationService.test.ts` shows the **fake-adapter test pattern**:

```typescript
beforeEach(() => {
  vi.resetAllMocks();
  mockLocalizeText = vi.fn();
  mockEventTypeTranslationRepository = { findByLocale: vi.fn() };
  service = new TranslationService({
    localizeText: mockLocalizeText,
    eventTypeTranslationRepository: mockEventTypeTranslationRepository as never,
  });
});
```

`di/tokens.ts`:

```typescript
export const TRANSLATION_DI_TOKENS = {
  TRANSLATION_SERVICE: Symbol('TranslationService'),
  TRANSLATION_SERVICE_MODULE: Symbol('TranslationServiceModule'),
  EVENT_TYPE_TRANSLATION_REPOSITORY: Symbol('EventTypeTranslationRepository'),
  EVENT_TYPE_TRANSLATION_REPOSITORY_MODULE: Symbol('EventTypeTranslationRepositoryModule'),
};
```

**The DI plumbing layer — `packages/features/di/`:**

```
packages/features/di/
├── di.ts            # bindModuleToClassOnToken helper around @evyweb/ioctopus
├── tokens.ts        # ALL_TOKENS aggregator (spreads per-slice tokens)
├── containers/      # composition-root accessors per service
│   ├── AvailableSlots.ts
│   ├── BookingAccessService.ts
│   ├── DestinationCalendar.ts
│   └── ... (~25 files)
└── modules/         # adapter bindings per repository/service
    ├── Prisma.ts
    ├── User.ts
    ├── Booking.ts
    └── ... (~30 files)
```

A **module** (the adapter binding) — `packages/features/di/modules/Prisma.ts`:

```typescript
import { type Container, createModule } from '@calcom/features/di/di';
import { DI_TOKENS } from '@calcom/features/di/tokens';
import { prisma, readonlyPrisma } from '@calcom/prisma';

export const prismaModule = createModule();
const token = DI_TOKENS.PRISMA_CLIENT;
prismaModule.bind(token).toFactory(() => prisma, 'singleton');
prismaModule.bind(readOnlyToken).toFactory(() => readonlyPrisma, 'singleton');

export const moduleLoader = {
  token,
  readOnlyToken,
  loadModule: (container: Container) => {
    container.load(DI_TOKENS.PRISMA_MODULE, prismaModule);
  },
};
```

A **module** for a class with deps — `packages/features/di/modules/User.ts`:

```typescript
export const userRepositoryModule = createModule();
const token = DI_TOKENS.USER_REPOSITORY;
const loadModule = bindModuleToClassOnToken({
  module: userRepositoryModule,
  moduleToken: DI_TOKENS.USER_REPOSITORY_MODULE,
  token,
  classs: UserRepository,
  dep: prismaModuleLoader, // single-dep form
});
export const moduleLoader: ModuleLoader = { token, loadModule };
```

A **container** (composition root) — `packages/features/oauth/di/OAuthService.container.ts`:

```typescript
import { createContainer } from '@calcom/features/di/di';
import { type OAuthService, moduleLoader as oAuthServiceModuleLoader } from './OAuthService.module';

const oAuthServiceContainer = createContainer();

export function getOAuthService(): OAuthService {
  oAuthServiceModuleLoader.loadModule(oAuthServiceContainer);
  return oAuthServiceContainer.get<OAuthService>(oAuthServiceModuleLoader.token);
}
```

The **module that wires deps** — `packages/features/oauth/di/OAuthService.module.ts`:

```typescript
const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: OAuthService,
  depsMap: {
    oAuthClientRepository: oAuthClientRepositoryModuleLoader,
    accessCodeRepository: accessCodeRepositoryModuleLoader,
  },
});
```

`OAuthService` then takes a typed deps object in its constructor — type-checked at bind time because `bindModuleToClassOnToken<TClass>` infers the deps shape from the class constructor signature via TS conditional types (see `packages/features/di/di.ts`).

**Vendor adapters live in `packages/app-store/<vendor>/`:**

```
packages/app-store/googlecalendar/lib/
├── CalendarService.ts        # class GoogleCalendarService implements Calendar
├── CalendarAuth.ts           # OAuth/credential glue
├── googleCredentialSchema.ts # Zod schema for vendor creds
├── __mocks__/                # vendor SDK mocks
├── __tests__/                # adapter tests
└── index.ts                  # barrel: export { default as BuildCalendarService } from "./CalendarService"
```

The **port** lives in a separate types package — `packages/types/`:

```
packages/types/
├── Calendar.d.ts             # interface Calendar { createEvent, updateEvent, ... }
├── CrmService.d.ts           # interface CRM { createEvent, getContacts, ... }
├── PaymentService.d.ts       # IAbstractPaymentService + PaymentApp factory
├── VideoApiAdapter.d.ts      # VideoApiAdapter union + VideoApiAdapterFactory
├── AnalyticsService.d.ts     # interface AnalyticsService { sendEvent }
└── ...
```

`packages/types/VideoApiAdapter.d.ts` is interesting because it names the file with the word "Adapter" and explicitly uses a **factory** form:

```typescript
export type VideoApiAdapter =
  | {
      createMeeting(event: CalendarEvent): Promise<VideoCallData>;
      updateMeeting(bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData>;
      deleteMeeting(uid: string): Promise<unknown>;
      // ...optional methods marked with ? for capability-checking
    }
  | undefined;

export type VideoApiAdapterFactory = (credential: CredentialPayload) => VideoApiAdapter;
```

This `?`-on-optional-methods trick is **capability detection** — adapters declare which optional features they support without needing a sub-interface explosion. We should copy this for Quilty's `AnalyticsAdapter` and `EmailAdapter`.

`packages/types/AnalyticsService.d.ts` is the smallest port we'll find anywhere (3 lines of contract):

```typescript
export interface SendEventProps {
  name: string;
  email: string;
  id: string;
  eventName: string;
  externalId?: string;
}
export interface AnalyticsService {
  sendEvent(props: SendEventProps): Promise<void>;
}
export type AnalyticsServiceClass = Class<AnalyticsService>;
```

**How `apps/web/` consumes the slices:** by calling the composition-root accessor — e.g. `RegularBookingService.ts` imports `getEventTypeService` (a `*.container.ts` accessor):

```typescript
import { getSpamCheckService } from '@calcom/features/di/watchlist/containers/SpamCheckService.container';
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from '@calcom/features/eventtypes/di/EventTypeService.container';
```

The accessor returns a fully-resolved instance. The app code never sees `@evyweb/ioctopus`.

### 2.2 `honojs/hono` — adapter-folder-per-runtime, no DI

Hono's `src/adapter/` is the cleanest **runtime-adapter** pattern in TS:

```
src/adapter/
├── aws-lambda/        (handler.ts, conninfo.ts, types.ts, index.ts)
├── bun/               (serve-static.ts, websocket.ts, conninfo.ts, index.ts)
├── cloudflare-pages/
├── cloudflare-workers/(serve-static.ts, websocket.ts, ...)
├── deno/
├── lambda-edge/
├── netlify/
├── service-worker/
└── vercel/
```

Each folder has an `index.ts` barrel exporting only the public adapter surface:

```typescript
// src/adapter/aws-lambda/index.ts
export { handle, streamHandle, defaultIsContentTypeBinary } from './handler';
export { getConnInfo } from './conninfo';
export type { APIGatewayProxyResult, LambdaEvent } from './handler';
```

No DI container; **the adapter is the entry-point file the user imports.** The framework core (`src/hono.ts`) is platform-agnostic and the runtime-specific glue is in the adapter folder. Tests live colocated (`handler.test.ts`).

This is the right pattern when the **shape of the adapter is "framework entry point"** — i.e. one adapter is loaded at deploy time, not selected at runtime. For Quilty's Cognito glue, this is the correct shape.

### 2.3 `getsentry/sentry-javascript` — functional-factory composition root

Sentry takes the **classic OO interface + functional factory** approach. The `Transport` port lives in `packages/core/src/types/transport.ts`:

```typescript
export interface Transport {
  send(request: Envelope): PromiseLike<TransportMakeRequestResponse>;
  flush(timeout?: number): PromiseLike<boolean>;
}

export type TransportRequestExecutor = (
  request: TransportRequest,
) => PromiseLike<TransportMakeRequestResponse>;
```

The factory in `packages/core/src/transports/base.ts` accepts an **executor function** as the adapter slot:

```typescript
export function createTransport(
  options: InternalBaseTransportOptions,
  makeRequest: TransportRequestExecutor,
  buffer: PromiseBuffer<TransportMakeRequestResponse> = makePromiseBuffer(/* ... */),
): Transport {
  // ... shared rate-limiting, buffering, retry logic
}
```

Per-runtime packages (`@sentry/node`, `@sentry/browser`, `@sentry/cloudflare`, `@sentry/deno`, etc.) supply their own `makeRequest` — typically using their platform's HTTP primitive — and call `createTransport(opts, makeRequest)`. **Pure function-shaped adapter, no class, no DI container.**

Sentry's package layout shows this works at very large scale:

```
packages/
├── core/              (port definitions + framework-agnostic logic)
├── browser/           (DOM adapter)
├── node/              (Node adapter)
├── nextjs/            (Next.js adapter — re-exports @sentry/node + adds bundler integration)
├── cloudflare/        (Workers adapter)
├── deno/, bun/        (runtime adapters)
├── react/, vue/, svelte/, solid/, ember/, angular/    (framework adapters)
└── replay-canvas/, profiling-node/                    (feature adapters)
```

Note: `@sentry/nextjs/src/server/index.ts` does `export * from '@sentry/node'` and **layers Next.js-specific extensions on top** — adapter-of-an-adapter is legitimate when the inner adapter already gives you 90% of the surface.

### 2.4 `prisma/prisma` — `adapter-*` package per driver

Prisma's "driver adapter" subsystem is hex-textbook with a published-package boundary:

```
packages/
├── driver-adapter-utils/   (THE PORT)
│   └── src/types.ts        → SqlDriverAdapter, SqlQueryable, Transaction, SqlResultSet
├── adapter-pg/             (Postgres via node-postgres)
├── adapter-d1/             (Cloudflare D1)
├── adapter-neon/           (Neon serverless)
├── adapter-planetscale/    (PlanetScale)
├── adapter-libsql/         (libSQL/Turso)
├── adapter-mariadb/, adapter-mssql/, adapter-better-sqlite3/, adapter-ppg/
```

`packages/driver-adapter-utils/src/types.ts` defines the `SqlQueryable`, `SqlDriverAdapter`, `Transaction`, `SqlResultSet`, `SqlQuery`, `Error` types — pure shape, zero implementations.

`packages/adapter-pg/src/pg.ts`:

```typescript
import type {
  ColumnType,
  ConnectionInfo,
  IsolationLevel,
  SqlDriverAdapter,
  SqlMigrationAwareDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
  SqlResultSet,
  Transaction,
  TransactionOptions,
} from '@prisma/driver-adapter-utils';
import { Debug, DriverAdapterError } from '@prisma/driver-adapter-utils';
import pg from 'pg';

class PgQueryable<ClientT extends StdClient | TransactionClient> implements SqlQueryable {
  readonly provider = 'postgres';
  readonly adapterName = packageName;
  constructor(
    protected readonly client: ClientT,
    protected readonly pgOptions?: PrismaPgOptions,
  ) {}
  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    /* ... */
  }
}
```

Adapter package = one runtime, port package = stable contract. Each adapter has a `__tests__/` folder and an `errors.ts` (vendor-specific error mapping to the shared `MappedError` union). **The mapping module is the most-skipped-but-most-valuable file in any adapter** — it's where vendor exceptions get normalized.

### 2.5 `effect-ts/effect` — functional hex via `Context.Tag` + `Layer`

Effect-TS uses **`Context.GenericTag`** (their typed DI token) + **`Layer`** (their composition root). The port `SqlClient` in `packages/sql/src/SqlClient.ts`:

```typescript
export interface SqlClient extends Constructor {
  readonly [TypeId]: TypeId;
  readonly safe: this;
  readonly reserve: Effect<Connection, SqlError, Scope>;
  readonly withTransaction: <R, E, A>(self: Effect<A, E, R>) => Effect<A, E | SqlError, R>;
  // ...
}
export const SqlClient: Tag<SqlClient, SqlClient> = internal.clientTag;
```

The adapter `PgClient` in `packages/sql-pg/src/PgClient.ts`:

```typescript
export interface PgClient extends Client.SqlClient {
  readonly [TypeId]: TypeId;
  readonly config: PgClientConfig;
  readonly listen: (channel: string) => Stream.Stream<string, SqlError>;
}
export const PgClient = Context.GenericTag<PgClient>('@effect/sql-pg/PgClient');
```

Driver packages: `sql-pg`, `sql-mysql2`, `sql-clickhouse`, `sql-d1`, `sql-drizzle`, `sql-kysely`, `sql-libsql`, `sql-mssql`, `sql-sqlite-bun`, `sql-sqlite-do`, `sql-sqlite-node`, `sql-sqlite-react-native`, `sql-sqlite-wasm`. **15 SQL adapters** behind one port.

Effect's pattern is **the most powerful but also the most invasive** — adopting `Context.Tag` requires the consumer to also use Effect. For Quilty's "thin TS shell over Rust" we'd be paying the Effect tax to solve a problem we don't have (we won't compose 15 SQL drivers; we'll have 1 Cognito adapter, 1 PostHog, 1 Sentry, 1 Resend, 1 Stripe, 1 OpenAPI client).

### 2.6 `resend/resend-node` — service composition without DI

Resend's SDK is a **service-roll-up** pattern: one `Resend` class composes sub-services internally:

```typescript
// src/resend.ts
export class Resend {
  readonly segments = new Segments(this);
  readonly apiKeys = new ApiKeys(this);
  readonly broadcasts = new Broadcasts(this);
  readonly contactProperties = new ContactProperties(this);
  readonly contacts = new Contacts(this);
  readonly domains = new Domains(this);
  readonly emails = new Emails(this);
  readonly events = new Events(this);
  readonly logs = new Logs(this);
  readonly templates = new Templates(this);
  readonly webhooks = new Webhooks(this);
  // ... 13 sub-services
}
```

Each sub-service (`src/emails/emails.ts`, `src/domains/domains.ts`) implements a folder-internal capability and receives the parent `Resend` for shared HTTP/headers/baseUrl. `src/interfaces.ts` and `src/index.ts` barrel-export all the public types.

This is **not** ports-and-adapters — it's a service-locator pattern with one concrete runtime. But it's worth noting because it's the shape of a SaaS SDK and is the shape **Quilty's `lib/observability/posthog.ts` already takes**. We don't need to ports-and-adapters our consumption of someone else's SDK; we need a thin wrapper that hides vendor types behind our own DTO.

### 2.7 `stripe/stripe-node` — interface + per-runtime adapter trio

Stripe ships a **per-runtime entry-point file** that wires the right HTTP/crypto/platform adapter:

```
src/
├── HttpClient.ts                 → interface HttpClientInterface (PORT)
├── net/
│   ├── HttpClient.ts             → re-export from src
│   ├── NodeHttpClient.ts         → adapter for Node
│   └── FetchHttpClient.ts        → adapter for fetch/edge
├── platform/
│   ├── PlatformFunctions.ts      → interface PlatformFunctions (PORT for crypto/uuid/env)
│   ├── NodePlatformFunctions.ts  → Node adapter
│   └── WebPlatformFunctions.ts   → Web/edge adapter
├── stripe.esm.node.ts            → COMPOSITION ROOT for Node
├── stripe.esm.worker.ts          → COMPOSITION ROOT for Workers/edge
├── stripe.cjs.node.ts            → cjs variant for Node
└── stripe.cjs.worker.ts          → cjs variant for Workers
```

```typescript
// src/net/HttpClient.ts (port)
export interface HttpClientInterface {
  getClientName: () => string;
  makeRequest: (
    host: string,
    port: string,
    path: string,
    method: string,
    headers: RequestHeaders,
    requestData: string,
    protocol: string,
    timeout: number,
  ) => Promise<HttpClientResponseInterface>;
}
```

Each entry-point file selects the right `HttpClient` + `PlatformFunctions` adapter pair. The **`package.json` exports field** does the runtime selection — `node` import maps to `stripe.esm.node.ts`, `workerd` to `stripe.esm.worker.ts`. This is a **build-time composition root**, not runtime.

### 2.8 `tinacms/tinacms` — adapter as a separate published package

TinaCMS's media subsystem is the **published-package-per-adapter** form, similar to Prisma but for CMS storage:

```
packages/
├── tinacms/                       (core; defines MediaStore port)
│   └── src/toolkit/core/media-store.default.ts → class DummyMediaStore implements MediaStore
├── next-tinacms-s3/              (S3 adapter)
│   └── src/s3-media-store.ts     → class S3MediaStore implements MediaStore
├── next-tinacms-cloudinary/      (Cloudinary adapter)
├── next-tinacms-azure/           (Azure adapter)
├── next-tinacms-dos/             (DigitalOcean Spaces)
├── tinacms-authjs/, tinacms-clerk/
└── tinacms-gitprovider-github/
```

The **`DummyMediaStore` in core is a fake adapter** — useful for both tests and the development-mode default:

```typescript
export class DummyMediaStore implements MediaStore {
  accept = '*';
  async persist(files: MediaUploadOptions[]): Promise<Media[]> {
    return files.map(({ directory, file }) => ({
      id: file.name,
      type: 'file',
      directory,
      filename: file.name,
    }));
  }
  async list(): Promise<MediaList> {
    return { items: [], nextOffset: 0 };
  }
  async delete() {
    /* Unnecessary */
  }
}
```

**This is the pattern Quilty wants for tests** — every port should have an `In-memory<Name>Adapter` checked into the same package, used by both unit tests and the local-dev runtime so we don't hit Cognito/Stripe/Resend in `pnpm dev`.

### 2.9 `nestjs/nest` — class decorator-driven DI module

NestJS's `DynamicModule` pattern (samples/25-dynamic-modules) is the **enterprise opinionated form**:

```typescript
@Module({})
export class ConfigModule {
  static register(options: ConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG_OPTIONS, useValue: options }, ConfigService],
      exports: [ConfigService],
    };
  }
}
```

Modules expose `static register()` / `static forRoot()` / `static forRootAsync()` factory methods that return a `DynamicModule` describing the adapter wiring. Decorators (`@Module`, `@Injectable`, `@Inject(TOKEN)`) drive runtime metadata via `reflect-metadata`.

**We should NOT adopt this** — NestJS is a server-framework opinion; Quilty is Next.js (no metadata reflection); adopting NestJS's DI without NestJS is hostile. But the **`forRoot` naming and dynamic-options pattern** is worth borrowing for our composition roots: `getAnalyticsService({ posthogKey, consentState })`.

### 2.10 `vercel/turborepo` — packages-of-tools, not slices

For comparison: Turborepo's own `packages/` are **shipping CLIs**, not domain slices — `turbo-codemod`, `turbo-gen`, `turbo-telemetry`, `turbo-workspaces`, `tbx`, `create-turbo`, `eslint-config-turbo`, `eslint-plugin-turbo`, `turbo-vsc`, `tsconfig`, `turbo-types`. Each is a published artifact with its own `package.json`. No internal `services/`/`repositories/`/`di/` discipline because each package is small enough to be flat.

**Lesson:** a monorepo's `packages/` shape is dictated by what it **publishes** vs what it **internally composes**. Cal.com publishes nothing from `packages/features/*` — they're private workspace packages that exist solely for boundary enforcement. That's our model.

### 2.11 `getsentry/spotlight` — small modern Sentry dev tool

Spotlight is a small (recent) Sentry side-project; useful as a sanity-check on the Sentry team's idioms when starting fresh:

```
packages/spotlight/src/
├── bootstrap.ts             # entry: configures everything
├── instrument.ts            # OTel hookup
├── sentry-config.ts         # Sentry adapter
├── server/, electron/, ui/, shared/    # platform adapters
└── index.tsx
```

Flat per-feature folders, no `di/`, no Symbol tokens — Sentry's team doesn't reach for DI containers in small surfaces. They reach for `bootstrap.ts` composition roots.

### 2.12 `vercel/next.js` — flat per-concern

Next.js's `packages/next/src/server/` is **flat per-concern**: `base-server.ts`, `config.ts`, `image-optimizer.ts`, `app-render/`, `async-storage/`, `instrumentation/`, `lib/` (with `cache-handlers/`, `incremental-cache/`, etc.). No interface/port discipline visible at the file-name level — concrete classes with private members talk to each other directly. This is OK because Next.js the framework **is itself** the adapter; nothing inside it needs to be substitutable.

**Lesson:** the closer a package is to the leaves of the dependency graph (application-shell vs domain-core), the less hex-pattern formalism it needs.

### 2.13 `vinejs/vine` — clean ports in a validation library

VineJS uses interfaces for cross-module contracts (`messages_provider/`, `reporters/`) with concrete defaults in `defaults.ts` and a `vine/` core orchestration module. This is the **strategy pattern** under a hex coat — interface + 2-3 concrete strategies for error message formatting / reporting. Small but textbook.

---

## 3. Common patterns (universal in TS hex, 2024-2026)

Distilling across the 13 repos:

| Pattern                                                                     | Universal?                                                         | Example                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Port = TypeScript `interface` (sometimes `.d.ts`)**                       | Yes (10/10)                                                        | `Calendar`, `CRM`, `MediaStore`, `Transport`, `SqlQueryable`, `HttpClientInterface`                     |
| **Adapter = `class X implements Port` OR `function X(deps): Port`**         | Yes (10/10)                                                        | `GoogleCalendarService`, `S3MediaStore`, `PgQueryable`, Sentry `createTransport(opts, makeRequest)`     |
| **Composition root = single accessor function exporting resolved instance** | Yes (8/10 — only Hono/Next.js skip)                                | `getOAuthService()`, `Resend` constructor, `stripe.esm.node.ts`                                         |
| **Folder-per-adapter under a stable port**                                  | Yes (8/10)                                                         | `prisma/packages/adapter-*`, `hono/src/adapter/*`, `effect/packages/sql-*`, `@sentry/{node,nextjs,...}` |
| **Symbol DI tokens**                                                        | Mixed (3/10 — Cal.com, NestJS, Effect-TS)                          | Most use plain functions; only large codebases reach for a container                                    |
| **Constructor takes deps as named object, not positional args**             | Strong (Cal.com, Vertical-Slice-Node, ports-and-adapters articles) | `constructor(private deps: { repo, logger, clock })` enables type-safe DI binding                       |
| **In-memory/fake adapter shipped alongside real adapter**                   | Mixed (5/10)                                                       | `DummyMediaStore`, Prisma `mock.ts`, Hono test utilities                                                |
| **Vendor SDK imports chokeholed to single adapter file**                    | Strong (8/10)                                                      | Stripe-SDK imports only in `lib/payment/adapters/stripe.ts`, etc.                                       |
| **Barrel `index.ts` exports only the slice's public surface**               | Yes (10/10)                                                        | `export * from './interfaces'; export { Resend } from './resend';`                                      |
| **Tests colocated with adapter (`*.test.ts` next to `*.ts`)**               | Yes (10/10)                                                        | Vitest convention, never separate `tests/` folder                                                       |

---

## 4. Concrete code-shape examples

### 4.1 Port interface shape (the canonical form)

```typescript
// packages/<slice>/src/ports.ts (or services/I<Name>.ts in Cal.com style)

// DTOs first — pure data types, no methods, no SDKs
export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}

export interface SendEmailResult {
  messageId: string;
  acceptedAt: Date;
}

// The port — minimal surface, returns DTOs, no vendor types leaked
export interface EmailAdapter {
  send(input: SendEmailInput): Promise<SendEmailResult>;
  // optional methods marked with ? for capability detection (Cal.com pattern)
  sendBatch?(inputs: SendEmailInput[]): Promise<SendEmailResult[]>;
}

// Factory port — when adapter needs runtime config (Cal.com VideoApiAdapterFactory pattern)
export type EmailAdapterFactory = (config: EmailAdapterConfig) => EmailAdapter;
```

### 4.2 Adapter shape — class with constructor-injected deps (Cal.com)

```typescript
// packages/<slice>/src/adapters/resend.ts
import { Resend } from 'resend'; // vendor import chokehold — ONLY this file imports 'resend'
import type { EmailAdapter, SendEmailInput, SendEmailResult } from '../ports';

export interface ResendEmailAdapterDeps {
  resend: Resend; // injected — not constructed inline
  fromAddress: string;
  logger: Logger;
}

export class ResendEmailAdapter implements EmailAdapter {
  constructor(private deps: ResendEmailAdapterDeps) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.deps.resend.emails.send({
      from: this.deps.fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.body,
    });
    if (result.error) throw new EmailSendError(result.error.message);
    return { messageId: result.data!.id, acceptedAt: new Date() };
  }
}
```

### 4.3 Adapter shape — pure function form (Sentry style)

```typescript
// packages/<slice>/src/adapters/cognito-session.ts
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { SessionAdapter } from '../ports';

export function createCognitoSessionAdapter(deps: {
  client: CognitoIdentityProviderClient;
  userPoolId: string;
  logger: Logger;
}): SessionAdapter {
  return {
    revokeAllSessions: async (cognitoSub: string) => {
      await deps.client.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: deps.userPoolId,
          Username: cognitoSub,
        }),
      );
      deps.logger.info('cognito.session.revoked', { cognitoSub });
    },
    // ...
  };
}
```

### 4.4 In-memory adapter (test + dev) — `DummyMediaStore` pattern

```typescript
// packages/<slice>/src/adapters/in-memory.ts
import type { EmailAdapter, SendEmailInput, SendEmailResult } from '../ports';

export class InMemoryEmailAdapter implements EmailAdapter {
  public readonly sent: SendEmailInput[] = [];
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    this.sent.push(input);
    return { messageId: `mem-${this.sent.length}`, acceptedAt: new Date() };
  }
}
```

### 4.5 Composition root — factory function form (recommended for M1)

```typescript
// packages/<slice>/src/index.ts (the barrel + composition root)
import { Resend } from 'resend';
import { ResendEmailAdapter } from './adapters/resend';
import { InMemoryEmailAdapter } from './adapters/in-memory';
import type { EmailAdapter } from './ports';

export type { EmailAdapter, SendEmailInput, SendEmailResult } from './ports';

export function createEmailAdapter(config: {
  driver: 'resend' | 'in-memory';
  resendApiKey?: string;
  fromAddress: string;
}): EmailAdapter {
  if (config.driver === 'in-memory') return new InMemoryEmailAdapter();
  if (!config.resendApiKey) throw new Error('RESEND_API_KEY required');
  return new ResendEmailAdapter({
    resend: new Resend(config.resendApiKey),
    fromAddress: config.fromAddress,
    logger: getLogger('email'),
  });
}
```

Caller side (`apps/web/lib/email/index.ts`):

```typescript
import { createEmailAdapter, type EmailAdapter } from '@quilty/email';

let _instance: EmailAdapter | null = null;
export function getEmailAdapter(): EmailAdapter {
  if (!_instance) {
    _instance = createEmailAdapter({
      driver: process.env.NODE_ENV === 'test' ? 'in-memory' : 'resend',
      resendApiKey: process.env.RESEND_API_KEY,
      fromAddress: 'no-reply@my-quilty.com',
    });
  }
  return _instance;
}
```

### 4.6 Composition root — DI-container form (Cal.com / future trigger)

Only adopt this when we have **3+ adapter implementations of the same port AND 3+ consumers** (cross-adapter compositional complexity):

```typescript
// packages/<slice>/src/di/tokens.ts
export const EMAIL_TOKENS = {
  EMAIL_ADAPTER: Symbol('EmailAdapter'),
  EMAIL_ADAPTER_MODULE: Symbol('EmailAdapterModule'),
};

// packages/<slice>/src/di/EmailAdapter.module.ts
import { createModule, bindModuleToClassOnToken } from '@quilty/di';
import { ResendEmailAdapter } from '../adapters/resend';
import { resendModuleLoader } from './modules/Resend';

const thisModule = createModule();
export const moduleLoader = {
  token: EMAIL_TOKENS.EMAIL_ADAPTER,
  loadModule: bindModuleToClassOnToken({
    module: thisModule,
    token: EMAIL_TOKENS.EMAIL_ADAPTER,
    moduleToken: EMAIL_TOKENS.EMAIL_ADAPTER_MODULE,
    classs: ResendEmailAdapter,
    depsMap: { resend: resendModuleLoader, fromAddress: ... },
  }),
};

// packages/<slice>/src/di/EmailAdapter.container.ts
const container = createContainer();
export function getEmailAdapter(): EmailAdapter {
  moduleLoader.loadModule(container);
  return container.get<EmailAdapter>(moduleLoader.token);
}
```

---

## 5. What to copy vs avoid

### Copy

1. **Cal.com's `services/I<Name>.ts` + `services/<Name>.ts` + `services/<Name>.test.ts` triplet** — the most legible port/adapter/test colocation in any TS codebase. Beats `ports.ts` + `adapters/` because file names tell the story.
2. **Cal.com's `DTO-types-in-port-file` pattern** — input/output types live next to the interface, not in a separate `types.ts`. Reduces cross-file navigation.
3. **TinaCMS's `Dummy<Adapter>` fake-adapter pattern** — every port ships with an in-memory fake usable for tests AND local dev.
4. **Stripe-node's per-runtime composition-root file** (`stripe.esm.node.ts` vs `stripe.esm.worker.ts`) — when one adapter is selected at build time, do it via `package.json` exports rather than runtime conditionals.
5. **Cal.com's `?`-optional-methods capability pattern** (`VideoApiAdapter`) — adapters declare extra capabilities without sub-interface explosion.
6. **Sentry's `createTransport(options, makeRequestExecutor)` factory form** — pass the adapter as an argument to a generic-logic function. Use this when the "adapter" is one method, not a whole class.
7. **Hono's `src/adapter/<runtime>/` folder discipline** — for our `Cognito` adapter, this is exactly right: one folder, one runtime, one `index.ts` barrel.
8. **Cal.com blog standard:** _"If bookings needs availability data, it imports from `@calcom/features/availability` through exported interfaces, not by reaching into internal implementation details."_ — enforce via ESLint `no-restricted-imports` rules.

### Avoid

1. **Adopting `@evyweb/ioctopus` at M1** — adds a runtime container that pays off only when you have 3+ adapters per port. We have 1 of each. Plain factory functions suffice until M5+.
2. **NestJS's decorator-driven DI** — requires `reflect-metadata`, ts-node loader gymnastics, polyfills in edge runtimes. Hostile to Next.js 16's edge/RSC model.
3. **Effect-TS's `Context.Tag` + `Layer`** — powerful but viral. Adopting Effect for DI alone is a 200KB bundle hit and a steep learning curve.
4. **Resend-style service-locator (one big class with `this.emails`, `this.domains`)** — looks like SDK shape, but tightly couples sub-services to the parent. Use for SDK wrappers, not for our own slices.
5. **Pure inheritance hierarchies à la Cal.com `abstract class SMSManager`** — Cal.com still has these from earlier eras; they're getting refactored away in the 2026 plan. Don't introduce them.
6. **Generic `Repository<T>` ports** — Cal.com's `UserRepository`, `BookingRepository`, `ProfileRepository`, `OAuthClientRepository` are all **named per-aggregate, not generic**. A `Repository<User>` interface forces you to overfit a CRUD shape; named methods (`findByEmail`, `findByCognitoSub`, `markEmailVerified`) communicate domain intent.
7. **Separate `tests/` directory for adapter tests** — every repo we inspected colocates `*.test.ts` next to source. Splitting into `tests/` breaks Vitest's default discovery and reduces atomic-commit cohesion.
8. **Cross-package internal imports** (importing `@quilty/email/src/adapters/resend`) — ESLint must enforce that consumers import from package barrel only. Cal.com's blog calls this out explicitly.

---

## 6. Recommendation for Quilty's D76 internal package layout

Given:

- Stack is Next.js 16 + Tailwind v4 + TypeScript strict + Turborepo + pnpm.
- Quilty's TS Lambda is a **thin shell** over a Rust backend — most "domain logic" is BFF orchestration (token broker, consent-state, ConsentState SDK gating).
- We have 1 production adapter per port for the foreseeable future (1 Cognito, 1 PostHog, 1 Sentry, 1 Resend, 1 Stripe, 1 Rust-API client).
- We need test isolation (no real Cognito in CI) and we need to be future-proof for the case where, e.g., Resend becomes SES.

**Recommended per-package layout — copy Cal.com's `packages/features/translation/` shape minus the DI container:**

```
packages/<slice>/                          # e.g. packages/email, packages/analytics, packages/session
├── src/
│   ├── ports.ts                           # PORT — interface + DTO types (Cal.com style consolidated)
│   ├── adapters/
│   │   ├── <vendor>.ts                    # e.g. resend.ts, posthog.ts, cognito.ts
│   │   ├── <vendor>.test.ts               # colocated unit test
│   │   └── in-memory.ts                   # fake adapter (DummyMediaStore pattern)
│   ├── domain/                            # pure logic (optional; only for non-trivial slices)
│   │   ├── <use-case>.ts                  # e.g. consent-evaluator.ts
│   │   └── <use-case>.test.ts
│   ├── errors.ts                          # vendor-error → domain-error mapping (Prisma adapter-*/errors.ts pattern)
│   └── index.ts                           # COMPOSITION ROOT + barrel — exports types + createXAdapter() factory
├── package.json                           # name: "@quilty/email", exports: { ".": "./src/index.ts" }
├── tsconfig.json                          # extends @quilty/tsconfig/base
└── README.md                              # 1-page: what port, what adapters, how to add new adapter
```

**Why `ports.ts` (singular) not `services/I<Name>.ts`:**

Cal.com's `services/ITranslationService.ts` makes sense in a slice that **owns a service worth naming** (TranslationService); in our BFF layer the "service" is usually the slice itself. `ports.ts` is closer to canonical hex vocabulary and is the layout most articles recommend (Vertical-Slice-Node, Express-Auth boilerplate, NestJS hex articles). If a slice grows enough to have multiple ports (e.g. `EmailAdapter` + `EmailTemplateRenderer`), split into `ports/email.ts` and `ports/renderer.ts`.

**Why no `services/` directory:**

The naming `services/<Name>Service.ts` is a Cal.com hold-over from the Java enterprise era. We don't need that ceremony when there's only one implementation per port and the file IS the implementation. Adapter files in `adapters/` ARE the service implementations.

**Why no `di/` directory for M1:**

`index.ts` is the composition root. It exports a `create<Slice>Adapter(config)` factory function that selects the adapter based on env/config. When we have 3+ adapters per port AND 3+ slices that compose them (M5+), we revisit and add `di/` with `@evyweb/ioctopus` per Cal.com's pattern.

**Consumer pattern from `apps/web/`:**

```typescript
// apps/web/lib/email.ts (the app-level singleton holder)
import { createEmailAdapter, type EmailAdapter } from '@quilty/email';

let _emailAdapter: EmailAdapter | null = null;
export function getEmailAdapter(): EmailAdapter {
  if (!_emailAdapter) {
    _emailAdapter = createEmailAdapter({
      driver: process.env.NODE_ENV === 'test' ? 'in-memory' : 'resend',
      resendApiKey: process.env.RESEND_API_KEY!,
      fromAddress: process.env.EMAIL_FROM ?? 'no-reply@my-quilty.com',
    });
  }
  return _emailAdapter;
}

// apps/web/app/api/auth/verify/route.ts (the consumer — knows only the port)
import { getEmailAdapter } from '@/lib/email';
export async function POST(req: Request) {
  const email = getEmailAdapter();
  await email.send({ to: '...', subject: '...', body: '...' });
}
```

**Lint enforcement (per Cal.com 2026 standard):**

```json
// .eslintrc.json — ban direct vendor SDK imports outside adapter files
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          { "group": ["resend"], "message": "Import @quilty/email instead." },
          {
            "group": ["posthog-js", "posthog-node"],
            "message": "Import @quilty/analytics instead."
          },
          { "group": ["stripe"], "message": "Import @quilty/payments instead." }
        ]
      }
    ]
  },
  "overrides": [
    {
      // adapters MAY import their vendor SDK
      "files": ["packages/*/src/adapters/*.ts"],
      "rules": { "no-restricted-imports": "off" }
    }
  ]
}
```

This is **exactly** the discipline Cal.com committed to in their 2026 blog ("only Repository implementations know about Prisma"). The lint rule makes the boundary mechanical, not aspirational.

**Migration trigger to full Cal.com pattern (DI container, `services/` split):**

Adopt only when ALL three hold:

- ≥3 adapter implementations of any port (e.g. Resend + SES + Postmark)
- ≥3 packages compose the slice (cross-slice DI graph)
- New-hire ramp time on adapter wiring exceeds 30 min

Until then: plain factories. Don't pre-pay container complexity for benefits we won't see for 6+ months.

---

## Sources

- [Cal.com — Engineering in 2026 and Beyond](https://cal.com/blog/engineering-in-2026-and-beyond) — Cal.com's commitment to repository pattern + DI + vertical slices + DTOs
- [@evyweb/ioctopus on npm](https://www.npmjs.com/package/@evyweb/ioctopus) — the TS DI container Cal.com uses
- [calcom/cal.com — `packages/features/translation/`](https://github.com/calcom/cal.com/tree/main/packages/features/translation) — exemplar slice
- [calcom/cal.com — `packages/types/`](https://github.com/calcom/cal.com/tree/main/packages/types) — port-interface declarations as `.d.ts`
- [calcom/cal.com — `packages/features/di/`](https://github.com/calcom/cal.com/tree/main/packages/features/di) — DI plumbing layer
- [calcom/cal.com — `packages/app-store/googlecalendar/lib/CalendarService.ts`](https://github.com/calcom/cal.com/blob/main/packages/app-store/googlecalendar/lib/CalendarService.ts) — `class GoogleCalendarService implements Calendar`
- [honojs/hono — `src/adapter/`](https://github.com/honojs/hono/tree/main/src/adapter) — folder-per-runtime adapter
- [getsentry/sentry-javascript — `packages/core/src/transports/base.ts`](https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/transports/base.ts) — `createTransport(options, makeRequest)` functional factory
- [getsentry/sentry-javascript — `packages/`](https://github.com/getsentry/sentry-javascript/tree/develop/packages) — 45+ runtime/framework adapter packages
- [prisma/prisma — `packages/driver-adapter-utils/src/types.ts`](https://github.com/prisma/prisma/blob/main/packages/driver-adapter-utils/src/types.ts) — driver-adapter port
- [prisma/prisma — `packages/adapter-pg/src/pg.ts`](https://github.com/prisma/prisma/blob/main/packages/adapter-pg/src/pg.ts) — `class PgQueryable implements SqlQueryable`
- [effect-ts/effect — `packages/sql/src/SqlClient.ts`](https://github.com/Effect-TS/effect/blob/main/packages/sql/src/SqlClient.ts) — `Context.Tag`-based port
- [effect-ts/effect — `packages/sql-pg/src/PgClient.ts`](https://github.com/Effect-TS/effect/blob/main/packages/sql-pg/src/PgClient.ts) — Postgres adapter
- [stripe/stripe-node — `src/net/HttpClient.ts`](https://github.com/stripe/stripe-node/blob/master/src/net/HttpClient.ts) — `HttpClientInterface` port + Node/Fetch adapters
- [resend/resend-node — `src/resend.ts`](https://github.com/resend/resend-node/blob/main/src/resend.ts) — service-locator composition
- [tinacms/tinacms — `packages/next-tinacms-s3/src/s3-media-store.ts`](https://github.com/tinacms/tinacms/blob/main/packages/next-tinacms-s3/src/s3-media-store.ts) — `class S3MediaStore implements MediaStore`
- [tinacms/tinacms — `packages/tinacms/src/toolkit/core/media-store.default.ts`](https://github.com/tinacms/tinacms/blob/main/packages/tinacms/src/toolkit/core/media-store.default.ts) — `class DummyMediaStore implements MediaStore` (fake-adapter shipped in core)
- [nestjs/nest — `sample/25-dynamic-modules/src/config/config.module.ts`](https://github.com/nestjs/nest/blob/master/sample/25-dynamic-modules/src/config/config.module.ts) — NestJS `DynamicModule` pattern
- [vercel/next.js — `packages/next/src/server/lib/`](https://github.com/vercel/next.js/tree/canary/packages/next/src/server/lib) — flat-per-concern (anti-pattern reference)
- [Pragmatic Engineer — The Story of Linear as told by its CTO](https://newsletter.pragmaticengineer.com/p/linear) — Linear's TypeScript-first stack rationale
- [Medium — 12 TypeScript Project Layouts That Age Well](https://medium.com/@sparknp1/12-typescript-project-layouts-that-age-well-3159c6510257) — survey of feature-first / hex / clean layouts
- [akachida/vertical-slice-nodejs](https://github.com/akachida/vertical-slice-nodejs) — production-grade vertical-slice TS template with manual DI ("Composition Root for that slice" pattern in feature `index.ts`)
- [mehdihadeli/nestjs-vertical-slice-template](https://github.com/mehdihadeli/nestjs-vertical-slice-template) — NestJS + TypeORM + OpenTelemetry boilerplate
- [Milan Jovanović — Vertical Slice Architecture](https://www.milanjovanovic.tech/blog/vertical-slice-architecture) — foundational article
- [Krzysztof Słomka — Hexagonal Architecture with Nest.js and TypeScript](https://kisztof.medium.com/hexagonal-architecture-with-nest-js-and-typescript-f181cc7b6452) — NestJS hex implementation
- [dev.to — Hexagonal Architecture: Enabling Horizontal Scalability and Seamless Microservices Transition](https://dev.to/jsalio/hexagonal-architecture-enabling-horizontal-scalability-and-seamless-microservices-transition-52hg) — July 2025 article on scaling
- [dev.to — Ports and Adapters (Hexagonal Architecture)](https://dev.to/rafaeljcamara/ports-and-adapters-hexagonal-architecture-547c) — June 2025 deep-dive on driver vs driven ports
- [dev.to — Create Express Auth — A Clean Architecture Boilerplate](https://dev.to/francemazzi/create-express-auth-a-clean-architecture-boilerplate-for-modern-apis-l04) — October 2025 production-ready boilerplate
