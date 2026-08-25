import type { ConfigurationRepository, Design, DesignId } from "@lemnaria/configurator-domain";
import { DesignNotFoundError, migrateDesign } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";

import { generateDesignId } from "./generate-design-id.js";
import { readDatabaseUrl } from "./read-database-url.js";

const CURRENT_SCHEMA_VERSION = 1;

interface DesignRow {
  schema_version: number;
  document: unknown;
}

/** `ConfigurationRepository` backed by Neon Postgres. Every query uses `@neondatabase/serverless`'s
 *  tagged-template `sql`, which parameterises interpolated values by construction — no query in
 *  this file concatenates a value into SQL text. */
export class NeonConfigurationRepository implements ConfigurationRepository {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`. It is passed explicitly only by the live tests,
   *  which must target their own database rather than the application's. */
  constructor(connectionUrl: string = readDatabaseUrl()) {
    this.sql = neon(connectionUrl);
  }

  async save(id: DesignId | null, design: Design): Promise<DesignId> {
    if (id === null) return this.insert(design);

    // `returning id` is what makes a save to an unknown id fail: a bare `update` matching no row
    // reports success, so a stale or tampered identifier would silently persist nothing while the
    // caller believed the design was saved.
    const updated = (await this.sql`
      update designs
      set document = ${design}, updated_at = now()
      where id = ${id}
      returning id
    `) as { id: string }[];

    if (updated.length === 0) throw new DesignNotFoundError(id);
    return id;
  }

  async load(id: DesignId): Promise<Design> {
    const rows = (await this.sql`
      select schema_version, document from designs where id = ${id}
    `) as DesignRow[];

    const row = rows[0];
    if (!row) throw new DesignNotFoundError(id);

    return migrateDesign(row.schema_version, row.document);
  }

  private async insert(design: Design): Promise<DesignId> {
    const id = generateDesignId();
    await this.sql`
      insert into designs (id, schema_version, document)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${design})
    `;
    return id;
  }
}
