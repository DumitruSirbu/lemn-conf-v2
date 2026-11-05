import "server-only";

import {
  HandleSchema,
  ITEM_ID_MEMBER_OF_KIND,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readBookOf } from "@/lib/server/active-price-book";
import { DashboardStateUnreadableError } from "@/lib/server/price-dashboard/dashboard-state";
import { ownMember } from "@/lib/server/price-dashboard/draft-requests";
import {
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";
import type { PriceStores } from "@/lib/server/price-stores";

// What the routes that name an item, or judge one against the active book, read before they judge: the item as a request
// declares it, and the book it is judged against.

type ItemKind = keyof typeof ITEM_ID_MEMBER_OF_KIND;

/** An item as exactly its kind and its one id, rebuilt member by member: a member beyond them is not read. */
export function readItemRef(declared: unknown): ItemRef | undefined {
  if (!isPlainRecord(declared)) return undefined;
  const kind = ownMember(declared, "kind");
  if (
    typeof kind !== "string" ||
    !Object.hasOwn(ITEM_ID_MEMBER_OF_KIND, kind)
  ) {
    return undefined;
  }
  const idMember = ITEM_ID_MEMBER_OF_KIND[kind as ItemKind];
  const id = ownMember(declared, idMember);
  const namesOnlyKindAndId = Object.keys(declared).length === 2;
  if (!namesOnlyKindAndId || !isIdentifier(id)) return undefined;
  if (kind === "handle" && !HandleSchema.safeParse(id).success) {
    return undefined;
  }
  return { kind, [idMember]: id } as ItemRef;
}

/** The active version's book, or `undefined` before any version was published. A stored book that is not one is thrown. */
export async function readActiveBook(
  stores: Pick<PriceStores, "priceBook">,
): Promise<PriceBook | undefined> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") return undefined;
  const book = readBookOf(active.version);
  if (book === undefined) throw new DashboardStateUnreadableError("book");
  return book;
}
