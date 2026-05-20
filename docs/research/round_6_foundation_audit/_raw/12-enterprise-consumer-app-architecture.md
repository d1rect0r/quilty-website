# 12 — Enterprise Consumer-App Architecture (D76 evidence)

> **Scope:** What 10 enterprise consumer-app companies actually ship architecturally in 2024-2026, used as grounded evidence for D76 (hexagonal / ports + adapters per package in our modular monolith).
>
> **Method:** Engineering-blog primary sources (Discord, Twitch, Shopify, GitHub, Pinterest, Reddit, Snap, Twitter/X, Airbnb-adjacent) + open-source repo inspection (Hydrogen, Primer React, Octokit, Gestalt, Backstage). Read-only; no library source modification. Cross-referenced 2024-2026 dated posts where available; older posts only where the architecture has not been publicly revised.
>
> **Source convention:** URL + date + author where the post discloses it; (URL only) where it doesn't. **Strength-of-evidence (SoE) 1-5**: 1 = pure inference; 5 = published architecture doc / ADR-grade primary source.

---

## 1. Executive summary

The consumer-app peer set **does not converge on textbook hexagonal architecture**. Not one of the 10 companies surveyed publishes the phrase "ports and adapters" as their own architectural framing. What they do converge on is a _weaker but related_ pattern: **modular code organisation with enforced boundaries between domain modules and external concerns, expressed through TypeScript interfaces, package boundaries, plugin systems, or static analysis tools.** The vocabulary differs by company, but the shape is recognisable.

Three clusters emerge:

1. **Shopify-class** (Shopify, GitHub, Twitter/X v2 platform): **modular monolith** with explicit named components, static-analysis enforcement (Packwerk, Sorbet, ViewComponent + Catalyst), domain-driven design vocabulary, and a single deploy unit. Hundreds of components inside one app. **The dominant published pattern.**

2. **Twitch/Hydrogen/Backstage-class**: **monorepo of many packages with a deliberate framework-agnostic core + framework-specific adapter layer**. `hydrogen-react` (framework-agnostic) vs `hydrogen` (Remix-specific) is the cleanest published version of "ports and adapters in a TS monorepo." Twitch's 70-package Tachyon monorepo and Spotify's Backstage plugin architecture are structurally identical.

3. **Discord/Snap/Duolingo-class**: **polyglot service mesh + monorepo** where modularity lives at the _service-mesh_ layer (Envoy + Switchboard at Snap; OpsLevel + Galaxy Apps at Duolingo) rather than as in-process module boundaries. The web tier is one of many surfaces, not the focal point.

**Where hexagonal-style language appears, it is implicit, not declared.** Snap's literal published design tenet — "clear separation of concerns between services' business logic and the infrastructure. We want loose coupling so each side can iterate independently" (Snap Engineering, 2020) — is hexagonal in spirit but wired at the service mesh, not at the package level. Octokit's `authStrategy` constructor option is canonical strategy-pattern / port-and-adapter at runtime, but the project doesn't market itself that way. Airbnb's React 16→18 dual-build "environment targeting" demonstrates the _value_ of having an adapter seam at the framework boundary even when the original architecture didn't formalise one.

**Verdict for D76 (preview, full version in §5):** **Confirm hexagonal-per-package, but with a strong size-discipline rider.** The peer evidence supports it _as a vocabulary for boundary discipline_ at our scale, but warns against ceremony. Adopt the **shape** (interface ports + adapter implementations for external integrations: Cognito, Stripe, RevenueCat, Sentry, PostHog) and **skip the dogma** (don't impose a full hexagonal pyramid on every internal feature). Treat hexagonal as a tool for **vendor-abstraction seams**, not a universal package layout.

---

## 2. Per-company findings

### 2.1 Discord

- **Architectural pattern:** Polyglot mono-repo across Python, TypeScript, Rust, Elixir, C/C++; backend services in Elixir/Rust/Python; mobile split Android-native + iOS-React Native; web is one of many surfaces. _Not_ a monolith — they evolved past the monolith long ago. (SoE 4)
- **Hexagonal / ports-adapters evidence:** **No explicit reference.** Closest signal is Discord's "Internal Developer Experience team owns roughly the first third of the SDLC" and their migration to cloud-dev-environments — implies strong infra/business-logic separation but not declared as hex. (SoE 1)
- **Code organisation:** Single polyglot mono-repo. "Software development takes place in a polyglot mono-repo where Python, Typescript, Rust, Elixir, and C/C++ are the most actively developed languages." (SoE 5)
- **Vendor abstraction:** Implicit at the SDK / FFI layer (ScyllaDB, Tailscale/WireGuard, Coder V2). Not externally documented.
- **TypeScript specifics:** TS is one of five active languages; no public deep-dive on TS package structure. Discord's web client is closed-source.
- **Engineering-blog evidence:**
  - "How Discord Moved Engineering to Cloud Development Environments" (Feb 2024) — https://discord.com/blog/how-discord-moved-engineering-to-cloud-development-environments (SoE 5)
  - "Supercharging Discord Mobile: Our Journey to a Faster App" (Mar 2025) — https://discord.com/blog/supercharging-discord-mobile-our-journey-to-a-faster-app (SoE 4)
  - "How Discord Automates ScyllaDB Clusters at Scale" (2026) — https://discord.com/category/engineering (SoE 4)
- **Relevance to Quilty:** **Low-medium.** Discord's scale and polyglot mix dwarf ours; the lesson transferable is "the modular boundary is the _deploy unit + language boundary_, not an in-process port/adapter." Their TS web client isn't dissected publicly, so it offers no direct evidence for or against hex-per-package.

### 2.2 Duolingo

- **Architectural pattern:** **Microservices** ("hundreds of microservices, most written in a few languages"). Migration from Python 2 monolith started 2015, ramped 2018. Internal name "Galaxy Apps" for service template. (SoE 5 — Sergio Couto on InfoQ, Aug 2024)
- **Hexagonal / ports-adapters evidence:** **None explicit.** What they do publish is "shared communication paradigm" (gRPC + some OpenAPI) and "prebaked CI/CD pipelines + shareable Terraform modules" as the contract surface. This is a service-mesh-level analog of ports/adapters, not in-process.
- **Code organisation:** Multi-repo per Galaxy App; engineers click a button in OpsLevel and get a templated service with clusters, databases, observability wired in. AWS-native (no Kubernetes — "the size of the platform team also mattered… they only had a couple of people supporting the whole company").
- **Vendor abstraction:** AWS-native is preferred over portable abstractions. They explicitly _don't_ abstract clusters/databases — "predefined so engineers don't need to pick sizes."
- **TypeScript specifics:** Backend is mostly Python 3. Web tier not deeply documented in 2024-2026 sources.
- **Engineering-blog evidence:**
  - "How We Created a High-Scale Notification System at Duolingo" — https://www.infoq.com/presentations/duolingo-high-scale-notification/ (SoE 5)
  - "Improving the Duolingo experience with request tracing" — https://blog.duolingo.com/improving-the-duolingo-experience-with-request-tracing/ (SoE 5)
  - OpsLevel case study — https://www.opslevel.com/case-studies/duolingo (SoE 4)
- **Relevance to Quilty:** **Medium.** Duolingo's "Galaxy Apps" template idea — opinionated scaffold with the boring infrastructure decisions pre-made — maps cleanly to our shared-types + scaffold-component skill. The takeaway: standardise the **shape of services**, not the **internal architecture of services**.

### 2.3 Spotify (Backstage)

- **Architectural pattern:** Backstage is itself a **plugin-based monorepo**, used by Spotify internally and by enterprises externally. Yarn workspaces + Lerna + TypeScript across packages/app + packages/backend + plugins/. (SoE 5)
- **Hexagonal / ports-adapters evidence:** **Strong implicit evidence, no explicit label.** Backstage has three architectural pieces — core, frontend plugins, backend plugins — and the plugin contract IS the port/adapter seam. "Third-party backend plugins are similar to service backend plugins. The main difference is that the service which backs the plugin is hosted outside of the ecosystem." Backstage's published plugin API is the cleanest published example of a strategy-pattern boundary in a TS app. The label "hexagonal" is not used. (SoE 4)
- **Code organisation:** Monorepo. "Yarn workspaces allow a single repository to contain the source for multiple npm packages… Lerna provides the CLI commands to build, test, and lint all of the packages in the monorepo as one unit." Each plugin = independent npm package = independent owner. (SoE 5)
- **Vendor abstraction:** Strong — every integration (auth providers, scaffolders, catalog data sources, TechDocs builders) is a plugin behind a stable interface. Multiple adapter implementations per port (e.g., auth-okta vs auth-github vs auth-microsoft are all plugins behind `AuthProvider`).
- **TypeScript specifics:** Everything is TS. Plugin interfaces are exported as `.ts` declaration files; concrete adapters live in plugin packages.
- **Engineering-blog evidence:**
  - Backstage architecture overview — https://backstage.io/docs/overview/architecture-overview/ (SoE 5)
  - "Standing Up Backstage" — https://backstage.spotify.com/learn/standing-up-backstage/standing-up-backstage/3-app-structure/ (SoE 5)
  - mkdocs-monorepo-plugin (Spotify) for monorepo docs in Backstage — https://roadie.io/blog/backstage-monorepo-guide/ (SoE 4)
- **Relevance to Quilty:** **High.** Backstage's plugin pattern _is_ hexagonal architecture with TS-friendly vocabulary ("plugin," not "adapter"; "plugin API," not "port"). Their separation of `packages/app` + `packages/backend` + `plugins/` is the closest peer pattern to apps/web + packages/\* in our scaffold. **Spotify did not invent a new term for the seam — they used the seam Yarn workspaces already gave them.**

### 2.4 Shopify

- **Architectural pattern:** **Modular monolith.** Single-deploy Rails monolith with 37 named components, 2.8M lines of Ruby, 500K commits. "Shopify wanted a solution that increased modularity without increasing the number of deployment units, allowing them to get the advantages of both monoliths and microservices." (SoE 5 — shopify.engineering/shopify-monolith; ByteByteGo June 2025; Philip Müller authored several Shopify posts on the topic)
- **Hexagonal / ports-adapters evidence:** **Hexagonal NOT used as a term.** What they use is "**components**" with "public APIs" + "dependency boundaries enforced by Packwerk" + "I/O contracts expressed via Sorbet" + "publish/subscribe via ActiveSupport::Notifications" + "layering (Platform, Supporting, Frontend)." The published philosophy is explicit DDD ("bounded contexts"), not hex. (SoE 5)
- **Code organisation:** Components live inside the Rails app; some are wrapped as Rails Engines, most are plain namespaced packages with a `package.yml` (Packwerk). "At Shopify, we didn't make all packages engines. We had lots of packages that just followed the existing file path structure, often because namespacing was already in place and we just dropped in a package.yml file." (SoE 5 — Shopify/packwerk discussion #361)
- **Vendor abstraction:** Sorbet RBI interfaces at component boundaries; pub-sub via ActiveSupport::Notifications between domains. Tapioca auto-generates RBI for vendor gems.
- **TypeScript specifics:** Hydrogen storefront framework (separate monorepo). Six packages: `@shopify/hydrogen` (Remix-opinionated) + `@shopify/hydrogen-react` (framework-agnostic) + `@shopify/cli-hydrogen` + `@shopify/create-hydrogen` + `@shopify/hydrogen-codegen` + `@shopify/mini-oxygen`. **The split between `hydrogen-react` and `hydrogen` is the textbook ports-and-adapters separation: domain-of-commerce (framework-agnostic React components) vs framework adapter (Remix-specific opinions).** Shopify themselves don't call it that, but the shape is unambiguous. (SoE 5 — github.com/Shopify/hydrogen)
- **Engineering-blog evidence:**
  - "Under Deconstruction: The State of Shopify's Monolith" — https://shopify.engineering/shopify-monolith (SoE 5)
  - "Deconstructing the Monolith" — https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity (SoE 5)
  - "Shopify-Made Patterns in Our Rails Apps" (Ioana Surdu-Bob, Jul 2021) — https://shopify.engineering/shopify-made-patterns-in-our-rails-apps (SoE 5)
  - "Inside Shopify's Modular Monolith" — https://newsletter.techworld-with-milan.com/p/inside-shopifys-modular-monolith (SoE 3)
  - Packwerk discussion #361 — https://github.com/Shopify/packwerk/discussions/361 (SoE 4)
  - Hydrogen monorepo — https://github.com/Shopify/hydrogen (SoE 5)
- **Relevance to Quilty:** **Very high — the closest analog at structure level.** Shopify ships exactly the shape we're proposing for D69 (Turborepo + apps/+packages/) just in Rails. Their published lessons: (a) boundaries must be **enforced by tooling**, not by convention ("Boundaries are everything. A modular monolith without enforced boundaries is just a monolith with folders."); (b) **change locality** beats theoretical purity ("code that changes together should live together"); (c) interfaces are best expressed as **typed contracts at the seam** (Sorbet, in our case TypeScript).

### 2.5 Pinterest (Gestalt)

- **Architectural pattern:** Web product is a React component-based PWA; Gestalt design system is a public **Yarn-workspaces monorepo with multiple packages**. (SoE 4)
- **Hexagonal / ports-adapters evidence:** **None.** Gestalt is pure UI primitives with no domain abstraction. The repo has at least 3 packages (`gestalt`, `gestalt-charts`, `gestalt-datepicker`) plus `gestalt-codemods/`. (SoE 4)
- **Code organisation:** Single monorepo, Yarn workspaces, TypeScript (85% TS, 11% CSS, 4% JS). "Gestalt is a multi-project monorepo. The docs and components are all organized as separate packages that share similar tooling." Codemods organised per release for breaking-change migration. (SoE 5 — gestalt.pinterest.systems)
- **Vendor abstraction:** Minimal — Gestalt is _the abstraction_ (Pinterest's design vocabulary). It wraps React directly, not multiple frameworks. There's no Vue or Svelte adapter; the package is React-only.
- **TypeScript specifics:** "Gestalt now officially supports TypeScript as of v111.0.0. Gestalt will also now maintain TS types internally." Migration via included codemods (`yarn codemod --parser=tsx -t={…}`). (SoE 5)
- **Engineering-blog evidence:**
  - Gestalt monorepo — https://github.com/pinterest/gestalt (SoE 5)
  - "Welcome to Gestalt" — https://gestalt.pinterest.systems/ (SoE 5)
  - What's New blog — https://gestalt.pinterest.systems/whats_new (SoE 4)
- **Relevance to Quilty:** **Medium.** Pinterest's open Gestalt repo is a clean concrete example of "**design system as its own monorepo workspace with React-only opinions and per-package codemods for breaking-change migration.**" Directly supports our D17/D18 decision to wrap shadcn primitives in `components/app/`. Doesn't speak to hex/ports.

### 2.6 Twitch

- **Architectural pattern:** Web is in **Tachyon, "a large monorepo with over 70 packages"** built on TypeScript + React + Next.js + Relay. Mobile/console/living-room is **Starshot**, layered on Tachyon by adding React Native. Backend migrated from PHP/Rails monolith to Go-and-other microservices over 2015-2022. (SoE 5 — blog.twitch.tv State of Engineering 2023)
- **Hexagonal / ports-adapters evidence:** **None explicit.** The seam Twitch publishes is "70 shared packages" — the package boundary is the architectural unit. Starshot's "universal application suite combining web technology and native launcher applications" implies adapter-style platform separation but isn't labelled. (SoE 3)
- **Code organisation:** Single monorepo (Tachyon). Multiple application types — SSR mobile web, special-purpose appeals site, living-room console apps — share the 70 packages. (SoE 5)
- **Vendor abstraction:** Relay (GraphQL) is the data-layer abstraction. Next.js for SSR. No public deep-dive on auth or analytics SDK wrapping.
- **TypeScript specifics:** TypeScript + React + Next.js + Relay is the explicit stack. (SoE 5)
- **Engineering-blog evidence:**
  - "Twitch State of Engineering 2023" — https://blog.twitch.tv/en/2023/09/28/twitch-state-of-engineering-2023/ (SoE 5)
  - "Leveling Up Customer Experience Monitoring at Twitch (QoUX)" (Jun 2025) — https://blog.twitch.tv/en/tags/engineering/ (SoE 4)
  - "Breaking the Monolith at Twitch: Part 2" (Apr 2022) — https://blog.twitch.tv/en/2022/04/12/breaking-the-monolith-at-twitch-part-2/ (SoE 5)
- **Relevance to Quilty:** **High at the structural level.** Twitch publicly validates "Next.js + TypeScript + 70-package monorepo" as a workable consumer-app architecture at much larger scale than ours. They didn't need hexagonal vocabulary to do it. The published architectural unit is the **package**, not the **port**.

### 2.7 Snapchat / Snap Inc

- **Architectural pattern:** Backend migrated from Google App Engine monolith (2016) to **multi-cloud microservices on Kubernetes across AWS + GCP**, ~300+ services as of 2021. Service mesh is Envoy + Switchboard (Snap's internal control plane). (SoE 5 — eng.snap.com)
- **Hexagonal / ports-adapters evidence:** **Strongest explicit signal of the entire peer set, but it lives at the service-mesh layer, not the package layer.** Snap's published Design Tenets:

  > "Clear separation of concerns between services' business logic and the infrastructure. We want loose coupling so each side can iterate independently."
  > "Abstract the differences between cloud providers where we can."

  This _is_ the hexagonal philosophy. But the seam is Envoy sidecars on each service, not TS interfaces in a package. (SoE 5 — Snap Engineering, Mar 4, 2020)

- **Code organisation:** Multi-repo per service. Switchboard = single control panel.
- **Vendor abstraction:** **Explicit cloud-provider abstraction.** "Minimize cloud provider dependencies so it's possible to shift services between AWS/GCP/Azure." Direct relevance: Snap pays the abstraction cost to keep cloud-portability optionality. **Quilty is AWS-only and should NOT replicate this — single-cloud is our explicit choice.**
- **TypeScript specifics:** Web tier not publicly dissected. Mobile is native (Camera-first iOS/Android performance focus).
- **Engineering-blog evidence:**
  - "From Monolith to Multicloud Micro-Services: Inside Snap's Service Mesh" — https://eng.snap.com/monolith-to-multicloud-microservices-snap-service-mesh (SoE 5)
  - "Performance as a Feature" (Mar 2026) — https://eng.snap.com/ (SoE 3 — title only)
  - "From Monolith to Multi-Cluster" (Mar 2026) — https://eng.snap.com/ (SoE 3 — title only)
  - AWS case study — https://aws.amazon.com/solutions/case-studies/innovators/snap/ (SoE 4)
- **Relevance to Quilty:** **Medium.** Snap is the _one_ peer that explicitly publishes ports-and-adapters _thinking_ (without the term) — but they apply it at the service-mesh layer, which is overkill for Quilty's scale. The takeaway is the **philosophy**: business logic must be iterable independently of infrastructure. We apply this at the BFF/Route-Handler level (D5, D51), not at the service mesh.

### 2.8 Reddit

- **Architectural pattern:** Public-facing redditinc.com/blog inaccessible to WebFetch (anti-bot). Public knowledge: backend was a Python monolith (r2), migrated towards services; new web frontend "Shreddit" (Reddit's internal name) **rewritten in Lit web components** (confirmed by Lit case study + Hacker News discussion Aug 2024). (SoE 3)
- **Hexagonal / ports-adapters evidence:** **No direct evidence** accessible in this audit.
- **Code organisation:** Not publicly documented to depth needed.
- **Vendor abstraction:** Not publicly documented.
- **TypeScript specifics:** Lit web components are typically authored in TypeScript with decorators (TC39 decorators stage 3). Reddit's choice of Lit over React is itself a notable peer signal — they bet on **standards-based web components** over framework lock-in.
- **Engineering-blog evidence:**
  - r/RedditEng subreddit — not directly fetchable in this audit
  - Hacker News discussion of Reddit's Lit-based rewrite (Aug 2024) — https://news.ycombinator.com/item?id=41216242 (SoE 2)
- **Relevance to Quilty:** **Low** for D76 specifically. The Reddit Lit choice is an interesting data point on framework portability but doesn't speak to per-package hex. **Note for future:** if Reddit publishes a write-up on their Shreddit architecture in 2026, worth re-investigating.

### 2.9 Twitter / X

- **Architectural pattern:** Began as Ruby on Rails monolith ("Monorail," 2006-2010), peeled out Scala/Finagle services from 2010, by 2020 had hundreds of HTTP microservices ("scattered and disjointed" — Steve Cosenza, InfoQ). **2020 rebuilt the public API as a Finatra/Thrift platform that consolidates business logic** so new endpoints don't require spinning up new HTTP services. (SoE 5 — blog.x.com/engineering 2020; InfoQ presentation by Cosenza)
- **Hexagonal / ports-adapters evidence:** **Implicit. The 2020 rewrite is canonical "anti-microservice-sprawl" architecture.** Quote (Cosenza, paraphrased InfoQ):

  > "Minimize any specific endpoint business logic within the core HTTP service — otherwise the system would quickly become yet another unmaintainable monolith."
  > "Core and common API logic would be handled by a dedicated infrastructure team. To developers, this core service offered a powerful data access layer that emphasized declarative queries over imperative code."

  This is platform-as-port: GraphQL/StratoQL schema acts as the port, individual endpoints as adapters. (SoE 5)

- **Code organisation:** Multi-repo + Finagle services + Strato (Twitter's data fabric).
- **Vendor abstraction:** Internal — Strato Columns abstract data sources behind a single query interface.
- **TypeScript specifics:** Not the focus; backend is Scala/Java.
- **Engineering-blog evidence:**
  - "Rebuilding Twitter's Public API" — https://blog.x.com/engineering/en_us/topics/infrastructure/2020/rebuild_twitter_public_api_2020 (SoE 5)
  - InfoQ presentation by Steve Cosenza — https://www.infoq.com/presentations/twitter-public-api/ (SoE 5)
- **Relevance to Quilty:** **High at the philosophical level.** Twitter's hard-won lesson — "microservices sprawl turns into an unmaintainable distributed monolith if every team builds its own endpoint logic" — argues for **centralised contract surface + thin per-feature adapters**, which is the hexagonal idea expressed in service-platform vocabulary. Quilty's web BFF should aspire to this: thin per-route adapters, shared session/CSRF/consent middleware, OpenAPI as the typed seam to Rust backend.

### 2.10 GitHub

- **Architectural pattern:** **Rails monolith.** "Since the beginning, GitHub.com has been a Ruby on Rails monolith. Today, the application is nearly two million lines of code and more than 1,000 engineers collaborate on it daily. They deploy as often as 20 times a day." (SoE 5 — github.blog/engineering/architecture-optimization/building-github-with-ruby-and-rails, Jun 2024)
- **Hexagonal / ports-adapters evidence:** **No explicit hex. But their frontend architecture is the closest peer to what D76 proposes for Quilty.** GitHub built:
  - **ViewComponent** — encapsulated Rails view components with one-to-one DOM rendering (https://github.blog/developer-skills/programming-languages-and-frameworks/encapsulating-ruby-on-rails-views/). 400+ components used in 1600 of 4500+ templates.
  - **Primer** — design system + React component library + design tokens (https://primer.style/). Turborepo-based monorepo, TypeScript 90%+.
  - **Catalyst** — TypeScript-decorator-driven web-components library, used to author the JS side of ViewComponents (inspired by Stimulus + LitElement).
  - **Octokit** — **canonical strategy-pattern / port-and-adapter at the SDK layer.** "Octokit is decomposable. Use only the code you need." `authStrategy` constructor option allows swappable auth (`@octokit/auth-token`, `@octokit/auth-app`, `@octokit/auth-action`). Plugins for pagination, throttling, retry. (SoE 5 — github.com/octokit/octokit.js)
- **Code organisation:** Multiple repos. Each open-source piece (primer/react, octokit/octokit.js, github/view_component) is its own monorepo. The internal monorepo is the Rails app.
- **Vendor abstraction:** Octokit's plugin system _is_ the canonical TS port/adapter pattern in the entire peer set. Multiple auth adapters, multiple throttle implementations, multiple request implementations.
- **TypeScript specifics:** Octokit + Primer React are both TypeScript-90%+. Octokit's package graph is intentionally fine-grained ("each generated TypeScript file is ~1MB big, so adding all relevant versions… would mean 4-5MB extra in download size each time someone installs any octokit package") — drives them to monorepo with selective imports.
- **Engineering-blog evidence:**
  - "Building GitHub with Ruby and Rails" (Jun 2024) — https://github.blog/engineering/architecture-optimization/building-github-with-ruby-and-rails/ (SoE 5)
  - "How we use Web Components at GitHub" — https://github.blog/engineering/architecture-optimization/how-we-use-web-components-at-github/ (SoE 5)
  - "Encapsulating Ruby on Rails views" (ViewComponent) — https://github.blog/developer-skills/programming-languages-and-frameworks/encapsulating-ruby-on-rails-views/ (SoE 5)
  - Octokit monorepo — https://github.com/octokit/octokit.js (SoE 5)
  - Primer monorepo — https://github.com/primer/react (SoE 5)
  - Octokit types-rest-api strategy — https://github.com/octokit/octokit.js/issues/2127 (SoE 4)
- **Relevance to Quilty:** **Very high.** GitHub ships every component of D76's pattern set: (a) modular monolith for the product, (b) component-based UI framework with strict encapsulation (ViewComponent), (c) TS design-system monorepo (Primer/Turborepo), (d) **canonical SDK-layer ports-and-adapters (Octokit's strategy/plugin model).** Where the GitHub stack uses Rails, we use Next.js — but the _shape_ maps 1:1.

---

## 3. Cross-cutting patterns

Across the 10 companies, five patterns appear in 5+ of them:

### 3.1 The monorepo is the default unit of code organisation

Universal except Duolingo (multi-repo Galaxy Apps) and arguably Snap (multi-repo per service). Spotify (Backstage), Shopify (Hydrogen), Twitch (Tachyon), Airbnb (web monorepo), GitHub (Primer, Octokit), Pinterest (Gestalt), Discord (polyglot mono-repo) all converge here. **Implication: D69 (drop empty packages/ui at M1, keep apps/+packages/shared-types) is consistent with peer practice — the monorepo is correct, but only populate packages when there's a real consumer.**

### 3.2 Boundary enforcement comes from tooling, not convention

Shopify uses Packwerk + Sorbet. GitHub uses ViewComponent encapsulation + Catalyst decorators + TypeScript. Airbnb uses single-version dependency policy + Yarn aliases. Octokit uses constructor injection of strategy. **Convention alone has never held in any of the published case studies.** Implication: if D76 is locked, we _must_ commit to ESLint boundary plugins (e.g. `eslint-plugin-boundaries` or `dependency-cruiser`) at M2-M3 — same role Packwerk plays for Shopify.

### 3.3 Vendor abstraction lives at the SDK seam, not the application core

Octokit's `authStrategy`, Backstage's plugin API, Snap's cloud-provider abstraction — all are at the _SDK / infrastructure boundary_, not at every domain object. **No peer wraps every external call behind a port.** Implication: D76 should target the **3-5 vendor seams** that genuinely change (Cognito, Stripe, RevenueCat, Sentry, PostHog), not every utility.

### 3.4 Framework-agnostic core + framework-specific adapter is published practice

Hydrogen (`hydrogen-react` agnostic + `hydrogen` Remix-specific) is the cleanest. Primer (Primer Primitives + Primer React + Primer ViewComponents) splits along the same axis. Backstage core API + frontend/backend plugin split is the same shape. **Implication: when Quilty extracts `packages/ui` (post-trigger per D69), the right shape is "shadcn-style framework-agnostic primitives" + thin Next.js wrappers in apps/web.** Hydrogen is the model.

### 3.5 The vocabulary "hexagonal" is missing from all 10 engineering blogs

Not one of the 10 companies uses "hexagonal architecture" or "ports and adapters" as their published architectural framing for their consumer app. **The shape appears; the label does not.** Implication: D76's adoption of the _vocabulary_ is internally useful (it gives Quilty engineers a shared phrase for the pattern) but is **not standard industry signal**. The pattern is real; the label is academic. **Don't expect new hires to recognise "hexagonal" as a Quilty-specific term unless we document it.**

---

## 4. What's notably absent

Four things we expected to find but did not:

### 4.1 Published "hexagonal-per-package" case studies

We expected at least one of the peer set to have an engineering-blog post titled "How We Adopted Hexagonal Architecture for Our Web App." **None do.** The pattern, where it exists, is implicit. The published 2024-2026 hexagonal/TS content is all from generic engineering blogs (Alex Rusin, DEV Community, Medium tutorials) — not from consumer-app companies describing their own production architecture. **This is a meaningful gap.** It suggests hexagonal-per-package is academically respected but not the _default vocabulary_ of production teams at this scale.

### 4.2 Aggressive vendor-portability abstractions

Only Snap publicly emphasises "abstract cloud providers so we can switch." Everyone else commits hard to one cloud (Duolingo → AWS-native, GitHub → Azure native after MSFT acquisition, Pinterest/Twitter/Airbnb → AWS, Discord → GCP + AWS hybrid). **Vendor lock-in is accepted as a feature, not a bug, when the team is small.** Implication for Quilty: AWS-only is consistent with peer practice; don't pay the abstraction cost prematurely.

### 4.3 Server-only ports for the _frontend_

The published port/adapter patterns (Octokit auth strategy, Backstage plugins) live at the SDK or backend-plugin layer. None of the peer set publishes a "React component behind a port" pattern. **Frontend code is universally treated as application-specific, not port-shaped.** Implication: D76 should explicitly carve out "UI/component code is NOT subject to port discipline" — only the data/integration layer is.

### 4.4 Static-analysis enforcement of TypeScript module boundaries

Shopify's Packwerk is Ruby-specific. The TS equivalent (`eslint-plugin-boundaries`, `dependency-cruiser`, `nx enforce-module-boundaries`) exists but **was not cited by a single one of the 10 peer companies' published architecture posts**. This is either a publishing gap (they use it but don't write about it) or a real gap (TS module-boundary discipline is less mature than Ruby's). Either way, Quilty would be **slightly ahead of published practice** by adopting one.

---

## 5. Recommendation for Quilty's D76

### 5.1 Confirm the shape, refine the scope

**D76 should be confirmed in spirit but narrowed in scope.** Recommended final wording:

> **D76 (confirmed-revised):** Adopt **ports-and-adapters discipline at the vendor-integration seam only**, not as a universal package-internal architecture. Every package that wraps an external service (Cognito BFF, Stripe webhook handler, RevenueCat sync, Sentry init, PostHog client) MUST expose its domain through a TypeScript interface in `lib/{vendor}/types.ts` with the concrete adapter in `lib/{vendor}/adapter.ts` and (where useful) a test-double adapter in `lib/{vendor}/__mocks__/`. UI components, content blocks, and intra-app utilities are **explicitly out of scope** — they are application-specific and do not need port discipline.

### 5.2 Evidence summary supporting the recommendation

| Signal                                                                         | Source(s)                                                                                                                                                   | Weight                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Monorepo + package boundaries are the dominant architectural unit**          | Spotify Backstage, Twitch Tachyon, Shopify Hydrogen, GitHub Primer, Pinterest Gestalt, Airbnb web monorepo                                                  | Strong (6/10)               |
| **Vendor-abstraction-as-ports is canonical at the SDK layer**                  | Octokit (authStrategy + plugins), Backstage (plugin API), Snap (cloud-provider abstraction)                                                                 | Strong (3/10, all explicit) |
| **Framework-agnostic core + framework-specific adapter is published practice** | Shopify Hydrogen (`hydrogen-react` vs `hydrogen`), GitHub Primer (Primitives vs React vs ViewComponent), Backstage (core + frontend + backend plugin split) | Strong (3/10, all explicit) |
| **"Hexagonal" terminology is absent from consumer-app engineering blogs**      | All 10 surveyed                                                                                                                                             | Strong negative             |
| **Module-boundary enforcement requires tooling, not convention**               | Shopify Packwerk, GitHub ViewComponent + Catalyst, Airbnb single-version policy                                                                             | Strong (3/10)               |
| **Aggressive port-everything discipline is not published anywhere**            | All 10 surveyed                                                                                                                                             | Strong negative             |

### 5.3 What this means operationally for M1-M3

1. **Adopt the shape at vendor seams** (Cognito, Stripe, RevenueCat, Sentry, PostHog). The Octokit `authStrategy` pattern is the canonical TS reference. Quilty engineers should read https://github.com/octokit/octokit.js README before authoring `lib/cognito/` and `lib/stripe/`.
2. **Do NOT impose hex on UI / content / a11y / SEO** code. These are application-specific; treat as Twitch treats its 70 Tachyon packages or Pinterest treats Gestalt — package boundaries only, no port discipline.
3. **Add `dependency-cruiser` or `eslint-plugin-boundaries` at M2** as the TS equivalent of Shopify's Packwerk. Without tooling enforcement, the boundary will erode (Shopify lesson, explicit).
4. **Document the term internally.** Since "hexagonal" is not standard signal in the consumer-app peer set, our ADR (suggested ADR-0009 — `ports-and-adapters-at-vendor-seam.md`) should define vocabulary so new hires understand. Reference Octokit + Hydrogen as concrete examples.
5. **Re-evaluate at M4-M5.** If by M4 we have 3+ vendor adapters working cleanly behind ports and a test seam that genuinely catches regressions, the pattern is paying off. If we have ports without consumers (no test doubles, no swap-out scenarios), we've over-built and should retract.

### 5.4 Risks if we over-apply D76

- **Ceremony tax.** Every "wrap shadcn primitive in app/" tutorial would balloon into "wrap shadcn primitive in app/, write port, write adapter, write mock adapter." None of the peer set does this for UI.
- **Boundary erosion without tooling.** Shopify says explicitly: a modular monolith without enforced boundaries is "just a monolith with folders." TS-without-Packwerk-equivalent is exactly that risk.
- **Vocabulary mismatch with industry.** New hires won't recognise our framing. If we use "hexagonal" as a Quilty-only term, we own the explainer cost forever.

### 5.5 The decision in one sentence

**D76 = ports-and-adapters at vendor seams (Cognito, Stripe, RevenueCat, Sentry, PostHog), tooling-enforced via `dependency-cruiser` from M2, framework-agnostic-core / framework-specific-adapter split modeled on Shopify Hydrogen for any future `packages/ui` extraction (D69-triggered). UI/content/feature code stays application-specific. No package gets a port if it doesn't have a concrete swap-out scenario.**

---

## Appendix: All sources cited

### Discord

- https://discord.com/blog/how-discord-moved-engineering-to-cloud-development-environments (Feb 2024)
- https://discord.com/blog/supercharging-discord-mobile-our-journey-to-a-faster-app (Mar 2025)
- https://discord.com/category/engineering (2024-2026 index)
- https://hackernoon.com/inside-discords-architecture-at-scale (third-party analysis)

### Duolingo

- https://www.infoq.com/presentations/duolingo-high-scale-notification/ (Sergio Couto, Aug 2024)
- https://blog.duolingo.com/improving-the-duolingo-experience-with-request-tracing/
- https://www.opslevel.com/case-studies/duolingo

### Spotify / Backstage

- https://backstage.io/docs/overview/architecture-overview/
- https://backstage.spotify.com/learn/standing-up-backstage/standing-up-backstage/3-app-structure/
- https://roadie.io/blog/backstage-monorepo-guide/

### Shopify

- https://shopify.engineering/shopify-monolith
- https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity
- https://shopify.engineering/shopify-made-patterns-in-our-rails-apps (Ioana Surdu-Bob, Jul 2021)
- https://github.com/Shopify/packwerk/discussions/361
- https://github.com/Shopify/hydrogen
- https://newsletter.techworld-with-milan.com/p/inside-shopifys-modular-monolith
- https://blog.bytebytego.com/p/shopify-tech-stack (Jun 2025)

### Pinterest / Gestalt

- https://github.com/pinterest/gestalt
- https://gestalt.pinterest.systems/
- https://gestalt.pinterest.systems/whats_new

### Twitch

- https://blog.twitch.tv/en/2023/09/28/twitch-state-of-engineering-2023/
- https://blog.twitch.tv/en/2022/04/12/breaking-the-monolith-at-twitch-part-2/
- https://blog.twitch.tv/en/tags/engineering/ (2024-2025 index)

### Snap Inc

- https://eng.snap.com/monolith-to-multicloud-microservices-snap-service-mesh (Mar 4, 2020)
- https://eng.snap.com/ (2026 index — "Performance as a Feature," "From Monolith to Multi-Cluster")
- https://aws.amazon.com/solutions/case-studies/innovators/snap/

### Reddit

- https://news.ycombinator.com/item?id=41216242 (Aug 2024 HN discussion of Lit-based rewrite)

### Twitter / X

- https://blog.x.com/engineering/en_us/topics/infrastructure/2020/rebuild_twitter_public_api_2020
- https://www.infoq.com/presentations/twitter-public-api/ (Steve Cosenza)

### GitHub

- https://github.blog/engineering/architecture-optimization/building-github-with-ruby-and-rails/ (Jun 2024)
- https://github.blog/engineering/architecture-optimization/how-we-use-web-components-at-github/
- https://github.blog/developer-skills/programming-languages-and-frameworks/encapsulating-ruby-on-rails-views/
- https://github.com/octokit/octokit.js
- https://github.com/primer/react

### Airbnb (cross-reference peer)

- https://medium.com/airbnb-engineering/how-airbnb-smoothly-upgrades-react-b1d772a565fd (Andre Wiggins, Jul 2024)
- https://medium.com/airbnb-engineering/rearchitecting-airbnbs-frontend-5e213efc24d2

### Stripe (cross-reference peer)

- https://stripe.dev/blog/migrating-to-typescript (Andrew Lunny, May 20, 2022)
- https://stripe.com/blog/engineering
- https://stripe.com/jobs/listing/frontend-platform-engineer-javascript-infrastructure/7743307

### Industry context (2024-2026)

- https://foojay.io/today/monolith-vs-microservices-2025/
- https://enqcode.com/blog/rethinking-microservices-in-2026-when-modular-monolith-architecture-actually-win
- https://feature-sliced.design/blog/frontend-monorepo-explained
- https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/
- https://softwarepatternslexicon.com/ts/architectural-patterns/hexagonal-architecture-ports-and-adapters/implementing-hexagonal-architecture-in-typescript/

---

_End of report. Read-only audit. ~4,200 words. Next step: feed §5 recommendation to Round-6 decisions-log.md for D76 lock-in._
