---
name: lemnaria-delivery-workflow
description: Plan and deliver a Lemnaria project phase with scoped implementation, adversarial QA, evidence-based review, and accurate close-out documentation.
metadata:
  short-description: Lemnaria phase delivery
---

# Lemnaria delivery workflow

Read `docs/WORKFLOW.md` and `docs/AGENT_ROLES.md` before using this workflow. Also read the
relevant milestone, decision, and product-reference documents before changing behaviour.

## Route the work

- Use an architect pass for multi-component changes, new invariants, or decisions that shape the
  project beyond a single implementation task.
- Keep implementation assignments narrow and explicit. Pair behaviour changes with regression
  coverage whenever practical.
- Add adversarial QA before review. Sweep numeric/generative inputs where a range exposes more
  risk than examples.
- Review a real diff only. Use visual verification for visible or interactive changes and security
  review for customer data, public APIs, auth, sharing, generated output, or dependency changes.

## Close honestly

The coordinating agent checks the diff, tests, and findings itself. Document confirmed outcomes,
decisions, deviations, and intentionally deferred work. Never describe a planned feature or
unmeasured number as shipped fact.
