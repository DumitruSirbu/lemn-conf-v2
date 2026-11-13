import { createHash } from "node:crypto";

import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import type {
  EditableDesignLookup,
  EditableDesignRepository,
  LoadEditableOutcome,
} from "@lemnaria/persistence";

import { priceStoresModule } from "./price-dashboard-world";

// Kept apart from `price-notice-world.ts` on purpose: the `vi.mock` factories import this file, so it must not import the
// routes.

export const NOTICE_DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
export const OWNER_WRITE_TOKEN = "write-token-of-the-notice-design";
export const OWNER_WRITE_TOKEN_HASH = createHash("sha256")
  .update(OWNER_WRITE_TOKEN, "utf8")
  .digest("hex");
export const WRITE_COOKIE_NAME = `lemnaria_write_token_${NOTICE_DESIGN_ID}`;
export const OWNER_WRITE_COOKIE = `${WRITE_COOKIE_NAME}=${OWNER_WRITE_TOKEN}`;
export const VISITOR_COOKIE = `__Host-lemnaria_visitor=${"a".repeat(43)}`;
export const STORED_REVISION = "7";

export interface EditableRow {
  readonly id: string;
  readonly design: Design;
  readonly writeTokenHash: string | undefined;
  readonly accountId: string | undefined;
  readonly isSent: boolean;
  readonly isHidden: boolean;
}

/**
 * S7's `loadEditable` over rows, answering by the predicate of its two statements: the token arm names the hash and no
 * visitor, the account arm names the account, and a hidden or deleted row is `none` on both. It has no write method, so a
 * route that reached for a design write would find nothing to call.
 */
export class StubEditableDesigns implements EditableDesignRepository {
  readonly calls: EditableDesignLookup[] = [];
  /** What the next read rejects with, as a corrupt document or a driver that is down does. */
  rejection: unknown;
  private readonly rows = new Map<string, EditableRow>();

  plant(row: Partial<EditableRow> & { id: string }): void {
    this.rows.set(row.id, {
      design: KITCHEN_L_DESIGN,
      writeTokenHash: OWNER_WRITE_TOKEN_HASH,
      accountId: undefined,
      isSent: false,
      isHidden: false,
      ...row,
    });
  }

  loadEditable(lookup: EditableDesignLookup): Promise<LoadEditableOutcome> {
    this.calls.push(lookup);
    if (this.rejection !== undefined) {
      return Promise.reject(
        this.rejection instanceof Error
          ? this.rejection
          : new Error("the stub was told to reject"),
      );
    }
    const row = this.rows.get(lookup.id);
    return Promise.resolve(
      row !== undefined && this.isAuthorised(row, lookup)
        ? {
            kind: "found",
            design: row.design,
            revision: STORED_REVISION,
            isSent: row.isSent,
          }
        : { kind: "none" },
    );
  }

  private isAuthorised(
    row: EditableRow,
    { credential }: EditableDesignLookup,
  ): boolean {
    if (row.isHidden) return false;
    return credential.kind === "write-token"
      ? row.writeTokenHash === credential.hash
      : row.accountId === credential.accountId;
  }
}

let current: StubEditableDesigns | undefined;

export function freshEditableDesigns(): StubEditableDesigns {
  current = new StubEditableDesigns();
  current.plant({ id: NOTICE_DESIGN_ID });
  return current;
}

export function currentEditableDesigns(): StubEditableDesigns {
  if (current === undefined) {
    throw new Error("No editable designs: call freshEditableDesigns()");
  }
  return current;
}

export function editableRepositoryModule() {
  return { getEditableDesignRepository: () => currentEditableDesigns() };
}

const priceStoresFailure = { current: undefined as unknown };

/** The price dashboard world's stores, unless the test has told the module to reject, as a connection string the driver
 *  refuses makes `getPriceStores` reject with a plain `Error`. */
export function rejectablePriceStoresModule() {
  const world = priceStoresModule();
  return {
    getPriceStores: () =>
      priceStoresFailure.current === undefined
        ? world.getPriceStores()
        : Promise.reject(priceStoresFailure.current as Error),
  };
}

export function makePriceStoresReject(error: Error | undefined): void {
  priceStoresFailure.current = error;
}
