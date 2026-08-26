import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignNotFoundError,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

import { generateDesignId } from "./generate-design-id.js";
import { readDatabaseUrl } from "./read-database-url.js";

const CURRENT_SCHEMA_VERSION = 1;

/** SHA-256 as `node:crypto`'s `digest("hex")` renders it: 64 lowercase hex characters. */
const SHA256_HEX_DIGEST = /^[0-9a-f]{64}$/;

interface DesignRow {
  schema_version: number;
  document: unknown;
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

/** One authorised replacement of a stored design. Grouped rather than passed as three positional
 *  arguments so the hash can never be swapped with the id at a call site. */
export interface AuthorizedSave {
  readonly id: DesignId;
  readonly design: Design;
  readonly writeTokenHash: string;
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
  mint(design: Design, writeTokenHash: string): Promise<DesignId>;
  saveAuthorized(save: AuthorizedSave): Promise<DesignId>;
  load(id: DesignId): Promise<Design>;
}

/** `AuthorizedConfigurationRepository` backed by Neon Postgres. Every query uses
 *  `@neondatabase/serverless`'s tagged-template `sql`, which parameterises interpolated values by
 *  construction — no query in this file concatenates a value into SQL text. */
export class NeonConfigurationRepository
  implements AuthorizedConfigurationRepository
{
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`. It is passed explicitly only by the live tests,
   *  which must target their own database rather than the application's. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  /** Mints a new design row holding the SHA-256 hash of its write token. The token itself is never
   *  stored, so a database leak yields read access and nothing more. */
  async mint(design: Design, writeTokenHash: string): Promise<DesignId> {
    requireSha256Digest(writeTokenHash);
    const id = generateDesignId();
    await this.sql`
      insert into designs (id, schema_version, document, write_token_hash)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design}, ${writeTokenHash})
    `;
    return id;
  }

  /**
   * Replaces a stored design, with authorisation enforced **inside the same statement** as the
   * update.
   *
   * The predicate — not a preceding `verify()` — is the security control. A separate read-then-write
   * opens a time-of-check/time-of-use window in which the row's token can change between the two
   * statements. It also means the hash is compared by Postgres rather than in application code, so
   * there is no comparison here to make timing-safe.
   *
   * `returning id` is what makes zero matched rows visible: a bare `update` matching no row reports
   * success, so an unauthorised or unknown identifier would silently persist nothing while the
   * caller believed the design was saved. A row whose `write_token_hash` is NULL — minted before
   * ADR 0019 — never satisfies the predicate, and so fails closed.
   *
   * Deliberately **no** `requireSha256Digest` here, unlike `mint`. The two methods are asked
   * different questions. `mint` decides what may be *stored*, and a degenerate value stored is a
   * row anyone can write, so it is a programmer error and throws. `saveAuthorized` is handed a
   * credential by a caller, and a credential of the wrong shape is simply not the right one — the
   * honest answer is a refusal, not a crash. The predicate already gives that answer for every
   * shape, including `''`, because `mint`'s guard means no stored hash is empty and `NULL = ''` is
   * NULL. Validating here would also turn a 403 into a 500 for anyone who sent a malformed cookie.
   */
  async saveAuthorized({
    id,
    design,
    writeTokenHash,
  }: AuthorizedSave): Promise<DesignId> {
    const updated = (await this.sql`
      update designs
      set document = ${design}, updated_at = now()
      where id = ${id} and write_token_hash = ${writeTokenHash}
      returning id
    `) as { id: string }[];

    if (updated.length === 0) throw new DesignWriteForbiddenError(id);
    return id;
  }

  /** Reading needs no credential: a shared link stays open to anyone holding it, which is the
   *  whole point of splitting read from write (ADR 0019 decision 1). */
  async load(id: DesignId): Promise<Design> {
    const rows = (await this.sql`
      select schema_version, document from designs where id = ${id}
    `) as DesignRow[];

    const row = rows[0];
    if (!row) throw new DesignNotFoundError(id);

    return migrateDesign(row.schema_version, row.document);
  }
}

/**
 * The one shape `mint` accepts: exactly what SHA-256 produces, a 64-character lowercase hex digest.
 *
 * Stated as what a write-token hash **is**, not as a list of what it must not be. The empty string
 * is the instance that prompted this — `'' = ''` is true in SQL, so a row stored with one is
 * writable by anyone presenting an empty string — but a whitespace-only value has the same
 * property, and so does every other low-entropy value a broken caller might supply. A blocklist
 * grows one discovered value at a time; the contract does not.
 *
 * Nothing in the web layer can reach this: `mintWriteToken` always yields a digest. It is enforced
 * anyway, because this port's contract is that an unauthorised write is unrepresentable, and a
 * predicate that can be satisfied by a guessable value is the hole in exactly that claim. The
 * offending value is deliberately absent from the message.
 */
function requireSha256Digest(writeTokenHash: string): void {
  if (SHA256_HEX_DIGEST.test(writeTokenHash)) return;
  throw new Error(
    "Refusing to mint a design: a write-token hash must be a 64-character lowercase hex SHA-256 " +
      "digest. Any other shape risks a row that a caller can write by presenting a guessable value.",
  );
}
