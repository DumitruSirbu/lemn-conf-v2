# ADR 0146 — Nothing copied from a connection value, and nothing a driver threw, leaves the persistence package

Status: Accepted
Date: 2026-10-07
Type: Decision
Milestone: M8 wave 8B (commits `d176fb6` … `0eb94b6`)
Cites: ADR 0006, 0008, 0013, 0096, 0118, 0136, 0142, 0145.
Annotates: ADR 0006 (refusal wording), ADR 0142 decision 6 (`databaseNameOf` moved; its no-slash refusal now
applies at every site).

**Tiers.** The rules and their reasons are quoted from `docs/milestones/M8-review-contact-success.md`, *8B* and
its adjudications (**[doc]**). Every measurement is labelled with who ran it: **[QA-run]**,
**[coordinator-run]**, **[reviewer-run]**, **[implementer-run]**; the scribe re-ran none of them. **[inf]** is
the architect's inference, with what would falsify it.

## Context

On 2026-09-06 the owner ruled that a driver error must not print the connection string (the plan's *Added
2026-09-06*). 8A S1 measured where it did: in what is **thrown**, not in what this project logs. A bad
percent-escape, a missing host, a non-URL string and a bad port leaked the fake password, user and host
through the three runtime sites, the two test helpers and both migration tools, in `message`, `stack`,
`util.inspect` and, for Node's `ERR_INVALID_URL`, the `input` property. At a built route the platform's error
logger printed the string because the route rethrew the driver's error untouched: 3, 3 and 5 marker lines for
the three leaking values [8A S1, `D-summary.out`, relayed].

Wave 8B fixed it, and QA and review then found, in turn, that each way of deciding what is safe to show
**by inspecting something** failed: a parsed URL assumed to have a harmless path, a driver error searched for
the secret, an accepted string assumed to be one every consumer would take. The rules below stop inspecting.
The wave's four adjudications reached them; this record states them as they finally stand, not their history
of restatement.

## Decision

**B1 — the invariant is over any string.** Criterion 2 (no marker in `message`, `stack`, every own property,
every error on the `cause` chain, `util.inspect` at unlimited depth) holds for every string a connection
variable can hold. The seven values of the original table are a floor, not the invariant.

**B2 — nothing is copied out of a connection value.** No message, printed line, log line or error property
this package produces contains text taken from a connection value. It may contain the variable's name, the
operator's own declared environment, and a database name only when it equals a name this repository lists (the
environment map and the test allowlist), printed from that list. Never a host, port, user, password, path,
query or an unlisted name. As a property: two values that give the same comparisons give byte-identical
output. A refusal may differ by which refusal it is; the classes are few and closed: the variable is unset; the
value is not the accepted shape; a URL carrying an ssl parameter is refused for a session with a sentence true
of it; the readers of the string do not agree on its name; it names no database; it names a listed database
that is not the declared one; it names one that is not listed.

**B3 — a kept cause is built, not filtered.** Nothing a driver or Node threw rides on an error this package
throws. Where a cause is kept it is a new plain value of two fields: the error's type name, clamped as
`backup-designs.ts` clamps one, and its `code` when that has the shape of a SQLSTATE or a Node error code.
`MigrationExecutionError` keeps its cause *"so the underlying SQLSTATE is still reachable"*; that is the field
kept. The mechanism covers, by construction, a server that rejects a login and a statement that fails
mid-migration. For the close after a failed connect: whatever that `end()` does, the connect failure this
package built is what is thrown, and no rejection is left unhandled.

**B4 — a refusal names a variable only if the value was read from it.** A value handed in by a caller is
refused as a value handed in. `applyMigrations`, `runMigrations` and `readDeployedSchema` label a value only
when the caller that read it says which; the two CLIs say, so the operator is still told
`MIGRATION_DATABASE_URL` is wrong (the owner's criterion, *"The error still names which environment variable is
wrong"*).

**B5 — the census is by import.** Under `src/`, at any depth, only the opener has a value import of the driver
package: static, re-exported, or dynamic with a literal specifier. A type-only import is not one. `new URL(`
stays a census by name at any depth, and every script file under `src/` is read. The owed list is empty.

**B6 — the CLIs.** For a value the opener refuses, each CLI exits non-zero within a stated bound and prints one
refusal that names `MIGRATION_DATABASE_URL` and satisfies B2. Which refusal answers is not prescribed: the
environment check runs before anything is opened. **A process the test had to kill is a failed test, never an
exit code.**

**B7 — one accepted shape, and the opener is deliberately stricter than the driver.** Both entry points accept
a `postgres://` or `postgresql://` URL with the two slashes, a user, a host and a database name that is not
empty, and nothing else. Every string the opener accepts, the driver accepts; the opener also refuses three
forms the driver takes: no database (`postgresql://u@h`), one slash (`postgres:/u:p@h/db`), and no slash
(`postgres:u:p@h/db`). The no-slash refusal **extends ADR 0142 decision 6 to every site**: the driver re-parses
under `http:`, which tolerates the missing slash while this package's own reading sees an empty host and the
credential in the path (*"a bypass"*). It also refuses a user-less URL, `socket:`, `pg://` and keyword strings
that `new Client` took; no environment of this project uses those forms [inf; falsified by a migration URL with
no user]. A test pins the set.

**B8 — a close that fails never changes the run's outcome.** If every migration was applied and recorded,
`applyMigrations` returns its summary whether or not the session then closed; if the run failed it throws the
run's own error; a rejection from `end()` is dropped in both cases. The precedent is `rollbackQuietly`. **A
close that never returns is not bounded by this wave** (F5, below): a timeout would let `applyMigrations`
return while `end()` was pending and the socket open, and the CLI sets `process.exitCode` without calling
`process.exit`, so it would still not exit. B8 is an operator-tool behaviour ruled by the architect; the owner
may overrule it.

**B9, as amended — a database name is read only where every reading that takes the string agrees.** The
opener's shape check, the migration target and the isolation guard's two checks ask one function. It answers a
name only when the string as written, the string as the HTTP driver re-reads it, and the session driver's own
reading (asked of the driver, not copied from it) give the same name; otherwise *no name*, which every caller
treats as a refusal. **Amended by B10:** a reader that refuses the string does not disagree; it cannot be the
one that connects, so the HTTP entry point no longer fails because the session client would not build.

**B10 — an entry point refuses a string exactly when a consumer it will use refuses it.** Refusal is the union
of the consumers' own refusals, asked of the consumers by doing what the driver will do before it does it, plus
B7 and B9; never wider. The consumers, at driver 1.1.0 and this Node: for a query over HTTP, the driver's
constructor and the request header the driver puts the raw string in; for a session, the session client's
constructor; for both, the URL reader. A trailing newline is accepted (the header drops it). A URL carrying
`sslrootcert=`, `sslcert=` or `sslkey=` is accepted for HTTP, as before the wave, and refused for a session,
where the client's constructor always threw on it.

**B11 — the guard allows a test URL only if this package would itself open it, by both entry points.**
`assertSafeTestDatabaseUrl` asks the opener and does not repeat its checks; a string a consumer would refuse is
refused by the guard first, with the opener's own refusal. One test URL serves both entry points in a run, so a
URL only one takes cannot run the suite. The guard's two name checks are untouched.

**The project's own log line** (`apps/web/src/lib/server/design-failure-log.ts`): once a URL begins in a
failure's text, nothing after it in that text is logged.

## Alternatives the architect weighed and did not take

- **Shape-check, then echo** the path or name. `postgres://U:p@ss:12/SECRETPART` passes the opener's check; its
  host parses as `ss` and its name as `SECRETPART` [ran, the opener's logic in Node]. A mistyped value defines
  its own parts, so B2 copies nothing.
- **A cause filter** that keeps a driver error if it passes criterion 2. It must parse as the driver does
  (QA3's first test), cannot see a prototype getter, cannot know a name derived from a host or a resolved
  address, and cannot find a fragment of a password. B3 builds the cause instead.
- **A character class for the newline defect** (the logic reviewer's printable ASCII). It closes the same three
  characters and also refuses strings the runtime sends today (a Latin-1 letter, a tab, a trailing newline) [ran:
  the header takes each], risking a new outage. A form requiring that reading must not change the string at all
  was weighed too; the URL reader rewrites a raw `;`, `=`, `^` or `|` in a password [ran], so it would refuse a
  password that works today.
- **Refusing what the URL parser normalises.** It needs a list of what that is, and says nothing about the next
  character; refusing a raw backslash would close the 346 strings QA found and no more. B9's agreement needs no
  list.
- **A timeout on `end()`.** See B8: it returns early and the process still does not exit. Closed lists for a
  cause's `name` and `code` were weighed too and not taken: they would drop real SQLSTATEs and need editing at
  every driver bump.
- **Fixing each test helper** by sending it through the opener, **or widening B5's census to `tests/`.** The
  live test files call the driver themselves in many places by design; the guard is the gate the live-suite
  census already classifies them against, and one place covers every helper and every file not yet written.
- **Reporting a close failure** with a reduced cause, or beside the success. A migration commits on its own, so
  failing would tell a deploy gate that a migration which happened did not; a beside-field would add a second
  kind of line to the CLI output (ADR 0013).

## Supersessions and wording changes

- **Refusal wording changed** under ADR 0006: the isolation guard no longer prints `host:port` or an unlisted
  name, and the migration target's *"reaches …"* line for an unlisted database changed likewise. Nothing else
  about either changed; ADR 0006's guarantee about which database a test run touches is unchanged.
- **`connectOrWrapError`'s stated intent is superseded.** Its comment said the replacement *"keeps the driver
  error as `cause`"*. B3 replaces that: a kept cause is built (a clamped type name and a shape-checked `code`).
- **The opener is stricter than the driver** (B7), by design; a test pins the three extra refusals.
- **How the isolation guard's verdicts moved.** Against the pre-wave guard, **1,482 of 18,980 compared cases
  went from allowed to refused and 0 from refused to allowed** [QA-run, at `4b2a4bb`]. That is not
  one-directional at every step: the logic reviewer found, from source, that the amended B9 re-allowed,
  relative to the commit before it, a case where `DATABASE_URL` carries an `sslrootcert=` parameter
  [reviewer-run]. The allowed set is still a subset of the pre-wave guard's. Do not read this wave as
  "allowed to refused only" without that qualification.

## Evidence

- **Criterion 4, at the route** [QA-run, fresh build, eleven malformed values]: 0 marker lines in the server
  logs and 0 of 33 response bodies. Before the wave, 8A measured 3, 3 and 5 marker lines for the three leaking
  values.
- **The used-string harness** [QA-run]: of 3,689 swept strings, 265 were accepted for queries and 391 for a
  session; each was then used with only the socket replaced, and 0 carried any part of the value. The same
  harness finds 207 against the opener before review fix A. Of 76 strings the guard allows, 0 carry any part,
  against 118 with the previous guard.
- **Suites** [coordinator-run, at `db22ff4`]: the whole persistence suite, exit 0, 55 files, 1485 passed;
  `apps/web/tests/lib/server`, exit 0, 11 files, 127 passed. At `0eb94b6`: `pnpm format:check` exit 0,
  persistence typecheck exit 0, the workflow parses as YAML. **Not run:** `pnpm check`, `pnpm ci:local`, e2e;
  nothing has run on a CI runner since these commits.
- **Review round 2** [reviewer-run]: logic and clean-code approved; security approved and stated that *"the wave
  discharges the 2026-09-06 ruling: for any string, nothing this package or the routes throw or log carries a
  credential, at the installed driver and Node 24"*, with the named exceptions below.

## Recorded limits, each with its trigger (ADR 0118)

| Limit | Trigger or owner |
| --- | --- |
| **QA5.** A cause's `name` and `code` are kept by shape, so a `code` of `FAKEPASSWORD_QA8B` would pass | A driver version that sets either field from its input [inf]; the driver-rejection tests on real errors would show it |
| **The census.** A dynamic import with a computed specifier; an alias of the global `URL`; `Reflect.construct`; a `require` made by `createRequire` | None recorded in the plan |
| **QA13 / F5.** A session close that never returns hangs `applyMigrations`; seen only with a mocked driver | The coordinator, before 8S: a measurement on the test database (needs owner approval, it ends a backend), then a CLI-shutdown fix as its own small wave |
| **QA16.** `?host=` redirects the session client; host is not compared | None recorded in the plan |
| **Security R1.3.** With an empty password the session client reads `PGPASSWORD`, `PGPORT`, `PGOPTIONS`, `PGSSLMODE`; it is the driver's environment, not a fallback between this project's variables (ADR 0008 holds) | Predates the wave; none |
| **QA20.** The log line still shows text before a URL, a URL that directly follows `_`, and a credential written without `://` | The Q27 (b) wave, which would stop logging a driver's text at all; a backlog entry if the owner answers (a). Trigger: a driver message that quotes a value in one of those forms |
| **QA21 and logic R1.2.** Neon reads the raw string a fourth time; a Latin-1 character goes as one byte and a tab reaches Neon unchanged, and what Neon reads is unmeasured | A string this package accepts that Neon routes to a database of another name |
| **QA22.** Which sentence the guard gives when both entry points refuse [coordinator brief] | None recorded in the plan |
| **Logic R2.1** [reviewer-run]. `Headers` is laxer than the sender: C0 controls other than tab, LF, CR and NUL, and DEL, pass the opener, and every query then fails in the HTTP client's dispatch with no value in the error | None recorded in the plan |
| **A test that builds its own connection string** or reads the variable without the guard is outside B11 | The live-suite census is a tripwire, *"not a sandbox against an adversarial author"* |
| **B10's own limit.** A consumer added by a later driver is not known to the rule | The used-string sweep is what notices one; Q27 (b) is the by-construction answer |

## What the wave leaves unproven

From QA's final list and the security reviewer's, not as clean:

- **A login the server rejects (F3).** One attempt with a fake password against the test database's host needs
  the owner's approval; it has not been given.
- **A real `end()` that rejects or never returns (F5).**
- **What Neon's endpoint reads from the raw header** (the fourth reading).
- **The hosting platform's own logger (F4).** What was measured is `next start`'s; setting a bad value on a
  deployment is the owner's action.
- **A live session opened with an odd-character password.**
- **Runtime query errors that show a derived host or a resolved address (Q27, open).** The three runtime sites
  still rethrow a driver's query error untouched. Q27's recommendation is now (b), a later wave that rebuilds
  each; the wave closes with no answer to it.
- **The CI change in `0eb94b6`** (the test-database step no longer prints the database name; security R2.1)
  on a runner.

## Consequences

- Follow-ups with owners: F1 (`scripts/gates/boundary.sh` matches a driver import on one line only), F5, and F6
  (whether Neon documents `sslrootcert` or a sibling in its strings) are in `docs/backlog/open.md`.
- The stopping rule (after round 3, QA makes one pass; a finding is fixed inside 8B only if text from a
  connection value or anything a driver threw leaves the package on a path the installed driver can take, or an
  earlier guarantee no longer holds) and B8 were made by the architect without the owner and may be overruled.
- Review round 1 recorded a nine-line code comment as belonging in this ADR rather than in the code (ADR 0136);
  the rules above are that reasoning's home. Not splitting `open-database.ts` and the optional `readFrom`
  shape were recorded for this ADR with no code change.

## Note — 2026-10-09: applied to the contact submissions store (wave 8I)

B3 is applied to a second store: every failure of the contact submissions store leaves as one store error whose cause is the type name and the SQLSTATE, a failure is classified once where it is caught, and no caught driver error is thrown again. The rule was held by construction only after review round 1 (S-R2.1) and tightened twice (a thrown proxy; a reply row that throws when read). [ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md) decision 3.
