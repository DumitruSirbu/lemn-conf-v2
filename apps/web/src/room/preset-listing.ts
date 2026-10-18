// Step 1's one read of `GET /api/presets` (ADR 0112 Amendment A decision 5), and the whole of what the browser trusts from it.
//
// The answer is untrusted data, however it got here: a cache, a proxy or a compromised route hands the same bytes. So
// everything is checked on receipt, in this order and before anything is evaluated: the status, the size, the count,
// and then each item by itself. An item is rebuilt field by field from what survived its own parse and never copied
// from the wire (no spread, no `Object.assign`, no merge), so a key the route did not mean to send cannot arrive. A
// failed item is dropped alone. Any failure of the read itself is "no presets": Step 1 goes on to composition and the
// customer sees no error (see ADR 0167 Amendment B item 7). Nothing here is kept: the caller holds the result for the
// visit and no longer.
import {
  DesignSchema,
  isDesignId,
  isShowablePresetName,
  MAX_LISTING_BYTES,
  PRESET_LIST_LIMIT,
  presetNameFactsOf,
  presetRoomOf,
  type DesignRoom,
} from "@lemnaria/configurator-domain";

import {
  PRESET_LIST_PATH,
  presetImagePath,
  type PresetSummary,
} from "@/preset/preset-summary-wire";

/** How long the read may take before it is given up as "none". A few hundred milliseconds is typical; this is the tail. */
export const LISTING_TIMEOUT_MS = 3_000;

const OK_STATUS = 200;

/** The only keys read off the wire, each as the `unknown` it is until it has been checked. */
type WireListing = Readonly<Partial<Record<"presets", unknown>>>;
type WireItem = Readonly<
  Partial<Record<"id" | "design" | "typedName", unknown>>
>;

/** Why a read ended in "none", as a category for the log and never as a message or a value of the body. */
export type ListingUnavailableReason =
  | "aborted"
  | "timeout"
  | "status"
  | "network"
  | "too-large"
  | "malformed";

export type PresetListing =
  | { readonly kind: "listed"; readonly presets: readonly PresetSummary[] }
  | {
      readonly kind: "unavailable";
      readonly reason: ListingUnavailableReason;
    };

/** The listing's address for a room. Built from the room's preset form so a straight room names `a` alone and an L no
 *  `c`, which the route's strict reading would otherwise refuse. */
function presetListingUrl(room: DesignRoom): string {
  const { shape, walls } = presetRoomOf({ room });
  const query = new URLSearchParams({ shape, a: String(walls.aMm) });
  if (walls.bMm !== undefined) query.set("b", String(walls.bMm));
  if (walls.cMm !== undefined) query.set("c", String(walls.cMm));
  return `${PRESET_LIST_PATH}?${query.toString()}`;
}

/** Reads the presets near `room`. Never rejects: every failure is an `unavailable` with its category. `signal` is the
 *  caller's to abort (the customer left); the timeout is this function's own. */
export async function fetchPresetListing(input: {
  readonly room: DesignRoom;
  readonly signal: AbortSignal;
}): Promise<PresetListing> {
  const read = new AbortController();
  const timeout = { hasExpired: false };
  const timer = setTimeout(() => {
    timeout.hasExpired = true;
    read.abort();
  }, LISTING_TIMEOUT_MS);
  const forwardAbort = () => {
    read.abort();
  };
  input.signal.addEventListener("abort", forwardAbort);

  try {
    // Raced against the abort as well as handed it: a `fetch` that ignores its signal must not hold the read open.
    return await untilAborted(
      readListing(input.room, read.signal),
      read.signal,
    );
  } catch {
    return {
      kind: "unavailable",
      reason: timeout.hasExpired ? "timeout" : "aborted",
    };
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", forwardAbort);
  }
}

async function readListing(
  room: DesignRoom,
  signal: AbortSignal,
): Promise<PresetListing> {
  let response: Response;
  try {
    response = await fetch(presetListingUrl(room), {
      method: "GET",
      credentials: "omit",
      signal,
    });
  } catch {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return { kind: "unavailable", reason: "network" };
  }
  if (response.status !== OK_STATUS) {
    return { kind: "unavailable", reason: "status" };
  }
  return listingOfResponse(response);
}

async function listingOfResponse(response: Response): Promise<PresetListing> {
  const text = await boundedTextOf(response);
  if (text === undefined) return { kind: "unavailable", reason: "too-large" };
  const payload = parsedJson(text);
  if (!isObject(payload)) return { kind: "unavailable", reason: "malformed" };
  const { presets } = payload as WireListing;
  if (!Array.isArray(presets)) {
    return { kind: "unavailable", reason: "malformed" };
  }
  return { kind: "listed", presets: validatedPresetSummaries(presets) };
}

/**
 * The body as text, or `undefined` once it passes `MAX_LISTING_BYTES`. A declared length over the bound is refused
 * before a byte is read; otherwise the stream is counted as it arrives and cancelled at the bound, since `json()` would
 * buffer the whole of an oversized answer first.
 */
async function boundedTextOf(response: Response): Promise<string | undefined> {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > MAX_LISTING_BYTES) return undefined;
  const reader = response.body?.getReader();
  if (reader === undefined) return textWithinBound(await response.text());

  const decoder = new TextDecoder();
  let text = "";
  let receivedBytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return text + decoder.decode();
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > MAX_LISTING_BYTES) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

/** A body that arrived whole (no stream to count) is measured in bytes, not in the characters `length` counts. */
function textWithinBound(text: string): string | undefined {
  return new TextEncoder().encode(text).byteLength > MAX_LISTING_BYTES
    ? undefined
    : text;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The items of a received list that stand on their own, in the order sent, at most `PRESET_LIST_LIMIT` of them. The
 * cut comes first, so a list of thousands costs `PRESET_LIST_LIMIT` parses.
 */
function validatedPresetSummaries(
  items: readonly unknown[],
): readonly PresetSummary[] {
  return items
    .slice(0, PRESET_LIST_LIMIT)
    .flatMap((item) => summaryOfItem(item) ?? []);
}

/**
 * One item rebuilt from its design. The design is parsed by the domain's schema, and everything that describes the
 * room (shape, walls, height) and the kitchen (the name's facts) is read off that parsed design, never off the wire's
 * own columns, so an item cannot say one room and carry another. The image address is made here from the id. Only the
 * typed name is taken from the item, as text.
 */
function summaryOfItem(item: unknown): PresetSummary | undefined {
  if (!isObject(item)) return undefined;
  const wire = item as WireItem;
  const { id } = wire;
  if (typeof id !== "string" || !isDesignId(id)) return undefined;
  const parsed = DesignSchema.safeParse(wire.design);
  if (!parsed.success) return undefined;

  try {
    const { shape, walls, heightMm } = presetRoomOf(parsed.data);
    const typedName = showableTypedName(wire.typedName);
    return {
      id,
      shape,
      walls,
      heightMm,
      ...(typedName === undefined ? {} : { typedName }),
      nameFacts: presetNameFactsOf(parsed.data),
      imageUrl: presetImagePath(id),
      design: parsed.data,
    };
  } catch {
    return undefined;
  }
}

/** The typed name when it is plain showable text, and `undefined` (the generated name) otherwise. It is only ever
 *  rendered as a React text child, and as an image's `alt` (React escapes an attribute's value as it does a child's):
 *  never as markup, an address, or the name of an attribute. */
function showableTypedName(value: unknown): string | undefined {
  return isShowablePresetName(value) ? value : undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `work`, or a rejection the moment `signal` aborts, whether or not `work` ever notices. */
function untilAborted<Value>(
  work: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    const abort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
