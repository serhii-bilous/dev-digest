# References

## Canonical

- [The Onion Architecture: part 1 — Jeffrey Palermo (2008, coined the term)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Onion Architecture — Herberto Graça](https://herbertograca.com/2017/09/21/onion-architecture/)

## Onion vs Clean vs Hexagonal (why Onion specifically)

- [Onion vs Clean vs Hexagonal Architecture — Eric Damtoft](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)
- [Layered vs Clean vs Onion vs Hexagonal — practical guide for backend developers](https://medium.com/@rup.singh88/stop-confusing-clean-onion-hexagonal-architecture-heres-when-to-use-each-692079e56267)
- [Understanding Hexagonal, Clean, Onion, and Traditional Layered Architectures — Roman Glushach](https://romanglushach.medium.com/understanding-hexagonal-clean-onion-and-traditional-layered-architectures-a-deep-dive-c0f93b8a1b96)

## TypeScript / Node.js implementations

- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [Implementing SOLID and the Onion Architecture in Node.js with TypeScript and InversifyJS — Wolk Software](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs)
- [Hexagonal Architecture (Ports and Adapters): a complete TypeScript guide](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide)

## Repository pattern + Drizzle/DI (closest to this stack)

- [Repository Pattern in NestJS with Drizzle ORM — vimulatus](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Drizzle ORM Best Practices — Paul Serban](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Atomic Repositories in Clean Architecture and TypeScript — Sentry Blog](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [drizzle-inversify-social-media — example ports/adapters with Drizzle + Inversify](https://github.com/sebi75/drizzle-inversify-social-media)

## Fastify-specific

- [fastify-clean-architecture — example repo (domain/infrastructure/interfaces layout)](https://github.com/revell29/fastify-clean-architecture)

## Pitfalls (feeds `rules/domain-model.md`)

- [Overengineering in Onion/Hexagonal Architectures — Victor Rentea](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/)
- [Onion Architecture: An Opinionated Approach, Part 2 — Anemic Data Models (IExtendable)](http://iextendable.com/2013/04/16/onion-architecture-an-opinionated-approach-part-2-anemic-data-models/)
- [Anemic Domain Model — Wikipedia (Fowler's original coinage)](https://en.wikipedia.org/wiki/Anemic_domain_model)

## Project-specific note

This skill did not introduce ports-and-adapters to DevDigest — `server/src/vendor/shared/adapters.ts` + `server/src/adapters/<port>/` + `platform/container.ts` already implement it for every external system (LLM, GitHub, git, code index, embeddings, secrets, auth). The gap this skill closes is: (1) making the *Application-must-not-see-persistence-types* half of the rule explicit and checkable (`rules/layers.md`, `rules/migration-checklist.md`), and (2) giving an explicit, opt-in answer for when a module needs a real `domain.ts` versus staying anemic (`rules/domain-model.md`) — the codebase had no stated policy for that judgment call before this skill.
