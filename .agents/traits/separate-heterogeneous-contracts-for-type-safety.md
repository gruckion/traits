---
name: separate-heterogeneous-contracts-for-type-safety
subject: Services, registries, caches, and other abstractions combining variants
  with different input, result, error, or dependency types. In TypeScript APIs
  and implementations, including Effect services and caches.
assertion: Prefer separate precisely typed instances or services when combining
  heterogeneous contracts requires conditional or indexed types whose variance
  or lost correlations lead to type assertions, widened error/dependency unions,
  or repeated kind-dependent branching. Reuse genuinely common lifecycle and
  execution machinery through typed helpers or constructors rather than forcing
  unlike contracts into one discriminator-driven interface. Retain a unified
  abstraction when it preserves those relationships cleanly without such
  workarounds.
purpose: Preserve useful static guarantees and simple implementations without
  duplicating shared infrastructure.
---
For example, keep a registry whose setup produces an input-taking function separate from one whose setup produces a context-dependent Effect. Each can own a typed cache and its own validation/error contract while sharing a constructor for setup-fiber caching, scope ownership, inherited services, and isolated execution resources. Different type arguments alone do not require separate implementations or services; the signal is complexity introduced solely to recover relationships lost by unification.