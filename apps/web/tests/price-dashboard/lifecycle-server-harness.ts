// A stand-in for the two routes the fetching lifecycle client asks, for tests that drive a production page: it counts
// what was planted, switches what was asked on a revision it keeps, and answers a count in the reverse of the order asked
// so that nothing can be read by position. Everything else is answered as the staff session, as `stubTheStaffServer` does.
import { vi } from "vitest";

import {
  isSameItem,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type ItemRef,
  type ItemUsageCounts,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { itemsStatedIn } from "@/lib/server/price-dashboard/item-usage-read";

const AVAILABILITY_ADDRESS = "/api/staff/prices/availability";
const USAGE_ADDRESS = "/api/staff/prices/usage";

export interface LifecycleServer {
  /** The items of each count asked, in the order asked. */
  readonly usageRequests: (readonly ItemRef[])[];
  /** The body of each switch asked. */
  readonly switchRequests: unknown[];
  readonly availability: () => CatalogueAvailability;
}

interface LifecycleServerOptions {
  readonly availability: CatalogueAvailability;
  readonly usage: ItemUsageCounts;
  /** The server's active book: a tier or linked accessory it does not state is left out of a count, as the route does. */
  readonly book?: PriceBook;
}

/** Call after `stubTheStaffServer()`: the staff session stays the answer to every other address. */
export function stubTheLifecycleServer({
  availability,
  usage,
  book = SAMPLE_PRICE_BOOK,
}: LifecycleServerOptions): LifecycleServer {
  const sessionServer = globalThis.fetch;
  let current = availability;
  const server: LifecycleServer = {
    usageRequests: [],
    switchRequests: [],
    availability: () => current,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse((init?.body ?? "null") as string) as unknown;
      if (address === USAGE_ADDRESS) {
        const { items } = body as { items: ItemRef[] };
        server.usageRequests.push(items);
        return Promise.resolve(json(200, countsOf(items, usage, book)));
      }
      if (address === AVAILABILITY_ADDRESS) {
        server.switchRequests.push(body);
        const answer = switchedBy(body as SwitchBody, current);
        current = answer.next;
        return Promise.resolve(json(answer.status, answer.body));
      }
      return sessionServer(address, init);
    }),
  );
  return server;
}

function countsOf(
  items: readonly ItemRef[],
  usage: ItemUsageCounts,
  book: PriceBook,
) {
  return {
    counts: itemsStatedIn([...items].reverse(), book).map((item) => ({
      item,
      count:
        usage.find((held) => isSameItem(held.item, item))?.designCount ?? 0,
    })),
  };
}

interface SwitchBody {
  readonly expectedRevision: string;
  readonly item: ItemRef;
  readonly active: boolean;
}

function switchedBy(
  { expectedRevision, item, active }: SwitchBody,
  current: CatalogueAvailability,
) {
  if (expectedRevision !== current.revision) {
    return {
      status: 409,
      body: { status: "changed-meanwhile" },
      next: current,
    };
  }
  const others = current.disabled.filter((held) => !isSameItem(held, item));
  const next = {
    revision: String(Number(current.revision) + 1),
    disabled: active ? others : [...others, item],
  };
  return { status: 200, body: { revision: next.revision }, next };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
