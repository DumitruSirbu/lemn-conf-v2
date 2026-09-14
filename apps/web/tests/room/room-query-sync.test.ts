// **The convergence loop's pure half** — M7 wave 7F1-D45, criteria 20 and 21, ruling R9.
//
// No DOM and no router: the rule that decides whether a live query is *our own write coming back* or
// *a different room the customer is now in* is a function of four values, and it is asserted here as
// one. The component behaviours that rest on it are `room-url-round-trip.dom.test.ts`'s.
//
// **Criterion 21 is the load-bearing one.** A replace loop — render writes, write re-renders,
// re-render writes — is the only failure in this design that gets *worse* with traffic, costs a
// request per settle interval per customer, and is invisible in development. What forbids it is that
// `canonical ∘ draftFrom` is a **fixed point**, swept below over queries the parser accepts and
// queries it refuses alike.
import { fc } from "@fast-check/vitest";
import type { RoomShape } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { getPathname } from "@/i18n/navigation";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  queryFromSearchParams,
  reconcileRoomDraft,
  roomDraftFromQuery,
  roomShapeInQuery,
} from "@/room/room-query-sync";
import {
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import type { RoomSearchParams } from "@/room/room-url-state";

/** Criterion 21 asks for at least 500 cases. */
const SWEEP_RUNS = 500;

const LOCALE = "ro";

const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** A room the customer could be looking at, as a query and as the draft that query reads into. */
function draftOf(search: string): RoomDraft {
  const query = queryOf(search);
  return roomDraftFromQuery(roomShapeInQuery(query) ?? "L", query, LOCALE);
}

/** A query as the browser hands it over: a repeated key stays an array, because that is what
 *  `singleValue` reads and a collapsed one would be a different question. */
function queryOf(search: string): RoomSearchParams {
  return queryFromSearchParams(new URLSearchParams(search));
}

function canonicalTextOf(draft: RoomDraft): string {
  return canonicalRoomQuery(draft).toString();
}

/** What the screen would read, stated once so each case below names only what it varies. */
function reconcile(input: {
  draft: RoomDraft;
  lastSeenText: string;
  liveText: string;
}) {
  return reconcileRoomDraft({
    draft: input.draft,
    lastSeenText: input.lastSeenText,
    liveQuery: queryOf(input.liveText),
    liveText: input.liveText,
    locale: LOCALE,
  });
}

function lengthShown(draft: RoomDraft, field: RoomLengthField): string {
  return draft.lengths[field].text;
}

const A_TYPED_L_ROOM =
  "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left";

describe("the URL changed, or the draft did (criterion 20)", () => {
  it("leaves the draft untouched while only the draft is moving", () => {
    // The typing path, and the reason a keystroke can never re-seed: typing moves the canonical
    // query and leaves the live one where it was, so the rule sees a live query it has already
    // reconciled against and does nothing at all.
    const typing = withEnteredText(draftOf(A_TYPED_L_ROOM), {
      field: "wallA",
      text: "3,5",
    });

    const reconciled = reconcile({
      draft: typing,
      lastSeenText: A_TYPED_L_ROOM,
      liveText: A_TYPED_L_ROOM,
    });

    expect(reconciled.draft).toBe(typing);
    expect(reconciled.lastSeenText).toBe(A_TYPED_L_ROOM);
  });

  it("keeps the draft, and text that is not yet a length, when our own write echoes back", () => {
    // I1. *"3,"* is on its way to a value and is nowhere in the canonical query, so the write that
    // comes back cannot carry it — which is exactly why the echo must not re-seed the field.
    const halfTyped = withEnteredText(draftOf("shape=L&height=2.6"), {
      field: "wallA",
      text: "3,",
    });
    const ourOwnWrite = canonicalTextOf(halfTyped);

    const reconciled = reconcile({
      draft: halfTyped,
      lastSeenText: "shape=L",
      liveText: ourOwnWrite,
    });

    expect(reconciled.draft).toBe(halfTyped);
    expect(lengthShown(reconciled.draft, "wallA")).toBe("3,");
    expect(reconciled.lastSeenText).toBe(ourOwnWrite);
  });

  it("re-seeds every field, the shape and the direction for a room the draft did not write", () => {
    // The rule's reason for existing: a browser Back hands the client another entry's query, and
    // the draft standing over it is the room the customer has just left.
    const theRoomLeftBehind = draftOf(A_TYPED_L_ROOM);
    const theRoomBackLandsOn =
      "shape=U&wallA=4.2&wallB=3.1&wallC=2.18&height=2.5&direction=right";

    const reconciled = reconcile({
      draft: theRoomLeftBehind,
      lastSeenText: A_TYPED_L_ROOM,
      liveText: theRoomBackLandsOn,
    });

    expect(reconciled.draft.shape).toBe("U");
    expect(reconciled.draft.cornerDirection).toBe("right");
    expect(lengthShown(reconciled.draft, "wallA")).toBe("4,20");
    expect(lengthShown(reconciled.draft, "wallC")).toBe("2,18");
    expect(reconciled.lastSeenText).toBe(theRoomBackLandsOn);
  });

  it("keeps the shape it has when the live query names none, and clears what the query cannot answer", () => {
    // *Înapoi* pushes the bare pathname, so the live query answers nothing. The draft has no shape
    // to fall back on but its own — and the fields it still shows are the ones the URL no longer
    // holds, which is why the write side refuses to sync at all while this is the live query (I6).
    const reconciled = reconcile({
      draft: draftOf(A_TYPED_L_ROOM),
      lastSeenText: A_TYPED_L_ROOM,
      liveText: "",
    });

    expect(reconciled.draft.shape).toBe("L");
    expect(lengthShown(reconciled.draft, "wallA")).toBe("");
    expect(reconciled.lastSeenText).toBe("");
  });

  it("re-seeds from a repeated key as the parser reads it — as no value at all", () => {
    // Risk 4, at the seam it would enter through. `useSearchParams().get()` would answer 3.56 here.
    const reconciled = reconcile({
      draft: draftOf("shape=L"),
      lastSeenText: "shape=L",
      liveText: "shape=L&wallA=3.56&wallA=4.2&height=2.6&direction=left",
    });

    expect(lengthShown(reconciled.draft, "wallA")).toBe("");
    expect(lengthShown(reconciled.draft, "height")).toBe("2,60");
  });
});

describe("a repeated key is not a value (risk 4)", () => {
  it("keeps both answers to one question, rather than picking the first", () => {
    expect(queryOf("shape=L&wallA=3.56&wallA=4.2")).toEqual({
      shape: "L",
      wallA: ["3.56", "4.2"],
    });
  });

  it("reads a key answered once as the value it holds", () => {
    expect(queryOf("shape=L&wallA=3.56")).toEqual({
      shape: "L",
      wallA: "3.56",
    });
  });

  it("reads an empty query as a query that answers nothing", () => {
    expect(queryOf("")).toEqual({});
  });
});

/** A length as it could arrive in a query: values the parser reads, values it refuses, and the
 *  shapes of text that are neither. */
const ANY_LENGTH_TEXT = fc.oneof(
  fc
    .integer({ min: 1, max: 9_999_999 })
    .map(
      (mm) =>
        `${String(Math.floor(mm / 1000))}.${String(mm % 1000).padStart(3, "0")}`,
    ),
  fc.constantFrom(
    "",
    "0",
    "-3.56",
    "3.5605",
    "3,560.00",
    "99999999999999999999",
    "3,",
  ),
  fc.string(),
);

const ANY_ARRIVING_QUERY = fc.record({
  shape: fc.oneof(fc.constantFrom(...EVERY_SHAPE, "bogus"), fc.string()),
  wallA: ANY_LENGTH_TEXT,
  wallB: ANY_LENGTH_TEXT,
  wallC: ANY_LENGTH_TEXT,
  height: ANY_LENGTH_TEXT,
  direction: fc.constantFrom("left", "right", "sideways", ""),
  utm_source: fc.string(),
});

describe("the loop settles, and it settles once (criterion 21)", () => {
  it("writes a canonical query that reading and writing again reproduces exactly", () => {
    // `canonical ∘ draftFrom` is idempotent, so a screen that arrives at a non-canonical URL writes
    // **once** and then sees its own write. Without this the effect would find the live query and
    // the draft's query different forever, and issue a navigation every settle interval.
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.constantFrom(...EVERY_SHAPE),
        (query, fallbackShape) => {
          const shape = roomShapeInQuery(query) ?? fallbackShape;

          const once = canonicalTextOf(
            roomDraftFromQuery(shape, query, LOCALE),
          );
          const twice = canonicalTextOf(
            roomDraftFromQuery(
              roomShapeInQuery(queryOf(once)) ?? fallbackShape,
              queryOf(once),
              LOCALE,
            ),
          );

          expect(twice).toBe(once);
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("reconciles an arriving query into a draft that reconciles to itself", () => {
    // The same property stated over the rule that uses it: once the write has echoed back, a second
    // pass over the same live query is a no-op, which is what "it settles once" means at the seam
    // the component reads.
    fc.assert(
      fc.property(ANY_ARRIVING_QUERY, (query) => {
        const shape = roomShapeInQuery(query) ?? "L";
        const arrived = roomDraftFromQuery(shape, query, LOCALE);
        const written = canonicalTextOf(arrived);

        const echo = reconcile({
          draft: arrived,
          lastSeenText: new URLSearchParams(
            query as Record<string, string>,
          ).toString(),
          liveText: written,
        });

        expect(echo.draft).toBe(arrived);
        expect(canonicalTextOf(echo.draft)).toBe(written);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });
});

/** The room screen's own path, unprefixed, as `usePathname` hands it to the sync. */
const ROOM_PATHNAME = "/configurator/room";

/** The query a href carries, as `useSearchParams().toString()` would report it back. */
function queryTextComingBackFrom(href: string): string {
  const questionMark = href.indexOf("?");
  return new URLSearchParams(
    questionMark === -1 ? "" : href.slice(questionMark + 1),
  ).toString();
}

/** What the sync asks the router for, through next-intl's **real** href builder rather than a stub:
 *  `useRouter().replace` forwards `{ pathname, query }` to exactly this. */
function theHrefTheSyncWouldAskFor(queryText: string): string {
  return getPathname({
    href: { pathname: ROOM_PATHNAME, query: queryEntriesOf(queryText) },
    locale: LOCALE,
  });
}

describe("a flushed query comes back byte-identical (the departure's premise)", () => {
  // **This is what strand-freedom actually rests on, and criterion 21 does not guard it.**
  // Idempotence is a property of `canonical ∘ draftFrom` — the parse/format round trip. A departure
  // recognises its own flush by **string equality** between the text it wrote and
  // `useSearchParams().toString()` after the router has committed, so what has to hold is that
  // next-intl's serialisation and `URLSearchParams`' reproduce the canonical text exactly: same key
  // order, same percent-encoding.
  //
  // **If this went red, every departure would strand and criterion 21 would stay green** — the
  // flush would never equal the live query, the push would never fire, and both buttons would go
  // dead with the idempotence sweep still passing. That is why it is asserted here by name instead
  // of being inferred from a departure test happening to pass.

  it("survives next-intl's href builder and the browser's own re-serialisation", () => {
    fc.assert(
      fc.property(ANY_ARRIVING_QUERY, (query) => {
        const shape = roomShapeInQuery(query) ?? "L";
        const flushed = canonicalTextOf(
          roomDraftFromQuery(shape, query, LOCALE),
        );

        const cameBack = queryTextComingBackFrom(
          theHrefTheSyncWouldAskFor(flushed),
        );

        expect(cameBack).toBe(flushed);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps the canonical key order the parser and the serialiser both read", () => {
    // The concrete case beside the property, because *"same bytes"* is mostly a claim about order
    // and a sweep over generated rooms can agree on order by luck of one shape.
    const flushed =
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left";

    expect(queryTextComingBackFrom(theHrefTheSyncWouldAskFor(flushed))).toBe(
      flushed,
    );
  });

  it("puts the flushed query on the locale's own path", () => {
    // The other half of the href, so a builder that silently stopped prefixing would be a failure
    // here rather than a mystery in the DOM suites.
    expect(theHrefTheSyncWouldAskFor("shape=L&direction=left")).toBe(
      `/${LOCALE}${ROOM_PATHNAME}?shape=L&direction=left`,
    );
  });
});

describe("the shape a query names is the parser's answer", () => {
  it.each(EVERY_SHAPE)(
    "reads %s back out of a query that names it",
    (shape) => {
      expect(roomShapeInQuery({ shape })).toBe(shape);
    },
  );

  it.each([
    ["a query that names no shape at all", {}],
    ["a shape the product does not have", { shape: "hexagonal" }],
    ["a shape answered twice", { shape: ["L", "U"] }],
  ])("names no shape for %s", (_case, query) => {
    expect(roomShapeInQuery(query as RoomSearchParams)).toBeUndefined();
  });
});
