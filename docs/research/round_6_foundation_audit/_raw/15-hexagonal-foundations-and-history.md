# 15 — Hexagonal Foundations and History

> **Evidence document for D76 — "Hexagonal architecture per package in a modular monolith."**
> Round 6 foundation audit. Read-only research. 2026-05-19.
> Author: research agent (Claude Opus 4.7).
>
> Scope: Foundational sources (Cockburn 2005, Palermo 2008, Martin 2012, Vernon 2013, Bernhardt 2012, Fowler), 2024-2026 discourse, variants and cousins (Clean / Onion / Functional Core / Effect-TS / Anti-Corruption Layer), and the question of whether Quilty's D76 framing is still naming the pattern correctly in 2026.

---

## 1. Executive summary (~250 words)

**Is "hexagonal architecture" still the right name for what Quilty is doing?** Mostly yes, with two caveats.

First, the literature consensus is that **Hexagonal (Cockburn 2005)**, **Onion (Palermo 2008)**, **Clean Architecture (Martin 2012)**, and **Explicit Architecture (Graça 2017)** are _variants of the same Dependency-Inversion-Principle (DIP)–based family_. They share the rule "infrastructure depends on the core, never the reverse." A 2025 commentator framed the family as: "Ultimately, nothing new is delivered here … at its core, clean architecture is the same as onion or hexagonal architecture: DIP-based." For D76's purposes — vendor isolation, per-package ports, testable core — any of these names denotes the right pattern. "Hexagonal" is the **oldest and most precise** term, and it's the term Cockburn coined; using it is defensible.

Second, the 2025-2026 discourse is sharpening a distinction that matters for Quilty: most teams who _say_ "hexagonal" are actually running **layered architecture with DI**, not Cockburn's symmetric ports-and-adapters. Steven Stuart-Martin (Sep 2025) bluntly: _"True hexagonal architecture is rare … most systems don't need this level of abstraction."_ Mark Seemann (Apr 2025) explicitly rejects use-case-class layering in favor of "fat adapters" wrapping a functional core. Cockburn himself released a substantially revised second edition (Apr 2024 book + Apr 2025 errata) doubling down on the symmetric, side-agnostic framing.

**Recommendation for D76:** Keep the "hexagonal" name (it's the precise one), but in the ADR (a) cite Cockburn 2005 + Cockburn & Garrido de Paz 2024 explicitly, (b) acknowledge it overlaps with Clean/Onion (so reviewers don't argue terminology), and (c) frame what we are _and aren't_ doing — we are using **ports as vendor-isolation seams** (PostHog, Sentry, Stripe, Cognito), not as runtime-swappable adapters in immutable infrastructure. The "vendor BAA boundary = adapter boundary" framing is HIPAA-aware and survives the Stuart-Martin critique.

---

## 2. Foundational sources

### 2.1 Alistair Cockburn — "Hexagonal Architecture" / "Ports and Adapters" (2005)

**Primary source.** Hosted at `alistair.cockburn.us/hexagonal-architecture`. Originally published as **"HaT Technical Report 2005.02, v 0.9, 2005-09-04"** by Alistair Cockburn (acockburn@aol.com). First discussed years earlier on Ward Cunningham's Portland Pattern Repository wiki (`c2.com/cgi/wiki?HexagonalArchitecture`); renamed from "Hexagonal Architecture" to "**Ports and Adapters (Object Structural)**" in 2005 to emphasize the underlying mechanism.

**Intent statement (verbatim):**

> "Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases."

Key foundational points from the paper and the Wikipedia synthesis of it:

- **Why a hexagon, not a rectangle?** The shape was chosen "not to suggest that there would be six borders/ports, but to leave enough space to represent the different interfaces needed between the component and the external world." A rectangle implied two sides (UI top, DB bottom); a hexagon implies "many sides, all equal."
- **The symmetry claim.** Cockburn's structural innovation is that **driving (primary) and driven (secondary) sides are equal** — the application doesn't "know" whether it's being driven by a human via UI, a test harness, or a batch script; nor whether it's persisting to Postgres, S3, or a test fake. (Vernon paraphrases this: _"With the Hexagonal Architecture, Alistair Cockburn codified a style to produce symmetry. It advances this goal by allowing many disparate clients to interact with the system on equal footing."_)
- **Port.** An abstract protocol/interface defined in the application core, expressed in the core's domain language.
- **Adapter.** A technology-specific implementation that converts an external event/protocol into a port call (driving adapter) or converts a port call into an external API/library call (driven adapter).

**Second edition (April 2024).** Cockburn co-authored **"Hexagonal Architecture Explained"** (ISBN 978-1737519782) with Juan Manuel Garrido de Paz, the maintainer of `jmgarridopaz.github.io` (the canonical hexagonal reference site). An April 2025 errata document (`alistaircockburn.com/hexarch v1.1b DIFFS 20250420-1012 paper+epub.docx.pdf`) shows the pattern is being actively maintained by its creator 20 years later. The 2024 book formalizes terms left ambiguous in 2005:

- "Driving ports" / "Driven ports" (replaces earlier "primary/secondary")
- "Driver adapter" / "Driven adapter"
- Distinction between the **conceptual hexagon** and the **physical deployment** is made explicit

**Martin Fowler's gloss** on hexagonal (from `martinfowler.com/bliki/PresentationDomainDataLayering.html`): _"A common variation is to arrange things so that the domain does not depend on its data sources by introducing a mapper between the domain and data source layers. This approach is often referred to as a Hexagonal Architecture."_ Fowler also noted publicly (and Wikipedia echoes) that he considers the hexagon's symmetry to obscure "the inherent asymmetry between a service provider and a service consumer" — a critique Vernon and Cockburn both push back on.

### 2.2 Eric Evans — _Domain-Driven Design_ (2003)

Evans' 2003 book predates Cockburn's paper by two years and does not use the word "hexagonal." It introduces:

- **Bounded contexts** — logical boundaries around a model, the conceptual unit a per-package modular monolith decomposes into
- **Anti-corruption layer** — translation seam between bounded contexts (or between a bounded context and a legacy / vendor system)
- **Repositories** — interface-in-the-domain, implementation-in-the-infrastructure (which is structurally a port-adapter pair, though Evans doesn't name it that way)

The DDD + Hexagonal pairing was operationalized later by Vernon.

### 2.3 Vaughn Vernon — _Implementing Domain-Driven Design_ (2013), Chapter 4

Vernon's Chapter 4 ("Architecture") is the single most cited bridge between DDD and Hexagonal. The chapter walks through Layered → DIP → Hexagonal → SOA → REST → CQRS → EDA → Event Sourcing → Data Fabric, framing Hexagonal as the natural evolution of layered architecture once you take DIP seriously.

Key Vernon framing (page 125+ in the 2013 edition):

- Hexagonal is "an evolvement of the layered style with two main advantages": (1) it lets you defer infrastructure decisions (e.g., what persistence to use) without blocking feature work; (2) "thinking in terms of ports and adapters makes it easier to use the same internal API for different kinds of clients."
- An EDA can be **derived** from hexagonal "with each bounded context as a hexagon, publishing and subscribing to events" — this is the textual root of the modern "modulith = per-module hexagon" pattern.
- Vernon recommends placing application services (use cases) **at the boundary** between driving adapters and the domain, which is the lineage that Onion and Clean later formalize.

### 2.4 Jeffrey Palermo — Onion Architecture (2008)

Original post: `jeffreypalermo.com/2008/07/the-onion-architecture-part-1/`, **published 2008-07-29**.

Palermo's stated rationale: _"The biggest offender (and most common) is the coupling of UI and business logic to data access … decoupling the application from the database, file system, etc, lowers the cost of maintenance for the life of the application."_

He explicitly acknowledges Cockburn: both approaches _"share the following premise: Externalize infrastructure and write adapter code so that the infrastructure does not become tightly coupled."_

**What Onion adds to Hexagonal:** explicit concentric **layers inside the hexagon** — Domain Model → Domain Services → Application Services → Infrastructure/UI — with the inward-only dependency rule. Onion is what you get when you accept Cockburn's outer boundary _and_ Evans' DDD layers, then draw them as concentric circles instead of a hexagon. (One 2024 synthesis: _"Onion architecture no longer makes an explicit statement about how the dependency direction is to be achieved in terms of software technology."_)

### 2.5 Robert C. Martin — Clean Architecture (2012)

Original essay: `blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html`, **published 2012-08-13**.

Martin's essay opens by explicitly synthesizing four prior architectures:

- **Hexagonal Architecture (Ports and Adapters)** — Cockburn
- **Onion Architecture** — Palermo
- **DCI (Data, Context, Interaction)** — Coplien & Reenskaug
- **BCE (Boundary, Control, Entity)** — Jacobson

The Dependency Rule (verbatim from the essay): _"source code dependencies can only point inwards. Nothing in an inner circle can know anything at all about something in an outer circle."_

The four canonical concentric circles (inside → out):

1. **Entities** — enterprise-wide business rules
2. **Use Cases** — application-specific business rules
3. **Interface Adapters** — MVC controllers, presenters, gateways (the layer that translates between use-case-shaped data and framework-shaped data)
4. **Frameworks and Drivers** — databases, web frameworks, devices

Note that **"Interface Adapters" is Martin's renaming of Cockburn's adapters**. The substantive difference between Clean and Hexagonal is that Clean _names_ the use-case layer explicitly (Hexagonal leaves it implicit inside the hexagon) and _names_ the entity layer (Hexagonal puts everything inside the hex as "the application").

The Clean Code Akademie summary captures the consensus: _"At its core, clean architecture is the same as onion or hexagonal architecture: DIP-based."_

### 2.6 Gary Bernhardt — "Functional Core, Imperative Shell" / "Boundaries" (SCNA 2012)

Bernhardt's 2012 SCNA talk ("Boundaries") introduced the **Functional Core, Imperative Shell** pattern. It's adjacent to but distinct from Hexagonal:

- **Functional core**: pure functions, no dependencies, encapsulates _all the decision logic_. "Many fast unit tests."
- **Imperative shell**: thin layer that wires the core to side effects (DB, network, time, randomness). "Few integration tests."

Bernhardt has stated the FC/IS concept is _inspired by_ Ports & Adapters but applied at a finer grain — "dealing with functions, not services." Where Hexagonal partitions by _interface boundaries between components_, FC/IS partitions by _purity boundaries within a component_. The two compose: a hexagonal adapter can itself be implemented as an Impureim Sandwich (Seemann's term) — impure read → pure transform → impure write.

### 2.7 Martin Fowler bliki — incidental but influential

Fowler's `PresentationDomainDataLayering` post is the most-cited bliki entry on layering. His position:

- Three-layer (presentation / domain / data) is the _baseline_.
- Hexagonal is a "common variation" where the domain doesn't depend on data sources.
- **Critical warning:** don't organize _teams_ by layer. "Developers don't have to be full-stack but teams should be."
- For large systems, the three-layer split should be _inside_ domain-oriented modules, not the top-level structure.

That last point — "domain-oriented modules with internal layering" — is exactly the **modular monolith with per-module hexagons** pattern that has become dominant in 2024-2026.

---

## 3. The 2024-2026 discourse

### 3.1 The "is it still relevant?" debate

The discourse has converged on a nuanced position:

**Pro-relevance (Slimen Arnaout, Medium, 2025-06-26):** _"Is Hexagonal Architecture Still Relevant in 2025? Absolutely."_ Four advantages cited: testability, flexibility, maintainability, compatibility with DDD/microservices/clean/EDA. Acknowledges over-engineering risk for MVPs.

**Skeptical (Yash Batra, Medium, 2026-02):** _"Hexagonal Architecture in Java Is Over-Engineered — Until You Hit Your First Rewrite."_ The thesis: in greenfield it feels burdensome because "interfaces don't demo well, replaceability doesn't show up on dashboards," but the value materializes when you have to swap a database / queue / framework.

**Sharply skeptical (Steven Stuart-Martin, 2025-09-29):** _"Are You Using Hexagonal Architecture, or Just Dependency Injection?"_ This is the most important 2025 critique. Verbatim:

> "Layered architecture with dependency injection is what most teams build. They use framework DI with repository interfaces, achieve testability and decoupling through standard framework patterns, and organize code in traditional layers. They might call interfaces 'ports' but the mental model is still layered, not symmetric."

> "True hexagonal architecture is rare. It requires explicit symmetry where UI and database adapters are interchangeable external actors, multiple driving mechanisms treated as equals, and actual runtime adapter swapping. Most systems don't need this level of abstraction."

> "Modern deployment practices use immutable containers with dependencies baked in at build time. You don't swap adapters at runtime; you deploy new container images through CI/CD pipelines, which contradicts immutable infrastructure principles."

Stuart-Martin's core claim: **most "hexagonal" projects are really layered-with-DI, and that's fine** — but call it what it is. The structural symmetry that makes hexagonal _hexagonal_ (vs. layered) is what most teams don't actually need.

### 3.2 The modular monolith convergence

The 2024-2026 articles converge on **"module-as-hexagon"** as the dominant pattern:

- **softwarearchitect.id** (2025): two-part series on "Combining Modular Monolith and Hexagonal Architecture while Maintaining DDD Principles" with Go reference implementation.
- **softwareseni.com** (2026-01): "Building Modular Monoliths with Logical Boundaries Hexagonal Architecture and Internal Messaging."
- **artisivf.com** (2024-08-29): "How to build a modular monolith with Hexagonal Architecture?"
- **Atomic Architect, Medium** (2026-02): "Modular Monolith vs Microservices in 2025: Hexagonal, Outbox & CQRS That Scale" — frames modular monolith as the "middle ground between monolith and microservices, with optionality to extract later."

The dominant structural pattern these all recommend:

- One package per **bounded context** (module)
- Each module has `domain/` (entities + value objects + domain services), `application/` (use cases + ports), `adapters/` (primary inbound + secondary outbound)
- Module-level configuration class wires it
- Cross-module communication via **internal messaging / events**, not direct calls
- **Heavy use of package-private visibility**; only ports are public
- "The simplest option is a Maven/Gradle project … beyond start.spring.io … splitting into sub-projects per module (not per layer) becomes preferable as applications grow."

This is the textual lineage Quilty's D76 sits in.

### 3.3 The functional-programming counter-current

A growing strand argues that **Ports & Adapters is the natural shape of functional architecture**:

- **Mark Seemann (ploeh blog)** — wrote _"Functional architecture is Ports and Adapters"_ (2016-03-18); reinforced in _"Dependency inversion without inversion of control"_ (2025-01-27); culminated in _"Ports and fat adapters"_ (2025-04-01).
- Seemann's 2025 framing: "A consistent application of functional architecture seems to lead to Ports and Adapters. It'd go against the grain of FP to have a Domain Model query a relational database. Even if abstracted away, a database exists outside …"
- **Fat adapters** (Seemann, April 2025): Seemann deliberately _rejects_ the canonical hexagonal/clean layering of separate use-case classes, mediators, and application services. He puts substantial logic _into adapters_ (his example has cyclomatic complexity 6 vs. the "Humble Object" ideal of 1) and treats each adapter as an Impureim Sandwich (impure-pure-impure).
- His critique: _"I consider the notion of a technology-neutral Use-case Model to be a distraction"_ — the promised technology neutrality "rarely materializes in practice."

This is a real counter-current that Quilty should be aware of but not necessarily follow — Seemann is writing for solo-author or small-team contexts where the use-case-class boilerplate provides little value.

### 3.4 Effect-TS and Layer-based DI

**Michael Arnaldi's Effect-TS** is the TypeScript functional-programming ecosystem closest to a "modern hexagonal" pattern. It provides:

- **`Context.Tag`** — service interface, structurally equivalent to a port
- **`Layer`** — composable adapter implementation
- **`Effect<R, E, A>`** — typed effect with explicit dependency requirements `R`

The reference repo `jkonowitch/hex-effect` ("A reference implementation of the Hexagonal Architecture for Domain Driven Design. Written in Typescript, built with Effect") shows the pattern in practice:

> "Dependency injection where abstract services are able to be used/passed around in the 'inner' domain/application layers without a clue as to their implementation, typesafe serialization/deserialization via @effect/schema, applications exposing use cases as @effect/rpc routers (platform and transport agnostic descriptions of an application interface), and side effect management (concurrency control, retries, logging, observability, etc.)"

Effect-TS is **not "a newer hexagonal"** — it's a _runtime_ that makes ports/adapters cheap to express in TypeScript. The architectural pattern is still hexagonal; Effect just gives you better tooling. Adopting Effect-TS is a separable decision from D76.

### 3.5 Khalil Stemmler and the TypeScript clean/DDD community

Stemmler's `khalilstemmler.com` is the most widely-cited single resource for TypeScript-flavored Clean / DDD. His key writings (mostly 2019-2020, still actively referenced in 2026):

- _"Clean Node.js Architecture"_ — synthesizes Hexagonal + Onion + Clean for Node/TS
- _"Comparison of Domain-Driven Design and Clean Architecture Concepts"_ — explicit DDD↔Clean mapping (e.g., "Use Cases (Clean) are similar to Application Services (DDD)")
- `stemmlerjs/ddd-forum` — Hacker-News-style reference TypeScript implementation

Stemmler's framing influenced the `Sairyss/domain-driven-hexagon` repo (the de facto TS reference for the pattern). Stemmler's content has not been substantially updated since ~2020 but remains canonical.

**Vladimir Khorikov** (enterprisecraftsmanship.com, _Unit Testing Principles, Practices, and Patterns_, 2020) is the second pillar of the TS/.NET DDD-flavored Clean community. His emphasis is on the **testing-pyramid implications** of hexagonal: pure-domain tests are cheap, integration tests through adapters are expensive — make the domain rich enough that you can rely on the cheap tests.

### 3.6 Herberto Graça — "Explicit Architecture"

Graça's 2017 post _"DDD, Hexagonal, Onion, Clean, CQRS, … How I put it all together"_ (`herbertograca.com/2017/11/16/explicit-architecture-01-...`) is the single most-cited synthesis of all DIP-family architectures. He explicitly notes these patterns _all describe the same thing_ and gives them a unified name: **Explicit Architecture**. Three follow-up posts (2018, 2019) extend it.

For D76, this is the most important secondary citation — it absolves the ADR from having to defend the choice of _which_ DIP-family pattern, because Graça has already shown they're isomorphic.

---

## 4. Variants + cousins

| Pattern                                | Author              | Year                       | Key contribution                                             | Differs from Hexagonal by …                                                                        |
| -------------------------------------- | ------------------- | -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Hexagonal / Ports & Adapters**       | Alistair Cockburn   | 2005 (paper) / 2024 (book) | Symmetric ports; many sides equal                            | (baseline)                                                                                         |
| **Onion**                              | Jeffrey Palermo     | 2008                       | Concentric DDD layers inside the hex                         | Adds explicit Domain Services / Application Services layers                                        |
| **Clean**                              | Robert C. Martin    | 2012                       | Synthesizes Hexagonal + Onion + DCI + BCE; "Dependency Rule" | Names Entities + Use Cases + Interface Adapters + Frameworks explicitly                            |
| **Explicit**                           | Herberto Graça      | 2017                       | Synthesizes everything above                                 | Adds CQRS framing, event-driven hooks                                                              |
| **Functional Core / Imperative Shell** | Gary Bernhardt      | 2012                       | Purity boundary, not interface boundary                      | Partitions within a component, not between                                                         |
| **Impureim Sandwich**                  | Mark Seemann        | ~2018                      | impure-pure-impure structural rule                           | Implementation-level pattern, not architecture-level                                               |
| **Anti-Corruption Layer (ACL)**        | Eric Evans (in DDD) | 2003                       | Translation seam between bounded contexts                    | Pattern _inside_ a hexagonal adapter; how the adapter avoids leaking foreign model into the domain |
| **Effect-TS Layers**                   | Michael Arnaldi     | ~2019-ongoing              | TS runtime for typed effects + composable services           | Not an architecture; a runtime making ports cheap to express                                       |
| **Modular Monolith / Modulith**        | (community, 2017+)  | 2017+                      | Module-per-bounded-context with strict boundaries            | Deployment-level pattern; usually _combined with_ per-module hexagons                              |

**Key relationships for D76:**

- D76 is naming the pattern at the **module-level**: "each module is a hexagon." This is the dominant 2024-2026 framing.
- ACL (anti-corruption layer) is the relevant _vendor-isolation_ pattern _inside_ an adapter — "tying only one or just a few domain objects to some single-responsibility library should be fine. It's way easier to replace a specific library that is tied to one or few objects than a general purpose library that is everywhere" (`Sairyss/domain-driven-hexagon`).
- Functional Core / Imperative Shell and Impureim Sandwich are _compatible_ with hexagonal — they describe how to implement adapters (and the domain) in a functional style.

---

## 5. Context-specific guidance — solo / small / pre-launch

The 2025 discourse has crystallized around clear heuristics:

**Don't reach for hexagonal when:**

- "If you're building a tiny CRUD system with minimal change expected, a simple layered approach might be fine." (multiple sources)
- "For small apps, the added layers might feel like over-engineering, and there's a learning curve, especially for teams unfamiliar with DDD or architectural patterns."
- "For simple CRUD applications or short-lived MVPs, the boilerplate overhead may outweigh the benefits."
- Solo dev unfamiliar with DDD/ports-and-adapters: "will likely spend more time fighting the pattern than benefiting from it."

**Do reach for hexagonal when:**

- Project lifespan **>12 months**: "if the project is expected to live for more than 12 months or integrate multiple third-party services, the pattern pays for itself quickly."
- **Multiple entry points** (web + mobile + API + batch): the symmetry payoff materializes.
- **Multiple third-party integrations** that may need to be swapped or whose vendors may need to be re-evaluated (this is _exactly_ Quilty's PostHog/Sentry/Stripe/Cognito situation).
- **Long-lived domain logic** that will outlive the current framework / database / vendor.

**Practical decision-framework for solo / small teams (synthesized):**

1. **Project lifespan** — Under 12 months / MVP? Skip. Long-lived (Quilty is multi-year)? Consider.
2. **Entry points** — Single web UI only? Likely overkill. Multiple clients (web + mobile + API)? Worth it. (Quilty has web + Flutter mobile + Rust backend — multiple clients of the domain.)
3. **Domain complexity** — Simple CRUD? YAGNI. Complex business rules (consent, subscriptions, mental-health journey state)? The decoupling pays off.
4. **Team familiarity** — A team that knows the pattern can apply it without friction; an unfamiliar team will spend more time fighting it.

**Lighter alternatives often suggested:**

- **Vertical slices** (Jimmy Bogard) — organize by feature, not layer
- **Functional Core / Imperative Shell** — get most of the testability benefit with less ceremony
- **"Just DI"** — accept Stuart-Martin's point: layered architecture with DI gets you 80% of the benefit at 20% of the ceremony, and many teams shouldn't bother with the rest

---

## 6. HIPAA-aware perspective

**The compliance literature does not name "hexagonal" explicitly**, but the _recommended practices_ map cleanly onto it.

### 6.1 What HIPAA/BAA literature recommends (and how it maps to hexagonal)

- **Vendor BAA boundaries.** "The BAA defines responsibility boundaries: providers handle physical security and baseline services while you configure access controls, encryption, and monitoring." Every vendor that _touches PHI_ needs a signed BAA. **Structural implication:** every vendor SDK / API integration is a candidate adapter boundary, because the legal boundary needs to match a code boundary. (Airbyte HIPAA guide, 2025.)
- **Compliance by design, not bolt-on.** "Designing a HIPAA-compliant telehealth platform is not about layering security tools on top of a finished product. It is an architectural discipline that must be embedded into the system's DNA from the first whiteboard session." (Mishra, DEV, 2025.)
- **Architectural isolation.** "Designing a secure data stack starts with architecture, not tooling. When you separate where data flows from how it's orchestrated, limit every pathway to outbound-only traffic, and wrap the entire stack in strong secrets management, encryption, logging, and access controls, compliance becomes the default."
- **Audit logging at every seam.** "Audit readiness is built into operations. Logging is structured for traceability, not just volume. Signals from identity, APIs, and data access are correlated into one view." **Structural implication:** adapters are the natural place to emit audit events — every PHI-touching adapter call should produce a structured audit log.
- **Shared-responsibility model.** "The cloud provider guarantees the security _of_ the cloud … the architect is responsible for security _in_ the cloud." This is structurally the same as the port/adapter split: the port owns intent; the adapter owns the integration-specific details, including security configuration.

### 6.2 The specific argument for hexagonal in HIPAA contexts

The `Sairyss/domain-driven-hexagon` repository captures the pattern explicitly:

> "To use such libraries consider creating an anti-corruption layer by using adapter or facade patterns. We sometimes tolerate libraries in the center, but be careful with general purpose libraries that may scatter across many domain objects. It will be hard to replace those libraries if needed. Tying only one or just a few domain objects to some single-responsibility library should be fine. It's way easier to replace a specific library that is tied to one or few objects than a general purpose library that is everywhere."

For Quilty, this argument is _strengthened_ by HIPAA:

- **Vendor de-risking.** If PostHog Boost loses its BAA, or Sentry changes its DPA in a way that breaks our consent model, the hexagonal port boundary localizes the blast radius to one adapter.
- **Consent-aware PHI scrubbing.** PHI sanitizer (per D67) lives at the adapter boundary — exactly where it should, in hexagonal terms.
- **The Cerebral / Monument lesson.** Both incidents were tracking-pixel exfiltration where vendor SDKs were imported directly into PHI-handling pages with no adapter boundary. A hexagonal structure with `ban-direct-vendor-SDK-imports outside lib/observability/` (already in CLAUDE.md) is the textual implementation of "BAA boundary = adapter boundary."

### 6.3 The specific argument _against_ hexagonal in HIPAA contexts

There isn't a substantive one in the literature. The closest thing is Stuart-Martin's "you don't swap adapters at runtime in immutable infrastructure" critique — but that critique misses the HIPAA point. We don't need _runtime_ adapter swapping; we need **compliance-boundary clarity** and **vendor-de-risking optionality at deploy time**. The hexagonal boundary still buys that.

---

## 7. Recommendation for Quilty's D76

### 7.1 Naming the pattern correctly

**Use "hexagonal architecture" as the primary name, with "ports and adapters" as the precise mechanism subtitle.** Rationale:

- It's the oldest and most-precise term (Cockburn 2005).
- It maps cleanly to the modular-monolith framing ("each module is a hexagon") that's now dominant.
- Cockburn is _actively maintaining_ the pattern (2024 book, 2025 errata) — the term isn't stale.

**Acknowledge the family in the ADR.** One sentence: _"Hexagonal architecture (Cockburn 2005) — sometimes called Ports and Adapters; equivalent to the DIP-based family that includes Onion (Palermo 2008), Clean (Martin 2012), and Explicit (Graça 2017); we use 'hexagonal' for precision."_ This forestalls every reviewer-pedant argument about terminology.

### 7.2 Are we applying it correctly?

Likely yes, **if** the D76 ADR is honest about what we are and aren't doing:

- ✅ **We are** using ports as vendor-isolation seams (PostHog, Sentry, Stripe, Cognito, future Sanity/Contentful) — exactly the use case the HIPAA-aware framing recommends.
- ✅ **We are** using ports to make the domain (consent state, session state, subscription state) testable in isolation from external vendors.
- ✅ **We are** putting the PHI sanitizer at the adapter boundary, which is the canonical place for it.
- ✅ **We are** treating each module of the modulith as its own hexagon, which is the dominant 2024-2026 pattern.
- ❌ **We are NOT** claiming runtime adapter-swap capability (the strawman that Stuart-Martin demolishes). We swap adapters at _deploy time_, via SST stack reconfiguration.
- ❌ **We are NOT** producing a symmetric pure-Cockburn application that can be equally driven by humans, batch scripts, and tests — the website is overwhelmingly human-driven. The symmetry argument is **weaker** for a website than for a backend; this should be acknowledged in the ADR.

### 7.3 Watch-items the ADR should explicitly call out

1. **Leaky abstractions.** "If your domain port knows about SQL, HTTP, or JSON, you've already lost isolation." Ports must be defined in the domain's language, not the adapter's. (Llousas, _Common Pitfalls_, 2023.)
2. **Anemic domains.** "Think `order.pay(paymentProcessor)` instead of `orderService.pay(order)`. Behavior belongs with data." The website's domain is small; risk of anemic-domain-model is real. Mitigation: keep the domain _behavioral_ even at small scale.
3. **Boilerplate trap.** Don't introduce use-case classes / mediators / DTOs prematurely. Seemann's "fat adapter" is a legitimate alternative; the ADR should consider it for small modules (e.g., consent, footer-CTA) before reflexively layering them.
4. **Module boundaries enforced by tooling.** ESLint boundaries rule (e.g., `eslint-plugin-boundaries`), Knip, or a dependency-cruiser config should mechanically enforce that domain code can't import adapter code. _"Modularity by convention only: nothing prevents developers from bypassing intended structure — without discipline, a monolith tends toward the Big Ball of Mud."_
5. **Cross-module communication.** Once the modulith has 3+ modules, prefer typed in-process events over direct cross-module calls. This is _required_ if we ever want to extract a module to a separate service.

### 7.4 What to cite in the D76 ADR

Primary (foundational):

- Cockburn, A. (2005). "Hexagonal Architecture / Ports and Adapters." `alistair.cockburn.us/hexagonal-architecture`.
- Cockburn, A., & Garrido de Paz, J. M. (2024). _Hexagonal Architecture Explained._ ISBN 978-1737519782.
- Vernon, V. (2013). _Implementing Domain-Driven Design_, Chapter 4. Addison-Wesley.
- Palermo, J. (2008-07-29). "The Onion Architecture: part 1." `jeffreypalermo.com`.
- Martin, R. C. (2012-08-13). "The Clean Architecture." `blog.cleancoder.com`.

Secondary (synthesis / TS-specific):

- Graça, H. (2017-11-16). "DDD, Hexagonal, Onion, Clean, CQRS, … How I put it all together." `herbertograca.com`.
- Stemmler, K. "Clean Node.js Architecture." `khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/`.
- `Sairyss/domain-driven-hexagon` (GitHub) — canonical TS reference.
- Seemann, M. (2025-04-01). "Ports and fat adapters." `blog.ploeh.dk`. (Counterpoint citation — shows we're aware of the FP critique.)

Critical / counter-arguments:

- Stuart-Martin, S. (2025-09-29). "Are You Using Hexagonal Architecture, or Just Dependency Injection?" `stevenstuartm.com`.
- Batra, Y. (2026-02). "Hexagonal Architecture in Java Is Over-Engineered — Until You Hit Your First Rewrite." Medium.
- Llousas, A. (2023-12). "Hexagonal Architecture: Common Pitfalls." Medium.

HIPAA / vendor-isolation:

- Evans, E. (2003). _Domain-Driven Design_, Anti-Corruption Layer chapter. Addison-Wesley.
- Microsoft Azure Architecture Center. "Anti-corruption Layer pattern." `learn.microsoft.com`.

### 7.5 Bottom line for D76

Quilty's framing is defensible and current. The pattern is being **actively maintained by its creator** (Cockburn's 2024 book), is the **dominant modular-monolith pattern in 2024-2026**, and has a **HIPAA-friendly framing via the vendor-as-adapter-boundary argument** that aligns with the Cerebral/Monument lessons.

The ADR should:

1. Cite Cockburn primary, acknowledge the DIP-family via Graça
2. Be explicit about what hexagonal buys _for Quilty specifically_ (vendor isolation, BAA boundaries, PHI sanitizer placement, testable consent/subscription domain)
3. Be explicit about what hexagonal does **not** buy (we're not pure-symmetric Cockburn; we don't swap adapters at runtime; the website's symmetry is asymmetric in favor of HTTP-in)
4. Adopt the watch-items above as guardrails
5. Stay alert to the Stuart-Martin critique: if our ports end up being "just interfaces with a DI container," we're using a heavier name than the pattern warrants. Worth a self-check at each milestone close.

---

## Sources

Primary:

- [hexagonal-architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture)
- [Hexagonal Architecture Explained — Cockburn & Garrido de Paz (2024)](https://www.amazon.com/Hexagonal-Architecture-Explained-Alistair-Cockburn/dp/173751978X)
- [Hexagonal Architecture v1.1b errata (April 2025)](https://alistaircockburn.com/hexarch%20v1.1b%20DIFFS%2020250420-1012%20paper+epub.docx.pdf)
- [Hexagonal architecture (software) — Wikipedia](<https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)>)
- [Hexagonal or Ports and Adapters — Vaughn Vernon, IDDD Ch. 4](https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/ch04lev1sec3.html)
- [The Onion Architecture: part 1 — Jeffrey Palermo (2008-07-29)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [The Clean Architecture — Robert C. Martin (2012-08-13)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Resources — Hexagonal Architecture / jmgarridopaz](https://jmgarridopaz.github.io/content/resources.html)

Synthesis / community:

- [DDD, Hexagonal, Onion, Clean, CQRS — Herberto Graça (2017)](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- [Clean Node.js Architecture — Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Comparison of DDD and Clean Architecture — Khalil Stemmler](https://khalilstemmler.com/articles/software-design-architecture/domain-driven-design-vs-clean-architecture/)
- [Sairyss/domain-driven-hexagon (GitHub)](https://github.com/Sairyss/domain-driven-hexagon)
- [Clean Architecture vs Onion vs Hexagonal — CCD-Akademie](https://ccd-akademie.de/en/clean-architecture-vs-onion-architecture-vs-hexagonal-architecture/)
- [PresentationDomainDataLayering — Martin Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)

Functional / Effect-TS:

- [Functional architecture is Ports and Adapters — Mark Seemann (2016)](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/)
- [Dependency inversion without inversion of control — Mark Seemann (2025-01-27)](https://blog.ploeh.dk/2025/01/27/dependency-inversion-without-inversion-of-control/)
- [Ports and fat adapters — Mark Seemann (2025-04-01)](https://blog.ploeh.dk/2025/04/01/ports-and-fat-adapters/)
- [Functional-core-imperative-shell — kbilsted (Gary Bernhardt synthesis)](https://github.com/kbilsted/Functional-core-imperative-shell)
- [hex-effect — jkonowitch (Effect-TS reference impl)](https://github.com/jkonowitch/hex-effect)
- [#67 — Effect with Michael Arnaldi — The Developers' Bakery](https://thebakery.dev/67/)

2024-2026 discourse:

- [Is Hexagonal Architecture Still Relevant in 2025? — Slimen Arnaout (2025-06-26)](https://medium.com/@arnaout.slimen/is-hexagonal-architecture-still-relevant-in-2025-absolutely-a4fa02d092c0)
- [Are You Using Hexagonal Architecture, or Just Dependency Injection? — Steven Stuart-Martin (2025-09-29)](https://stevenstuartm.com/blog/2025/09/29/hexagonal-architecture-modern-development.html)
- [Hexagonal Architecture in Java Is Over-Engineered — Until You Hit Your First Rewrite — Yash Batra (2026-02)](https://medium.com/@yashbatra11111/hexagonal-architecture-in-java-is-over-engineered-until-you-hit-your-first-rewrite-4e6a5de61dde)
- [Hexagonal Architecture: Common Pitfalls — Albert Llousas (2023-12)](https://medium.com/@allousas/hexagonal-architecture-common-pitfalls-f155e12388a3)
- [Combining Modular Monolith and Hexagonal Architecture — softwarearchitect.id (2025)](https://notes.softwarearchitect.id/p/combining-modular-monolith-and-hexagonal)
- [Building Modular Monoliths with Hexagonal Architecture and Internal Messaging — SoftwareSeni (2026-01)](https://www.softwareseni.com/building-modular-monoliths-with-logical-boundaries-hexagonal-architecture-and-internal-messaging/)
- [Hexagonal Architecture in Next.js — Cristian Fonseca](https://cristianfonseca.dev/blog/next-hexagonal-architecture/)
- [Clean Architecture in Next.js — Pavlo Lozovikov (Aug 2025)](https://medium.com/@plozovikov/clean-architecture-the-guide-you-need-dd8c179b9f95)

HIPAA / vendor isolation:

- [Anti-corruption Layer pattern — Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)
- [HIPAA Cloud Data Integration — Airbyte (2025)](https://airbyte.com/data-engineering-resources/hipaa-cloud-data-integration-compliance)
- [Compliance by Design: HIPAA-Ready Telehealth Platforms — Deepak Mishra (DEV)](https://dev.to/deepak_mishra_35863517037/compliance-by-design-architecting-hipaa-ready-telehealth-platforms-5d2a)
- [You May Need an Anti-Corruption Layer — Jesse Warden (2025-09)](https://jessewarden.com/2025/09/you-may-need-an-anti-corruption-layer.html)
- [Anticorruption Layer Defined — Tony Joanes](https://tonyjoanes.substack.com/p/anticorruption-layer-defined)
