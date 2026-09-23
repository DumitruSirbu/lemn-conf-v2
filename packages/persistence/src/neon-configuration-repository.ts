import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

import type { DesignRevision } from "./design-revision.js";
import { generateDesignId } from "./generate-design-id.js";
import { retryOnComputeRestart } from "./retry-on-compute-restart.js";
import { readDatabaseUrl } from "./read-database-url.js";

/* `CURRENT_SCHEMA_VERSION` is the version every row this adapter writes is stamped with, and it is
 * imported from the domain rather than restated here: it is the same number that decides which
 * normalisations `migrateDesign` still owes a row, and two copies of it that drifted apart would be
 * a migration that silently stopped running. The read path never assumes it — it passes
 * `row.schema_version`, which is what lets a stored older row go on loading. */

/** SHA-256 as `node:crypto`'s `digest("hex")` renders it: 64 lowercase hex characters. */
const SHA256_HEX_DIGEST = /^[0-9a-f]{64}$/;

interface DesignRow {
  schema_version: number;
  document: unknown;
  /** `revision::text`, never the driver's rendering of a `bigint` — see `DesignRevision`. */
  revision: DesignRevision;
}

/** The single row the conditional update returns, whatever it decided. `revision` is the **new**
 *  one when this write is the one that landed, and null when it matched nothing. */
interface ConditionalUpdateRow {
  is_authorised: boolean;
  revision: DesignRevision | null;
}

/** A write was refused: the supplied credential does not authorise the named design, or no such
 *  design exists. The two cases are **deliberately indistinguishable** — the conditional update
 *  cannot tell them apart, and a caller must not be able to either, or the write endpoint becomes
 *  an oracle for which design ids exist (ADR 0019 decision 1). */
export class DesignWriteForbiddenError extends Error {
  constructor(id: DesignId) {
    super(`No writable design matched the supplied credential for id "${id}"`);
    this.name = "DesignWriteForbiddenError";
  }
}

/**
 * A write was refused because the design has moved on: the credential is the right one, and the
 * revision it expected is not the revision the row now carries (WEB-003).
 *
 * **Separate from `DesignWriteForbiddenError`, and reachable only by a caller whose credential
 * already matched.** That is what keeps the pair from becoming an oracle: a caller holding the
 * wrong token — or naming a design that does not exist — gets the forbidden refusal for both, as it
 * always did, and can never tell which. Learning "this design exists and you are stale" therefore
 * requires already having proved you may write it, which discloses nothing to anyone else.
 */
export class DesignWriteConflictError extends Error {
  constructor(id: DesignId) {
    super(
      `The stored design "${id}" has moved past the revision this write expected`,
    );
    this.name = "DesignWriteConflictError";
  }
}

/** A design row's identity and the revision it now stands at — what a mint and a successful save
 *  each answer, so the next write knows what to expect. */
export interface DesignVersion {
  readonly id: DesignId;
  readonly revision: DesignRevision;
}

/** A stored design and the revision it was read at. The two travel together because a document
 *  without the revision it came from cannot be written back safely. */
export interface StoredDesign {
  readonly design: Design;
  readonly revision: DesignRevision;
}

/** One authorised replacement of a stored design. Grouped rather than passed as three positional
 *  arguments so the hash can never be swapped with the id at a call site. */
export interface AuthorizedSave {
  readonly id: DesignId;
  readonly design: Design;
  readonly writeTokenHash: string;
  /** The revision the caller read this design at. The write lands only if the row still carries
   *  it — see `saveAuthorized`. */
  readonly expectedRevision: DesignRevision;
}

/** What a mint stores: the design, the write-token hash that will authorise editing it, and the
 *  visitor hash that will own it (ADR 0114 decision 5). Grouped rather than passed as three
 *  positional arguments so the two hashes — both 64-character hex digests — can never be swapped
 *  with each other at a call site (M7 wave 7E3a D2). */
export interface MintDesign {
  readonly design: Design;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/**
 * The server-side persistence port, split by ADR 0019 decision 1 into an open read and an
 * authorised write.
 *
 * Deliberately **not** the domain's `ConfigurationRepository`: that interface's `save(id, design)`
 * carries no credential and is what the browser client implements over `fetch`, where the cookie
 * supplies the credential instead. Server-side there is no ambient credential, so an unauthorised
 * update must be unrepresentable rather than merely unused.
 */
export interface AuthorizedConfigurationRepository {
  mint(mint: MintDesign): Promise<DesignVersion>;
  saveAuthorized(save: AuthorizedSave): Promise<DesignVersion>;
  load(id: DesignId): Promise<StoredDesign>;
}

/** What `resumeVisitor` answers — tagged rather than `DesignId | null`, so a caller cannot forget
 *  to check which one it got (the same reasoning `ReadDesignOutcome`-shaped types use elsewhere in
 *  this codebase). Never a driver error: a lookup that fails to run is a rejected promise, not a
 *  third member here. */
export type VisitorResumeLookup =
  | { readonly kind: "found"; readonly id: DesignId }
  | { readonly kind: "none" };

/**
 * A second, narrower port beside `AuthorizedConfigurationRepository` — deliberately not a fourth
 * method on it (M7 wave 7E3a D3). Resume is neither the open read nor the authorised write ADR 0019
 * decision 1 splits that interface into: it takes a visitor hash instead of a design id or a write
 * credential, and it is the only place with the shape "starting from a hash, learn an id". Folding
 * it into `AuthorizedConfigurationRepository` would force every existing test double for mint/save/
 * load — about 16 of them — to also fake a lookup their own tests never exercise.
 */
export interface VisitorResumeRepository {
  /** D3's query: the visitor's most recently updated design, or none. `visitorHash` is expected
   *  already hashed and well-formed — this method runs the query as given and trusts the caller's
   *  shape check, the same division of labour `saveAuthorized` draws with its own credential (no
   *  `requireSha256Digest` here): a malformed value simply matches no row, because the column's own
   *  check constraint (`0005`) admits nothing else, so there is no unsafe shape for this SELECT to
   *  guard against. */
  resumeVisitor(visitorHash: string): Promise<VisitorResumeLookup>;
}

/** `AuthorizedConfigurationRepository` backed by Neon Postgres. Every query uses
 *  `@neondatabase/serverless`'s tagged-template `sql`, which parameterises interpolated values by
 *  construction — no query in this file concatenates a value into SQL text. */
export class NeonConfigurationRepository
  implements AuthorizedConfigurationRepository, VisitorResumeRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`. It is passed explicitly only by the live tests,
   *  which must target their own database rather than the application's. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  /** Mints a new design row holding the SHA-256 hash of its write token and of the visitor that
   *  owns it (ADR 0114 decision 5). Neither raw value is ever stored, so a database leak yields
   *  read access and nothing more. */
  async mint({
    design,
    writeTokenHash,
    visitorHash,
  }: MintDesign): Promise<DesignVersion> {
    requireSha256Digest(writeTokenHash, "write-token hash");
    requireSha256Digest(visitorHash, "visitor hash");
    // **The id is generated here, outside the retried callback, and must stay there.** A retry that
    // minted a fresh id each attempt would insert a second row for a write the customer made once,
    // whenever an acknowledgement is lost rather than the query refused. Kept out here, every
    // attempt carries the same primary key, so the repeat takes a duplicate-key rejection instead —
    // which is an HTTP 400, decoded, unmarked, and therefore not retried again.
    const id = generateDesignId();
    // The revision comes back from the column's own default rather than being asserted here, so
    // the one place that decides what a first revision is remains the migration.
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash}, ${visitorHash})
      returning revision::text as revision
    `,
    )) as { revision: DesignRevision }[];
    return { id, revision: revisionOfMintedRow(rows, id) };
  }

  /**
   * Replaces a stored design, with authorisation **and** the caller's expected revision enforced
   * inside the same statement as the update.
   *
   * The predicate — not a preceding `verify()` — is the security control. A separate read-then-write
   * opens a time-of-check/time-of-use window in which the row's token can change between the two
   * statements. It also means the hash is compared by Postgres rather than in application code, so
   * there is no comparison here to make timing-safe. Since WEB-003 the same argument covers the
   * revision: a read to decide whether the caller is current, followed by a write, is precisely the
   * window that let two tabs both believe they had saved.
   *
   * `returning revision` is what makes zero matched rows visible: a bare `update` matching no row
   * reports success, so an unauthorised, unknown or stale write would silently persist nothing while
   * the caller believed the design was saved. A row whose `write_token_hash` is NULL — minted before
   * ADR 0019 — never satisfies the predicate, and so fails closed.
   *
   * Deliberately **no** `requireSha256Digest` here, unlike `mint`, and for the same reason no
   * `isDesignRevision` either. The two methods are asked different questions. `mint` decides what may
   * be *stored*, and a degenerate value stored is a row anyone can write, so it is a programmer error
   * and throws. `saveAuthorized` is handed a credential and an expectation by a caller, and either
   * one being the wrong shape is simply not the right one — the honest answer is a refusal, not a
   * crash. The predicate already gives that answer for every shape, including `''`, because `mint`'s
   * guard means no stored hash is empty and `NULL = ''` is NULL; the revision is compared as text
   * for the same reason, so no caller-supplied string can raise a cast error out of this statement.
   */
  async saveAuthorized(save: AuthorizedSave): Promise<DesignVersion> {
    const outcome = await this.updateIfCurrent(save);
    if (outcome.revision !== null)
      return { id: save.id, revision: outcome.revision };
    // Order matters: a conflict is only ever reported to a caller whose credential matched, so the
    // 409 this becomes cannot tell anyone else that a design exists.
    if (outcome.is_authorised) throw new DesignWriteConflictError(save.id);
    throw new DesignWriteForbiddenError(save.id);
  }

  /**
   * One statement that answers both questions from one snapshot: may this caller write the design
   * at all, and did the write land.
   *
   * Two statements would be wrong here rather than merely slower. Asking "was the token valid?"
   * after a failed update reads the row a second time, so a design deleted or re-credentialed in
   * between would turn a genuine conflict into a refusal or the reverse. The CTEs share one
   * snapshot, so the pair of answers is always about one state of the row.
   *
   * `schema_version` is restamped with the document, and that is what retires a version. The
   * document written here was produced by this build, so a row left stamped with the version it was
   * minted under would say a document was written under a rule it was not — and an older arm could
   * never be removed, because a row it had already normalised would ask for it again on every load.
   * Safe in both directions: a normalised document is a fixed point of every arm below the current
   * version, so a row half-way through such a change loads identically whichever stamp it carries.
   */
  private async updateIfCurrent({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<ConditionalUpdateRow> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      with authorised as (
        select 1 from designs
        where id = ${id} and write_token_hash = ${writeTokenHash}
      ), updated as (
        update designs
        set document = ${design}, schema_version = ${CURRENT_SCHEMA_VERSION},
            updated_at = now(), revision = revision + 1
        where id = ${id}
          and write_token_hash = ${writeTokenHash}
          and revision::text = ${expectedRevision}
        returning revision
      )
      select
        exists (select 1 from authorised) as is_authorised,
        (select revision::text from updated) as revision
    `,
    )) as ConditionalUpdateRow[];

    const outcome = rows[0];
    if (!outcome)
      throw new Error(
        "The conditional update returned no row at all, which this statement cannot do — the " +
          "database did not run the query this repository sent.",
      );
    return outcome;
  }

  /** Reading needs no credential: a shared link stays open to anyone holding it, which is the
   *  whole point of splitting read from write (ADR 0019 decision 1). */
  async load(id: DesignId): Promise<StoredDesign> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      select schema_version, document, revision::text as revision
      from designs where id = ${id}
    `,
    )) as DesignRow[];

    const row = rows[0];
    if (!row) throw new DesignNotFoundError(id);

    return {
      design: migrateDesign(row.schema_version, row.document),
      revision: row.revision,
    };
  }

  /** D3's resume query, unchanged from the plan: ordered by `updated_at desc, id desc` so the tie
   *  break is deterministic, and answered by `designs_visitor_hash_updated_at_idx` (`0005`) rather
   *  than a scan — the index carries exactly these three columns in this order, in a partial index
   *  that already excludes the rows this query could never match (`visitor_hash is not null`). */
  async resumeVisitor(visitorHash: string): Promise<VisitorResumeLookup> {
    const rows = (await retryOnComputeRestart(
      () => this.sql`
      select id from designs
      where visitor_hash = ${visitorHash}
      order by updated_at desc, id desc
      limit 1
    `,
    )) as { id: DesignId }[];

    const row = rows[0];
    return row === undefined ? { kind: "none" } : { kind: "found", id: row.id };
  }
}

/**
 * The one shape `mint` accepts for either hash it stores: exactly what SHA-256 produces, a
 * 64-character lowercase hex digest.
 *
 * Stated as what a hash **is**, not as a list of what it must not be. The empty string is the
 * instance that prompted this — `'' = ''` is true in SQL, so a row stored with one is writable (or,
 * since M7 wave 7E3a, resumable) by anyone presenting an empty string — but a whitespace-only value
 * has the same property, and so does every other low-entropy value a broken caller might supply. A
 * blocklist grows one discovered value at a time; the contract does not.
 *
 * Nothing in the web layer can reach this: `mintWriteToken` and `resolveVisitorForMint` always
 * yield a digest. It is enforced anyway, because this port's contract is that an unauthorised
 * write or an unowned row is unrepresentable, and a predicate that can be satisfied by a guessable
 * value is the hole in exactly that claim. `whatItIs` names which of the two hashes failed; the
 * offending value is deliberately absent from the message either way (D2: "names no value").
 */
function requireSha256Digest(value: string, whatItIs: string): void {
  if (SHA256_HEX_DIGEST.test(value)) return;
  throw new Error(
    "Refusing to mint a design: a " +
      whatItIs +
      " must be a 64-character lowercase hex SHA-256 digest. Any other shape risks a row a " +
      "guessable value could write or claim.",
  );
}

/** The revision an `insert ... returning` must have produced. A missing row here is not a domain
 *  failure a caller can act on — the insert either raised or produced exactly one row — so it is
 *  reported as the impossibility it is rather than defaulted to a first revision this file would
 *  then be the second place to decide. */
function revisionOfMintedRow(
  rows: readonly { revision: DesignRevision }[],
  id: DesignId,
): DesignRevision {
  const revision = rows[0]?.revision;
  if (revision === undefined)
    throw new Error(
      `Minting design "${id}" inserted a row but returned no revision for it.`,
    );
  return revision;
}
