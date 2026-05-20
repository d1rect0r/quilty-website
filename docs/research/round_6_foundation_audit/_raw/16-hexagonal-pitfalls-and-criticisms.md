# 16 — Hexagonal Architecture: Pitfalls and Criticisms

> **Round 6 — D76 evidence.** Honest critique of hexagonal architecture / ports-and-adapters as a default pattern in 2024–2026, with specific reference to Quilty's context: solo team, ~10 packages, Next.js 16 marketing+portal, HIPAA-aligned consumer surface, vendor-heavy stack.
>
> Read-only. Goal: surface real evidence of failure modes before locking D76, not validate a pre-formed conclusion.

---

## 1. Executive summary

**Hexagonal architecture is not wrong for Quilty — but applying it as a uniform default across all ~10 packages is the single most common documented failure mode of the pattern.** The 2024–2026 literature is remarkably consistent on this: hexagonal pays off in long-lived systems with rich domain logic and multiple driving adapters (HTTP + message bus + CLI), and it punishes solo teams shipping CRUD-and-vendor-glue applications.

The honest assessment for Quilty:

- **Marketing site** (most of `apps/web/`, content-driven, rendered, MDX, sitemap, robots, JSON-LD) → hexagonal is **over-engineered**. Direct vendor calls or thin server modules are the documented best practice. Hono's framework authors, Mark Seemann's "fat adapters" line, Jimmy Bogard's Vertical Slices, and Lazar Nikolov (Sentry DevRel, author of `nextjs-clean-architecture`) all explicitly advise against full ports/adapters for marketing surfaces.
- **Account portal** (auth, subscription mgmt, account settings) → hexagonal is **appropriate but small-surface**. The domain logic is real (session, entitlement, plan changes, billing reconciliation), there are 3+ driving adapters in the medium-term roadmap (web BFF, Cognito callbacks, EventBridge), and PHI-adjacent flows demand testable boundaries.
- **Cross-cutting infrastructure** (observability, consent, feature flags, PHI sanitizer) → ports yes, but **ports that express a domain capability, not a vendor SDK shape**. The literature is unanimous that 1:1 SDK wrappers are the dominant anti-pattern.

The recommendation in §7 is **"hexagonal-by-boundary, not hexagonal-by-package"** — adopt the discipline where the domain earns it, ship direct calls in the marketing site, and prepare an explicit migration trigger so we don't either over-engineer day one or paint ourselves into a corner later.

The remainder of this document presents the cited evidence.

---

## 2. Top 10 documented failure modes

### 2.1 "Adapter explosion" — ports outnumber abstractions worth making

The pattern's flexibility ("you can have as many ports as you want") combined with the "one adapter per vendor" reflex produces interface proliferation. Cockburn himself acknowledged in his 2024 _Hexagonal Architecture Explained_ book that the hexagon name "was a placeholder" and the number of sides is arbitrary — meaning teams have no upper bound enforced by the pattern itself.

[Tejas Rawat (Medium, 2024)](https://medium.com/@tejasrawat_82721/hexagonal-architecture-ports-and-adapters-explained-a-practical-guide-from-concept-to-code-7903053f38f4) writes: _"If not carefully designed, you could end up with too many small, granular ports and adapters, making the overall structure difficult to navigate."_ [Rafael Camara (DEV.to)](https://dev.to/rafaeljcamara/ports-and-adapters-hexagonal-architecture-547c) is more concrete: _"The Pull Request size for a simple modification, like adding a new method to a Port, spans across multiple files and directories."_

[Jointhefreeworld — "Hexagon of Doom"](https://jointhefreeworld.org/blog/articles/development/hexagon-of-doom/index.html) quantifies it: _"Making a simple change now often requires modifications across three or four files (Domain Port, Application Service, Infrastructure Adapter, and the Layer wiring). This distributed logic dramatically increases the difficulty and risk associated with even minor feature updates."_

**Quilty risk vector:** vendor list at M1 is already ~12 (Cognito, Stripe, Sanity, Sentry, PostHog, Resend/SES, Twilio, Algolia, Cloudflare R2, S3, CloudFront, EventBridge). One port + one production adapter + one fake = **36 artifacts before we ship a single feature**.

### 2.2 "Anemic domain trap" — ports as thin pass-throughs with no domain logic

Highly cited. [Victor Rentea](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/): _"An interface deserves to exist if and only if: it has more than one implementation in the project, OR it is used to implement Dependency Inversion to protect an Inner Ring, OR it is packaged in a client library."_ He calls violations of this _"Useless Interfaces."_

[Herberto Graça (Software Architecture Chronicles)](https://medium.com/the-software-architecture-chronicles/ports-adapters-architecture-d19f2d476eca) puts the principle bluntly: _"It is of utmost importance that the Ports are created to fit the Application Core needs and not simply mimic the tools APIs."_ The anti-pattern is so common Cockburn's own community has named it ("Ports That Mimic Tool APIs").

In real codebases, ports that mirror an SDK surface tend to grow as the SDK grows, defeating the swap rationale that motivated them. Vladimir Khorikov's law applies: _"Abstractions are not created, they are discovered."_ — port abstractions designed up-front are statistically wrong.

### 2.3 "Test theater" — fakes pass, integration bugs ship

The mockist vs. classicist debate hits hexagonal hardest because the pattern's "testability" pitch depends on test doubles at every port. [J.B. Rainsberger's "Integrated Tests Are a Scam"](https://blog.thecodewhisperer.com/permalink/integrated-tests-are-a-scam) and [Shai Yallin's "Fake, Don't Mock"](https://www.shaiyallin.com/post/fake-don-t-mock) document the actual failure pattern: _"Many layers of tests, with a bad mock somewhere, and surprise behaviors of a dependency lead to bugs in prod."_

The mitigation (contract tests between fake and real adapter, ploeh's "ports and fat adapters", and assert-the-same-suite-runs-against-both discipline) is itself a substantial body of work. [Mark Seemann (April 2025)](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/) admits: _"I usually don't abstract application behaviour from frameworks. I don't create 'application layers', 'use-case classes', 'mediators', or similar. This is a deliberate architecture decision."_ That is from one of the historical advocates of the pattern.

The Quilty-specific risk: in our mobile precedent (33 ports + 27 fakes), some fakes are >800 LoC. If those fakes diverge from the real Cognito/Stripe behavior in any subtle way (clock drift, rate-limit shape, retry semantics, idempotency keys), tests stay green while production breaks. This is the documented worst case — a confident green CI plus a Cerebral-style production incident.

### 2.4 "Premature abstraction" — designing for swap-ability that never happens

The canonical citations:

- [Dan Abramov, "Goodbye, Clean Code" (overreacted.io)](https://overreacted.io/goodbye-clean-code/): the abstraction _"traded the ability to change requirements for reduced duplication."_ Once the requirements evolved, the elegant abstraction would have become "several times more convoluted."
- [Sandi Metz, "The Wrong Abstraction" (RailsConf 2014)](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction): _"Duplication is far cheaper than the wrong abstraction."_ Connected to the sunk-cost fallacy — teams stick with bad abstractions because they invested in them.
- [Kent C. Dodds — AHA (Avoid Hasty Abstractions)](https://kentcdodds.com/blog/aha-programming): the third use case, not the second, is when to abstract.
- [LinkedIn / Łaczek](https://www.linkedin.com/pulse/ports-adapters-architecture-how-avoid-cargo-cult-in-memory-%C5%82aczek-tmoif): _"How often do developers actually replace an Oracle database with PostgreSQL, or AWS S3 storage with Azure Blob Storage?"_ The motivating scenario for many ports never materializes.

Combined with the [Wikipedia "Hexagonal architecture" page](<https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)>)'s acknowledged "leaky abstraction" pitfall (_"an interface that looks generic but whose contract matches the encapsulated component"_), the swap-ability promise is empirically rare and often architecturally false when invoked.

### 2.5 "Discoverability problem" — call stacks new contributors can't trace

[Jointhefreeworld — "Hexagon of Doom"](https://jointhefreeworld.org/blog/articles/development/hexagon-of-doom/index.html): _"Every time a developer needs to trace a call, they must traverse the application layer, the Service/Layer boundary, and the Port/Adapter boundary. This complexity makes debugging significantly more painful and slows down the basic task of understanding code flow."_

[Oliver Zihler — "From Hexagonal- to Clean Architecture"](https://codeartify.substack.com/p/from-hexagonal-to-clean-architecture) explicitly identifies discoverability as _the_ gap in hexagonal that motivated his switch to Uncle Bob's "use case" framing: _"While Hexagonal Architecture stays (intentionally?) vague about the size of the inside of the app, Clean Architecture emphasises a 'use case' split. The idea of having a set of first-class citizen use cases heavily improves discoverability inside the codebase."_

For a solo team, today's contributor is _future-you who has not touched the code in 6 weeks_. The literature treats this not as a soft cost but as a measurable velocity tax.

### 2.6 "Composition root sprawl" — the wiring file as 500-line god-class

Composition Root is structurally required to know about every module — [Chris Fryer (Medium)](https://medium.com/@cfryerdev/dependency-injection-composition-root-418a1bb19130) puts it: _"By design, the Composition Root takes a direct dependency on all modules in the system."_

[Mark Seemann's original 2011 "Composition Root" post (ploeh blog)](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) accepted this trade-off but it's worth noting the documented mitigations (per-module installers, assembly scanning, container-only-in-startup) all add their own ceremony.

The realistic Quilty composition root at M3+ wires Cognito + Stripe + Sanity + Resend + PostHog + Sentry + R2 + DynamoDB + EventBridge × (driving adapter mode) × (test/preview/prod environment). That is a non-trivial file. [Lazar Nikolov's nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture) — Sentry's own Next.js reference — uses `ioctopus` instead of Inversify _specifically because_ DI containers are painful in serverless/Edge runtimes. The composition layer is real overhead, not theoretical.

### 2.7 "Solo-team overhead" — ceremony cost exceeds swap-savings benefit at small scale

The 2025 literature is unusually unanimous here.

[Slimen Arnaout (Medium, June 2025)](https://medium.com/@arnaout.slimen/is-hexagonal-architecture-still-relevant-in-2025-absolutely-a4fa02d092c0), a defender of the pattern, concedes: _"It introduces complexity — for small apps, the added layers might feel like over-engineering. There's a learning curve, especially for teams unfamiliar with DDD or architectural patterns. It can feel verbose — too many interfaces, folders, and abstractions can make the project harder to navigate without clear conventions."_

[Nareshit 2025 Java guide](https://nareshit.com/blogs/clean-architecture-and-hexagonal-patterns-in-java) lists "overengineering small applications with unnecessary layers" as the #1 documented mistake.

[The Sairyss Domain-Driven Hexagon repo](https://github.com/Sairyss/domain-driven-hexagon) — one of the most-starred hexagonal reference repos on GitHub — adds the discipline gate: _"Any team implementing such a solution will almost certainly require an expert to drive the solution and keep it from evolving the wrong way."_

For a solo developer there is no second person to enforce the discipline; the pattern degrades to anemic ports + cargo-cult folders without an external reviewer.

### 2.8 "Over-engineered for CRUD"

The clearest line in the literature. Direct quotes:

- [Taha Crafter — Hexagonal Architecture: TypeScript Guide](https://www.tahacrafter.com/blog/hexagonal-architecture-typescript): _"If your entire app is request → validate → save → respond, you don't need a hexagon. You need a framework."_
- [Victor Rentea](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/): _"If the domain complexity is fairly low (CRUD-like), or if the challenge of your application is NOT in the complexity of its business rules, then Onion/Hexagonal/Ports-Adapters/Clean Architecture might not be the best choice."_
- [Steve Smith (Ardalis) — "Clean Architecture Sucks"](https://ardalis.com/clean-architecture-sucks/): _"There are some applications that are simple and don't require much, if any architecture (what is referred to as YOLO architecture). And there are some applications which benefit from minimal structure and just pipelines and handlers (often referred to as Vertical Slice Architecture)."_

A marketing site is the canonical CRUD-or-less workload. The marketing surface of Quilty is content rendering + form submissions + analytics events. None of this is the domain complexity hexagonal protects.

### 2.9 "Hexagonal in name only" — cargo cult

[Cotonne — "Hexagonal architecture is dead… Long live to hexagonal architecture!"](https://cotonne.github.io/architecture/craft/2016/12/08/hexagonal-architecture-is-dead.html): _"Using the 'Impl' suffix is a smell that you haven't complied with the definition of hexagonal architecture. Just applying the convention without understanding and applying the design process behind the pattern is just a 'cargo cult'."_

The variant we should worry about most for Quilty: packages structured like `domain/`, `adapters/`, `ports/` folders where the domain code freely imports adapter types because nobody had time to design proper ports. The folder structure looks right; the dependency graph is a Big Ball of Mud. ESLint boundary chokepoints + dependency-cruiser graph rules (which D76 proposes) genuinely mitigate this — but only if the rules are kept green, which a solo team can let slide under deadline pressure.

### 2.10 "Wrapper hell" — 1:1 SDK adapters with no abstraction value

[Herberto Graça (Software Architecture Chronicles)](https://medium.com/the-software-architecture-chronicles/ports-adapters-architecture-d19f2d476eca): _"Ports are created to fit the Application Core needs and not simply mimic the tools APIs."_

[Mark Seemann's "Ports and fat adapters" (April 2025)](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/) is the clearest contemporary articulation: thin 1:1 adapters cost classes/interfaces/test scaffolding and provide negligible value because they don't translate between domain language and SDK language. Seemann advocates _fat_ adapters that absorb meaningful work.

[0x5.uk — "What is Hexagonal Architecture"](https://0x5.uk/2023/09/28/what-is-hexagonal-architecture/) is even sharper on the related "repository over ORM" version: _"Your ORM is already a repository pattern. Hiding the ORM in some custom IRepository is nothing more than toil for a net-negative benefit. More layers are not always better — each layer costs you agility."_

---

## 3. Companies that rejected / regressed hexagonal

This category is harder to evidence than the pattern-level critiques because most "we removed our hexagonal layers" stories live in private retrospectives. The public surface:

### 3.1 Companies that publicly chose simpler default

- **Hono framework authors** ([best practices guide](https://hono.dev/docs/guides/best-practices)) explicitly advise _against_ RoR-style controller layers: _"When possible, you should not create 'Ruby on Rails-like Controllers'. Write handlers directly after path definitions."_ This is the antithesis of hexagonal layering.
- **DHH / 37signals (Basecamp / HEY)** — disciplined modular monolith without explicit ports/adapters layering. Basecamp's Rails codebase organizes by concerns and engines, not by hexagonal ring. Documented in DHH's "Majestic Monolith" essay and reinforced repeatedly through 2024–2025.
- **Discord** ([d4dummies analysis](https://d4dummies.com/architecting-for-hyperscale-an-in-depth-analysis-of-discords-billion-message-per-day-infrastructure/)) — Python API monolith + Rust data services + Elixir real-time. No hexagonal framing in their public engineering blog; structure is polyglot-by-pragmatism.
- **Linear** ([engineering blog](https://linear.app/now/practices-for-building-linear-is-now-open-for-all), [Pustelnik's reverse-engineering](https://pustelto.com/blog/reverse-engineer-linear-1-header/), [ByteByteGo multi-region piece](https://blog.bytebytego.com/p/how-linear-implemented-multi-region)) — MobX state, local-first sync engine, Cloudflare Worker proxy. No hexagonal framing in any of their public posts; emphasis is on sub-50ms interaction latency and minimal abstraction.

### 3.2 Explicit "we regretted it" postmortems

- [Devrim, "We Chose Hexagonal Architecture. Here's Why We Regret It" (Javarevisited, Oct 2025)](https://medium.com/javarevisited/why-we-regretted-our-hexagonal-architecture-and-went-back-to-simpler-boundaries-e692d9158dcf) — the leading example. (Article is paywalled past the introduction; the headline + opening establish the team refactored back to "simpler boundaries.")
- [Aleix Morgadas — "Simplifying a Ports and Adapters architecture and remove anti-corruption layers made sense from a sociotechnical perspective"](https://learnings.aleixmorgadas.dev/p/replacing-ports-and-adapters-architecture) — describes a team that replaced their ports/adapters layer with thin Spring-Boot-defaults architecture (_"a ports and adapters leveraging Spring Boot defaults looks like an MVC+Service, or 3-layered architecture with an Application Service"_).
- Cotonne's _"Hexagonal architecture is dead"_ essay — same sociotechnical argument, framed earlier (2016) and re-cited often.

### 3.3 Voices hedging mid-stream

- **Jimmy Bogard** (creator of MediatR and AutoMapper) — abandoned Onion Architecture for [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) after _"within a couple of months cracks started to show"_. His thesis: organize vertically by feature, not horizontally by technical layer. He has used VSA exclusively for 7–8 years.
- **Mark Seemann** — author of _Dependency Injection in .NET_ and "Composition Root" — has shifted from advocating layered DI architectures to "fat adapters" as of 2025.
- **Khalil Stemmler** — still an advocate but explicitly hedges with _"You don't need to always follow them, but know the rules before deciding whether you want to break them."_

### 3.4 The "didn't adopt despite engineering strength" set

Confirmed (no hexagonal framing in any public engineering content): **Vercel**, **Shopify** (modular monolith with module boundaries but no port/adapter framing), **GitHub** (Rails monolith), **Linear**, **Discord**, **Stripe** (the API has "Stripe Connect" abstraction but their internal Ruby monolith is not hexagonal-framed publicly).

The pattern in this list: at-scale engineering organizations either build modular monoliths _without_ ports/adapters language, or scope ports/adapters to specific boundaries (gateways, billing) rather than as a global rule.

---

## 4. Sized-team / project-type guidance

Synthesizing the documented thresholds:

### 4.1 Team size

The literature consistently gives team-size guidance even when it stops short of a hard number:

- **Solo to ~3 devs pre-launch** → uniformly described as _overkill_. [techcommunity.microsoft.com discussion](https://techcommunity.microsoft.com/discussions/app-dev/is-clean-architecture-overkill-for-small-teams-maintaining-a-single-web-app-/4441078): _"For a small team with a stable web app, full Clean Architecture is usually overkill — the extra layers and abstractions can slow you down more than they help. A lighter, 'clean-ish' approach works best."_
- **5–15 devs with shared codebase** → the bracket where hexagonal _starts_ paying off if domain complexity is real. [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon): _"Any team implementing such a solution will almost certainly require an expert to drive the solution."_
- **Below ~10 engineers — Backstage and similar IDPs are uniformly described as premature.** Quilty's CLAUDE.md already locks this for Backstage; the same logic applies to hexagonal-by-default.

### 4.2 Project type

| Project type                                                                         | Verdict                                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Marketing site (content, forms, MDX, SEO)                                            | Hexagonal is **wrong**. Direct vendor calls or thin server modules.                                              |
| Prototype / hackathon                                                                | Wrong.                                                                                                           |
| Pure CRUD microservice                                                               | Wrong. _"You don't need a hexagon. You need a framework."_                                                       |
| App with rich business rules (billing, entitlements, scheduling, content moderation) | Right candidate.                                                                                                 |
| App with multiple driving adapters (HTTP + queue + CLI + scheduled)                  | Right candidate.                                                                                                 |
| Long-lived system (5+ year horizon) where infrastructure churns under stable domain  | Right candidate.                                                                                                 |
| Vendor-glue layer (BFF)                                                              | Mixed. Use ports for _integrations the domain reasons about_ (e.g., "Subscriber", "Payment"), not for SDK shape. |
| Frontend UI (React/Next.js components)                                               | Almost never. Even the React-hexagonal advocates (Kondov, Kong To) drop most of the pattern when applying it.    |

### 4.3 Project maturity

[Lazar Nikolov (Sentry DevRel, author of `nextjs-clean-architecture`)](https://github.com/nikolovlazar/nextjs-clean-architecture) — perhaps the most-cited recent Next.js example — _explicitly advises against implementing Clean Architecture on new projects_: focus on MVP first, then invest in the architecture once features grow, the user base expands, or you're onboarding other developers.

---

## 5. Honest weighing for Quilty's specific context

Quilty's situation, mapped to each failure mode:

| Failure mode             | Severity at Quilty                     | Why                                                                                                                                            |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter explosion        | **HIGH**                               | 12+ vendor surfaces already. Default expansion to ~30+ ports if uniform.                                                                       |
| Anemic domain trap       | **HIGH**                               | Marketing surface has no real domain. Portal domain is real but small.                                                                         |
| Test theater             | **MEDIUM-HIGH**                        | Solo team can't sustain contract-test discipline that the mobile team has institutionalized. PHI-adjacent flows make false-green CI dangerous. |
| Premature abstraction    | **MEDIUM**                             | We're pre-product-market-fit on the portal. Domain shape will change.                                                                          |
| Discoverability          | **HIGH**                               | Solo team means today's contributor is future-you in 6 weeks. Indirection tax is paid in person.                                               |
| Composition root sprawl  | **MEDIUM**                             | DI containers are painful in Next.js Edge runtime (Nikolov had to write `ioctopus`).                                                           |
| Solo-team overhead       | **HIGH**                               | Direct cited threshold. No second reviewer to enforce discipline.                                                                              |
| Over-engineered for CRUD | **HIGH for marketing**, LOW for portal | Marketing surface is content + forms + analytics.                                                                                              |
| Hexagonal in name only   | **MEDIUM**                             | ESLint boundary rules help, but only if kept green under deadline pressure.                                                                    |
| Wrapper hell             | **HIGH**                               | Vendor-heavy stack. Reflex to wrap each SDK 1:1 will not survive contact with timeline.                                                        |

**Counter-arguments specifically defending hexagonal for Quilty:**

1. **HIPAA boundary discipline.** Ports that enforce "no PHI crosses this line" are real architectural value. A `Subscriber` port that whitelists fields server-side prevents the Cerebral pixel-exfil class of bug. This is not testability theater; it is a compliance control.
2. **Mobile precedent (33 ports + 27 fakes).** The mobile team has _lived_ the pattern at scale and made it work. The institutional knowledge transfers.
3. **Multi-runtime requirements.** Next.js Lambda + Edge runtime + future SST-deployed worker create genuine multi-driving-adapter scenarios.
4. **The "thin TS shell" thesis (D48).** If the website is genuinely a thin UI + token-broker layer over Rust, the ports surface should be _small_ — that's the design. Ports in the website talk to the Rust backend, not to N vendor SDKs directly.

The 4th point is the cleanest articulation of when hexagonal _does_ fit Quilty: **the website should expose a small number of business-meaningful ports (Auth, Subscription, Content, ConsentState, Observability) over a Rust backend, NOT a port per vendor SDK.**

---

## 6. Mitigation strategies

If we ship hexagonal, the following disciplines mitigate each documented failure mode:

### 6.1 Against adapter explosion

- **Hard cap on ports at M1**: ≤6 ports total across `apps/web/`. The cap forces a design decision when port #7 is proposed.
- **One port = one business capability**, not one vendor. `EmailDispatcher` (one port) → `ResendAdapter` + `SesAdapter` (potential adapters). Not `ResendPort` + `SesPort`.
- **Marketing-side vendor calls live in `lib/services/`**, not behind ports. Sanity, MDX, sitemap, robots, JSON-LD — all direct.

### 6.2 Against anemic domain trap

- **Rule of Three enforcement**: no port created until there are two adapters _or_ a documented HIPAA boundary control reason. Pure swap-ability is not sufficient justification.
- **Code review checklist item**: "Does this port's method signature use domain language or SDK language?" If SDK language, redesign.

### 6.3 Against test theater

- **Contract tests are mandatory for every fake.** No fake ships without a contract suite that runs against both the fake and a sandbox adapter weekly in CI.
- **Vendor sandbox + integration tests** on Stripe, Cognito, EventBridge. Fakes are for fast feedback only; integration tests are the source of truth.

### 6.4 Against premature abstraction

- **Trigger-based adoption**, not date-based. Each port has a documented "added because" line in the ADR or strategy doc.
- **Vertical slice for new features**: build the slice flat first, refactor ports only on the third repeat.

### 6.5 Against discoverability

- **Use-case-named files at the application layer** (per Oliver Zihler's clean-architecture-fixes-discoverability argument): `RegisterUser.ts`, `ChangeSubscription.ts` — not `UserService.ts`.
- **`docs/adr/` cross-reference** in every port file's header comment: which ADR mandates this port? If no ADR, why does it exist?

### 6.6 Against composition root sprawl

- **Per-package composition roots**, not one global. The marketing package wires nothing; the portal package wires its 4–6 ports.
- **Stay in framework defaults** where Next.js provides DI semantics (Route Handlers, RSC server boundaries). Don't import Inversify/tsyringe/awilix unless we hit a documented limit.

### 6.7 Against solo-team overhead

- **Time-box ports**: ports cost discretionary tax budget. Track time spent on "port plumbing" in M1–M3; revisit D76 if it exceeds 15%.
- **Multi-agent QA loop** (`run-qa-loop`) acts as the missing second reviewer the literature says we need.

### 6.8 Against over-engineering for CRUD

- **Marketing site is explicitly exempt from D76**. No ports in `apps/web/app/(marketing)`. Direct calls, server-only modules, RSC fetches.

### 6.9 Against hexagonal in name only

- **dependency-cruiser graph rules in CI**, failing the build on cross-layer imports.
- **ESLint boundary chokepoint** at the package level — already in D76 scope.
- **Quarterly architecture review** specifically asking: "Is the dependency graph still acyclic and inward-pointing?"

### 6.10 Against wrapper hell

- **Adapter fatness test**: every adapter must do >1 of: data translation, domain enrichment, error normalization, retry/circuit, audit logging. Pure SDK pass-through adapters get rejected in review.

---

## 7. Recommendation for Quilty's D76

**Revise D76 to "hexagonal-by-boundary, not hexagonal-by-package."**

Specifically:

### 7.1 Ship at M1.5

- **`apps/web/app/(marketing)/*`** — flat. `lib/services/` modules. Direct vendor calls (Sanity, MDX render, sitemap, robots, JSON-LD). No ports.
- **`apps/web/app/(account)/*`** — hexagonal-lite. 4–6 named ports for the genuinely cross-cutting capabilities:
  - `Auth` (Cognito callbacks, session store, step-up, backup codes)
  - `Subscription` (Stripe, RevenueCat reconciliation point)
  - `ConsentState` (D35; PHI gate)
  - `Observability` (Sentry + PostHog; PHI sanitizer; OTel)
  - Optionally `FeatureFlags` (PostHog flags; thin)
  - Optionally `BackendGateway` (Rust API client; one port not per-endpoint)
- **`packages/*`** — adopt ports inside packages _only_ where the package is shared across `apps/web` and a future second app. M1's `packages/shared-types` does not need ports. A future `packages/auth-client` would.

### 7.2 Tooling

Keep the D76 tooling (ESLint boundary chokepoint + dependency-cruiser + composition root convention) — these are net-positive even at the smaller surface, and they're the cheapest mitigations the literature documents.

### 7.3 Triggers for expanding hexagonal scope

Document explicit triggers in the strategy doc:

- Second driving adapter for an existing capability (e.g., admin CLI for subscription operations) → port the capability.
- Third repetition of vendor-coupled code → refactor to port (Rule of Three).
- Second consumer of an internal module across packages → port the module's surface.
- Compliance review identifies an unaudited PHI/consent crossing → port the boundary.

### 7.4 What NOT to do

- **Do NOT** create a port per vendor SDK at M1.
- **Do NOT** create ports in the marketing surface.
- **Do NOT** wire a global composition root for the whole `apps/web/`; per-feature or per-package scoping is sufficient and cheaper.
- **Do NOT** rely on fakes without contract tests against vendor sandboxes.
- **Do NOT** treat the mobile team's 33 ports / 27 fakes as a target — that team has 5+ engineers and a multi-year domain. The website is solo and pre-launch.

### 7.5 Honest summary line

The mobile precedent is the strongest argument for adopting hexagonal at Quilty. The 2024–2026 literature is the strongest argument for adopting it _selectively_. The synthesis is: keep the discipline where the domain earns it (auth, subscription, consent, observability, gateway), keep the marketing surface flat, and document the triggers for expansion so we don't either over-invest now or get blindsided later.

This is a revision of D76, not a rejection. The pattern is right for the portal. The pattern is documented-wrong for the marketing site. Treating them uniformly is the failure mode every cited postmortem in this report converged on.

---

## Citations

Inline above. Key sources consolidated:

- Alistair Cockburn (original author) — [_Hexagonal Architecture Explained_ (2024)](https://www.amazon.com/Hexagonal-Architecture-Explained-Alistair-Cockburn/dp/173751978X), [updated 2025 pages](https://alistaircockburn.com/hexarch%20v1.1b%20DIFFS%2020250420-1012%20paper+epub.docx.pdf)
- Victor Rentea — [Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/)
- Jimmy Bogard — [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)
- Mark Seemann (ploeh) — [Ports and fat adapters (April 2025)](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/), [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- Dan Abramov — [Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/)
- Sandi Metz — [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- Kent C. Dodds — [AHA Programming](https://kentcdodds.com/blog/aha-programming)
- Steve Smith (Ardalis) — [Clean Architecture Sucks](https://ardalis.com/clean-architecture-sucks/)
- Lazar Nikolov (Sentry) — [nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture)
- "Hexagon of Doom" — [The Cost of Over-Abstraction and Indirection](https://jointhefreeworld.org/blog/articles/development/hexagon-of-doom/index.html)
- Devrim (Javarevisited, Oct 2025) — [We Chose Hexagonal Architecture. Here's Why We Regret It.](https://medium.com/javarevisited/why-we-regretted-our-hexagonal-architecture-and-went-back-to-simpler-boundaries-e692d9158dcf)
- Cotonne (2016, re-cited 2024-2025) — [Hexagonal architecture is dead](https://cotonne.github.io/architecture/craft/2016/12/08/hexagonal-architecture-is-dead.html)
- Aleix Morgadas — [Simplifying a Ports and Adapters architecture](https://learnings.aleixmorgadas.dev/p/replacing-ports-and-adapters-architecture)
- Albert Llousas — [Hexagonal Architecture: Common pitfalls](https://medium.com/@allousas/hexagonal-architecture-common-pitfalls-f155e12388a3)
- Slimen Arnaout (June 2025) — [Is Hexagonal Architecture Still Relevant in 2025?](https://medium.com/@arnaout.slimen/is-hexagonal-architecture-still-relevant-in-2025-absolutely-a4fa02d092c0)
- Oliver Zihler — [From Hexagonal- to Clean Architecture](https://codeartify.substack.com/p/from-hexagonal-to-clean-architecture)
- J.B. Rainsberger — [Integrated Tests Are a Scam](https://blog.thecodewhisperer.com/permalink/integrated-tests-are-a-scam)
- Shai Yallin — [Fake, Don't Mock](https://www.shaiyallin.com/post/fake-don-t-mock)
- Taha Crafter — [Hexagonal Architecture: TypeScript Guide](https://www.tahacrafter.com/blog/hexagonal-architecture-typescript)
- Hono framework — [Best Practices](https://hono.dev/docs/guides/best-practices)
- Łaczek (LinkedIn) — [Ports and adapters: how to avoid cargo cult](https://www.linkedin.com/pulse/ports-adapters-architecture-how-avoid-cargo-cult-in-memory-%C5%82aczek-tmoif)
- HN thread — [A Critique of "Clean Architecture" by Robert C. Martin](https://news.ycombinator.com/item?id=16058979)
- Sairyss — [Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon)
- 0x5.uk — [What is Hexagonal Architecture](https://0x5.uk/2023/09/28/what-is-hexagonal-architecture/)
- Gary Bernhardt — Boundaries (SCNA 2012) / [Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell)
- d4dummies — [Discord's architecture analysis](https://d4dummies.com/architecting-for-hyperscale-an-in-depth-analysis-of-discords-billion-message-per-day-infrastructure/)
- Pustelnik — [Reverse engineering Linear](https://pustelto.com/blog/reverse-engineer-linear-1-header/)
- ByteByteGo — [How Linear Implemented Multi-Region](https://blog.bytebytego.com/p/how-linear-implemented-multi-region)
