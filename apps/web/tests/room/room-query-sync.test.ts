import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { getPathname } from "@/i18n/navigation";
import { metresTextForUrl } from "@/room/metres-text";
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
import {
  parseRoomUrlState,
  type RoomSearchParams,
} from "@/room/room-url-state";

/** Criterion 21 asks for at least 500 cases. */
const SWEEP_RUNS = 500;

/** The locale the href builder prefixes; the draft itself takes none since ADR 0126. */
const LOCALE = "ro";

const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** A room the customer could be looking at, as a query and as the draft that query reads into. */
function draftOf(search: string): RoomDraft {
  const query = queryOf(search);
  return roomDraftFromQuery(roomShapeInQuery(query) ?? "L", query);
}

/** A query as the browser hands it over: a repeated key stays an array, since `singleValue` reads it. */
function queryOf(search: string): RoomSearchParams {
  return queryFromSearchParams(new URLSearchParams(search));
}

function canonicalTextOf(draft: RoomDraft): string {
  return canonicalRoomQuery(draft).toString();
}

/** What the screen would read, stated once so each case names only what it varies; no write is in flight by default. */
function reconcile(input: {
  draft: RoomDraft;
  lastSeenText: string;
  liveText: string;
  writtenNotYetSeen?: readonly string[];
}) {
  return reconcileRoomDraft({
    draft: input.draft,
    lastSeenText: input.lastSeenText,
    liveQuery: queryOf(input.liveText),
    liveText: input.liveText,
    writtenNotYetSeen: input.writtenNotYetSeen ?? [],
  });
}

function lengthShown(draft: RoomDraft, field: RoomLengthField): string {
  return draft.lengths[field].text;
}

const A_TYPED_L_ROOM =
  "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left";

describe("the URL changed, or the draft did (criterion 20)", () => {
  it("leaves the draft untouched while only the draft is moving", () => {
    const typing = withEnteredText(draftOf(A_TYPED_L_ROOM), {
      field: "wallA",
      text: "3500",
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
    // "3,6" is not whole millimetres, so the canonical query cannot carry it and the echo must not re-seed the field.
    const halfTyped = withEnteredText(draftOf("shape=L&height=2.6"), {
      field: "wallA",
      text: "3,6",
    });
    const ourOwnWrite = canonicalTextOf(halfTyped);

    const reconciled = reconcile({
      draft: halfTyped,
      lastSeenText: "shape=L",
      liveText: ourOwnWrite,
    });

    // Identity, not equality: `use-typing-pause.ts` tells our own echo from an arrival by this object.
    expect(reconciled.draft).toBe(halfTyped);
    expect(lengthShown(reconciled.draft, "wallA")).toBe("3,6");
    expect(reconciled.lastSeenText).toBe(ourOwnWrite);
  });

  it("re-seeds every field, the shape and the direction for a room the draft did not write", () => {
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
    expect(lengthShown(reconciled.draft, "wallA")).toBe("4200");
    expect(lengthShown(reconciled.draft, "wallC")).toBe("2180");
    expect(reconciled.lastSeenText).toBe(theRoomBackLandsOn);
  });

  it("keeps the shape it has when the live query names none, and clears what the query cannot answer", () => {
    // `Înapoi` pushes the bare pathname; the write side refuses to sync while that is the live query.
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
    // `useSearchParams().get()` would answer 3.56 here.
    const reconciled = reconcile({
      draft: draftOf("shape=L"),
      lastSeenText: "shape=L",
      liveText: "shape=L&wallA=3.56&wallA=4.2&height=2.6&direction=left",
    });

    expect(lengthShown(reconciled.draft, "wallA")).toBe("");
    expect(lengthShown(reconciled.draft, "height")).toBe("2600");
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

/** A length as it could arrive in a query: values the parser reads, values it refuses, and neither. */
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
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.constantFrom(...EVERY_SHAPE),
        (query, fallbackShape) => {
          const shape = roomShapeInQuery(query) ?? fallbackShape;

          const once = canonicalTextOf(roomDraftFromQuery(shape, query));
          const twice = canonicalTextOf(
            roomDraftFromQuery(
              roomShapeInQuery(queryOf(once)) ?? fallbackShape,
              queryOf(once),
            ),
          );

          expect(twice).toBe(once);
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("reconciles an arriving query into a draft that reconciles to itself", () => {
    fc.assert(
      fc.property(ANY_ARRIVING_QUERY, (query) => {
        const shape = roomShapeInQuery(query) ?? "L";
        const arrived = roomDraftFromQuery(shape, query);
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

/** The empty L room 1B opens on, as the first settle writes it. */
const THE_EMPTY_L_ROOM = "shape=L&direction=left";

/** The empty L room with `text` typed into wall A. */
function typedIntoWallA(text: string): RoomDraft {
  return withEnteredText(draftOf(THE_EMPTY_L_ROOM), { field: "wallA", text });
}

/** Any room's query as a settle would have written it: canonical text, never raw. */
const ANY_WRITTEN_TEXT = ANY_ARRIVING_QUERY.map((query) =>
  canonicalTextOf(roomDraftFromQuery(roomShapeInQuery(query) ?? "L", query)),
);

/** Any room a customer could be editing, with text in wall A that is not yet a length. */
const ANY_DRAFT_WITH_UNPARSED_TEXT = ANY_ARRIVING_QUERY.map((query) =>
  withEnteredText(roomDraftFromQuery(roomShapeInQuery(query) ?? "L", query), {
    field: "wallA",
    text: "3,6",
  }),
);

/** The texts a query arrives as, which the pure rule reads as `liveText`. */
function arrivingTextOf(query: Record<string, string>): string {
  return new URLSearchParams(query).toString();
}

describe("an older write of ours echoing after the draft moved on (S3b-5, S3b-3, S3b-4)", () => {
  it("keeps the draft object, and forgets that write, when it echoes after a newer keystroke", () => {
    const writtenAtThree = canonicalTextOf(typedIntoWallA("3"));
    const typedOnToThirtySix = typedIntoWallA("36");

    const reconciled = reconcile({
      draft: typedOnToThirtySix,
      lastSeenText: THE_EMPTY_L_ROOM,
      liveText: writtenAtThree,
      writtenNotYetSeen: [writtenAtThree],
    });

    // Identity, not equality: `use-typing-pause.ts` tells an arrival from our own echo by this object.
    expect(reconciled.draft).toBe(typedOnToThirtySix);
    expect(lengthShown(reconciled.draft, "wallA")).toBe("36");
    expect(reconciled.lastSeenText).toBe(writtenAtThree);
    expect(reconciled.writtenNotYetSeen).toEqual([]);
  });

  it("forgets the echoed write and every older one, and keeps the writes sent after it", () => {
    // Next discards a pending navigation when a newer one is dispatched, so nothing sent before an echo can commit.
    const [first, second, third] = ["3", "36", "365"].map((text) =>
      canonicalTextOf(typedIntoWallA(text)),
    );

    const reconciled = reconcile({
      draft: typedIntoWallA("3650"),
      lastSeenText: THE_EMPTY_L_ROOM,
      liveText: String(second),
      writtenNotYetSeen: [String(first), String(second), String(third)],
    });

    expect(reconciled.writtenNotYetSeen).toEqual([third]);
  });

  it("keeps a write still coming when the first of two copies of a repeated text echoes", () => {
    // 3, 36, back to 3 writes A, B, A. Under a commit race the first A arrives while B is still coming, so B must
    // stay; the text cannot say which A arrived, so the rule keeps both.
    const [atThree, atThirtySix] = ["3", "36"].map((text) =>
      canonicalTextOf(typedIntoWallA(text)),
    );

    const reconciled = reconcile({
      draft: typedIntoWallA("35"),
      lastSeenText: THE_EMPTY_L_ROOM,
      liveText: String(atThree),
      writtenNotYetSeen: [
        String(atThree),
        String(atThirtySix),
        String(atThree),
      ],
    });

    expect(reconciled.writtenNotYetSeen).toEqual([atThirtySix, atThree]);
  });

  it("re-seeds, and forgets every write, for an arrival neither written nor the draft's own text", () => {
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.array(ANY_WRITTEN_TEXT, { maxLength: 4 }),
        ANY_ARRIVING_QUERY,
        (editing, writtenNotYetSeen, arriving) => {
          const draft = roomDraftFromQuery(
            roomShapeInQuery(editing) ?? "L",
            editing,
          );
          const liveText = arrivingTextOf(arriving);
          fc.pre(liveText !== canonicalTextOf(draft));
          fc.pre(!writtenNotYetSeen.includes(liveText));

          const reconciled = reconcile({
            draft,
            lastSeenText: "shape=the-room-before",
            liveText,
            writtenNotYetSeen,
          });

          const liveQuery = queryOf(liveText);
          expect(reconciled.draft).toEqual(
            roomDraftFromQuery(
              roomShapeInQuery(liveQuery) ?? draft.shape,
              liveQuery,
            ),
          );
          expect(reconciled.writtenNotYetSeen).toEqual([]);
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps D45's residue exactly: an arrival equal to the draft's text keeps it, whatever was written", () => {
    // The `draftText` branch keeps the draft and its unparsed text whether or not it was written; the list left
    // is the writes after the oldest copy of the arrival (`writtenAfter`).
    fc.assert(
      fc.property(
        ANY_DRAFT_WITH_UNPARSED_TEXT,
        fc.array(ANY_WRITTEN_TEXT, { maxLength: 4 }),
        fc.array(fc.nat(), { maxLength: 2 }),
        (draft, otherWrites, insertionPoints) => {
          const draftText = canonicalTextOf(draft);
          const writtenNotYetSeen = withTextInserted(
            otherWrites,
            draftText,
            insertionPoints,
          );

          const reconciled = reconcile({
            draft,
            lastSeenText: "shape=the-room-before",
            liveText: draftText,
            writtenNotYetSeen,
          });

          expect(reconciled.draft).toBe(draft);
          expect(lengthShown(reconciled.draft, "wallA")).toBe("3,6");
          expect(reconciled.writtenNotYetSeen).toEqual(
            writtenAfterOldestCopyOf(writtenNotYetSeen, draftText),
          );
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });
});

/** `list` with `text` spliced in at each of `points`, wrapped to the list's length. */
function withTextInserted(
  list: readonly string[],
  text: string,
  points: readonly number[],
): readonly string[] {
  return points.reduce<readonly string[]>((current, point) => {
    const at = point % (current.length + 1);
    return [...current.slice(0, at), text, ...current.slice(at)];
  }, list);
}

/** The oracle for the pruning rule: everything after the oldest copy of `arrived`, or nothing. Walks from the
 *  oldest end so it shares no index arithmetic with the production code. */
function writtenAfterOldestCopyOf(
  list: readonly string[],
  arrived: string,
): readonly string[] {
  const remaining = [...list];
  while (remaining.length > 0) {
    if (remaining.shift() === arrived) return remaining;
  }
  return [];
}

/** One step of the loop as the pure rule sees it. A backspace lets a written text recur. */
type LoopEvent =
  | { readonly kind: "keystroke"; readonly digit: string }
  | { readonly kind: "backspace" }
  | { readonly kind: "settle" }
  | { readonly kind: "echo"; readonly supersededCount: number }
  | { readonly kind: "traversal" };

const ANY_LOOP_EVENT: fc.Arbitrary<LoopEvent> = fc.oneof(
  fc
    .constantFrom("3", "6")
    .map((digit) => ({ kind: "keystroke", digit }) as const),
  fc.constant({ kind: "backspace" } as const),
  fc.constant({ kind: "settle" } as const),
  fc
    .integer({ min: 0, max: 2 })
    .map((supersededCount) => ({ kind: "echo", supersededCount }) as const),
  fc.constant({ kind: "traversal" } as const),
);

/** How the writes come back, in dispatch order: discard (only the newest echoes), commit race (all, oldest
 *  first), mixed (any in-flight write may echo, the ones before it were discarded). */
type DeliveryOrder = "discard" | "commit race" | "mixed";

const EVERY_DELIVERY_ORDER: readonly DeliveryOrder[] = [
  "discard",
  "commit race",
  "mixed",
];

/** The loop driven through `reconcileRoomDraft`, standing in for the hook: a settle writes and records whenever
 *  the draft's text differs from the live one, so a text typed back to (a backspace) is recorded twice. */
class ReconciliationLoop {
  private draft = draftOf(THE_EMPTY_L_ROOM);
  private lastSeenText = THE_EMPTY_L_ROOM;
  private writtenNotYetSeen: readonly string[] = [];
  private undelivered: string[] = [];
  private traversalCount = 0;

  constructor(private readonly order: DeliveryOrder) {}

  apply(event: LoopEvent): void {
    if (event.kind === "keystroke") this.type(event.digit);
    if (event.kind === "backspace") this.backspace();
    if (event.kind === "settle") this.settle();
    if (event.kind === "echo") this.echo(event.supersededCount);
    if (event.kind === "traversal") this.traverse();
  }

  private type(digit: string): void {
    this.enterWallA(lengthShown(this.draft, "wallA") + digit);
  }

  private backspace(): void {
    this.enterWallA(lengthShown(this.draft, "wallA").slice(0, -1));
  }

  private enterWallA(text: string): void {
    this.draft = withEnteredText(this.draft, { field: "wallA", text });
  }

  private settle(): void {
    const draftText = canonicalTextOf(this.draft);
    if (draftText === this.lastSeenText) return;
    if (this.order === "discard") this.undelivered = [];
    this.undelivered.push(draftText);
    this.writtenNotYetSeen = [...this.writtenNotYetSeen, draftText];
  }

  private echo(supersededCount: number): void {
    const index =
      this.order === "mixed"
        ? Math.min(supersededCount, this.undelivered.length - 1)
        : 0;
    const arrived = this.undelivered[index];
    if (arrived === undefined) return;
    this.undelivered = this.undelivered.slice(index + 1);
    this.arriveAndCheckTheBound(arrived);
  }

  private traverse(): void {
    this.traversalCount += 1;
    // A traversal discards every pending write, so none of them can echo afterwards.
    this.undelivered = [];
    const wallB = metresTextForUrl(this.traversalCount);
    this.arriveAndCheckTheBound(
      `shape=U&wallA=1&wallB=${wallB}&wallC=1&direction=right`,
    );

    expect(this.writtenNotYetSeen).toEqual([]);
  }

  private arriveAndCheckTheBound(liveText: string): void {
    const before = this.writtenNotYetSeen;
    const changesTheLiveText = liveText !== this.lastSeenText;
    const reconciled = reconcile({
      draft: this.draft,
      lastSeenText: this.lastSeenText,
      liveText,
      writtenNotYetSeen: before,
    });
    this.draft = reconciled.draft;
    this.lastSeenText = reconciled.lastSeenText;
    this.writtenNotYetSeen = reconciled.writtenNotYetSeen;
    if (!changesTheLiveText) return;

    expect(this.writtenNotYetSeen).toEqual(
      writtenAfterOldestCopyOf(before, liveText),
    );
    if (before.includes(liveText)) {
      expect(this.writtenNotYetSeen.length).toBeLessThan(before.length);
    }
  }
}

describe("the writes not yet seen keep the bound the rule can know (S3b-7, restated in S3b.10)", () => {
  it.each(EVERY_DELIVERY_ORDER)(
    "keeps exactly the writes after the oldest copy of each arrival, and none after a traversal, under %s",
    (order) => {
      fc.assert(
        fc.property(fc.array(ANY_LOOP_EVENT, { maxLength: 40 }), (events) => {
          const loop = new ReconciliationLoop(order);

          for (const event of events) loop.apply(event);
        }),
        { numRuns: SWEEP_RUNS },
      );
    },
  );
});

/** Every whole millimetre any approved wall or ceiling can take, from the smallest bound to the
 *  largest, read off the policy rather than restated. */
function approvedLengthRange(): MillimetreBounds {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  const bounds = [walls.wallA, walls.wallB, APPROVED_ROOM_POLICY.heightBounds];
  return {
    minMm: Math.min(...bounds.map((bound) => bound.minMm)),
    maxMm: Math.max(...bounds.map((bound) => bound.maxMm)),
  };
}

/** Nine kilometres, far past any room: the widest value the round-trip property sweeps. */
const LARGEST_ROUND_TRIPPED_MM = 9_000_000;

const L_ROOM_FIELDS: readonly RoomLengthField[] = ["wallA", "wallB", "height"];

/** `mm` typed into `field` of an L draft, carried to the URL, and read back as a reload would. */
function typedThenReloaded(field: RoomLengthField, text: string) {
  const typed = withEnteredText(draftOf("shape=L"), { field, text });
  const query = canonicalRoomQuery(typed);
  const reloaded = roomDraftFromQuery("L", queryOf(query.toString()));
  return { wire: query.get(field), shown: lengthShown(reloaded, field) };
}

describe("whole millimetres in the field, metres on the wire (ADR 0126, criteria S1b-3 and S1b-4)", () => {
  it("round-trips every approved length exactly, in every L field", () => {
    const { minMm, maxMm } = approvedLengthRange();
    const drifted: string[] = [];
    for (let mm = minMm; mm <= maxMm; mm += 1) {
      for (const field of L_ROOM_FIELDS) {
        const { wire, shown } = typedThenReloaded(field, String(mm));
        if (wire !== metresTextForUrl(mm) || shown !== String(mm)) {
          drifted.push(`${field}=${String(mm)} → ${String(wire)} → ${shown}`);
        }
      }
    }

    expect(maxMm).toBeGreaterThan(minMm);
    expect(drifted).toEqual([]);
  });

  it(`round-trips any whole millimetre up to ${String(LARGEST_ROUND_TRIPPED_MM)}, past every bound`, () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: LARGEST_ROUND_TRIPPED_MM }),
        fc.constantFrom(...L_ROOM_FIELDS),
        (mm, field) => {
          expect(typedThenReloaded(field, String(mm))).toEqual({
            wire: metresTextForUrl(mm),
            shown: String(mm),
          });
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("writes a typed 3560 as the metres the wire has always carried", () => {
    expect(typedThenReloaded("wallA", "3560")).toEqual({
      wire: "3.56",
      shown: "3560",
    });
  });

  it("normalises a typed leading zero only through the URL round trip", () => {
    expect(typedThenReloaded("wallA", "03600")).toEqual({
      wire: "3.6",
      shown: "3600",
    });
  });

  it("puts nothing on the wire for text that is not whole millimetres", () => {
    expect(typedThenReloaded("wallA", "3,6")).toEqual({
      wire: null,
      shown: "",
    });
  });
});

describe("a link written before ADR 0126 still means what it meant (criterion S1b-3)", () => {
  it("reads a bare integer on the wire as whole metres, and refills it as millimetres", () => {
    const oldLink = "shape=L&wallA=4&wallB=2.4&height=2.6&direction=left";

    const arrived = draftOf(oldLink);

    expect(L_ROOM_FIELDS.map((field) => lengthShown(arrived, field))).toEqual([
      "4000",
      "2400",
      "2600",
    ]);
    expect(parseRoomUrlState(queryOf(canonicalTextOf(arrived))).substate).toBe(
      "1D",
    );
  });

  it("still reads an old link's decimal comma", () => {
    const arrived = draftOf("shape=L&wallA=3,6&wallB=2.4&height=2.6");

    expect(arrived.lengths.wallA).toEqual({ text: "3600", millimetres: 3600 });
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
  // A departure recognises its own flush by string equality with `useSearchParams().toString()`, so next-intl's
  // serialisation must reproduce the canonical text exactly. Criterion 21 does not guard this: a mismatch would
  // strand every departure while the idempotence sweep stays green.

  it("survives next-intl's href builder and the browser's own re-serialisation", () => {
    fc.assert(
      fc.property(ANY_ARRIVING_QUERY, (query) => {
        const shape = roomShapeInQuery(query) ?? "L";
        const flushed = canonicalTextOf(roomDraftFromQuery(shape, query));

        const cameBack = queryTextComingBackFrom(
          theHrefTheSyncWouldAskFor(flushed),
        );

        expect(cameBack).toBe(flushed);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps the canonical key order the parser and the serialiser both read", () => {
    // The concrete case beside the property: a sweep over generated rooms can agree on order by luck of one shape.
    const flushed =
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left";

    expect(queryTextComingBackFrom(theHrefTheSyncWouldAskFor(flushed))).toBe(
      flushed,
    );
  });

  it("puts the flushed query on the locale's own path", () => {
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
