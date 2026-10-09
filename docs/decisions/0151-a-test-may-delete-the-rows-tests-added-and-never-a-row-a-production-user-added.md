# ADR 0151 — A test may delete the rows tests added, and never a row a production user added

Status: Accepted. The owner's sentence is the ruling; **how a row is known to be a test's is not ruled.**
Date: 2026-10-08
Type: Decision
Milestone: M8 (raised in wave 8E, recorded at wave 8H's close)
Extends: [ADR 0006](0006-tests-never-touch-the-application-database.md)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (*The owner's
answers of 2026-10-08*, item 4; wave 8E's *adjudication of QA* and *8E as closed*) and the coordinator's close-out
hand-over. The scribe has no shell and ran nothing. The owner's sentence reached the scribe **relayed**, through the
coordinator and the architect, and is quoted as they gave it. An owner's rule said in conversation is not yet an invariant
(`best-practices/documentation.md`), which is why the sentence is recorded verbatim here and each reading beside it says
whose it is.

## Context

During wave 8E, QA's first live run crashed its own cleanup and left 3 rows in the test database's
`rate_limit_counters`. QA deleted them, by era and then by key. The architect allowed the `beforeAll` that does so on three
conditions (one eras support file; the removed count reported; the test database only), which were met, and noted that
whether the original deletion was within the rules was the owner's and unruled. ADR 0006 governs which database a
destructive test may reach; it does not say which rows a test may delete in it. The add-only rule for variables and
resources (`best-practices/environments-and-resources.md`) is about resources, not rows.

## Decision

**The owner's ruling, 2026-10-08, verbatim [relayed]:** *"If were added by tests , delete , if added by production user
keep"*.

- **Ruled:** a test may delete rows that tests added. A row a real user added is never deleted.
- **The coordinator's reading, which the architect shares:** the three rows removed after 8E's interrupted run are thereby
  accepted. They were tests' rows on the test database.
- **Not ruled:** how a row is known to be a test's. The owner did not say.
- **The architect's reading of that, which is 8E's ruling and stands (an inference, not the owner's):**
  - on the guarded test database, a row is a test's by **a marker only tests write**, with the count removed reported;
  - and the other half follows from the owner's words: on a database that holds users' rows, **a test deletes only what it
    can show it added in that run.**
- **8E's three conditions** for a test's own deletion of stray rows, which the architect allowed before the owner spoke
  and which stand as the architect's reading of how to apply the ruling: one eras support file, the removed count reported,
  the test database only.

**How the ruling meets ADR 0006.** Nothing there changes. The guard still refuses every database that is not allowlisted,
and `lemn-conf-v2-staging` remains the destructive-test target. This record adds what ADR 0006's cleanup point (3) does not
say: that cleanup deletes tests' rows and only those, and that the rule reaches a database holding users' rows only through
"what it can show it added in that run".

**Its working form** is in `best-practices/environments-and-resources.md`, under *Test-database isolation*.
`docs/WORKFLOW.md` is not changed by this record.

## Consequences

- The 3 rows removed in 8E are accepted, and backlog 142 no longer lists the question.
- The wave dispatch ban *"deleting database rows"* stands for dispatches that do not name this exception; a test that
  deletes by the rule above is the code's, not the agent's.
- Open: the marker. Until the owner rules, the reading above is the architect's and a later wave that needs a stricter or
  looser test must put the question.

## Note — 2026-10-09: an incident under this rule, and a standing rule (wave 8F)

To show a mutation red, a developer ran a mutant of the test-only counter delete with its `where` clause removed against the live test
database: every row of `rate_limit_counters` there was deleted, more than once; the helper's guard held; how many rows and whose is not known.
It is inside this record's sentence only because that table on that database is written by tests alone [inf]; it broke the dispatch's rule.
Nothing is to be restored. **The standing rule:** *A mutant of a statement that deletes, updates, truncates or alters is run against a mocked
driver and never against a database. A live proof that a statement touches only what it is handed plants rows of its own beside the ones it
hands over and asserts they remain. A destructive statement whose `where` no longer names what it was handed is not sent anywhere.*
[ADR 0155](0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md), *Incident*.
