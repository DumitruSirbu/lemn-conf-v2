// **The convergence loop between the room draft and the URL** — M7 wave 7F1-D45, ruling R9.
//
// The draft and the query are two representations of one room, and this module's whole job is to
// make them agree. Three values carry every rule below:
//
// - **`liveText`** — the query the client actually holds, `useSearchParams().toString()`. After a
//   traversal this is the entry's own query; after our own write it is what we wrote.
// - **`draftText`** — `canonicalRoomQuery(draft).toString()`: the shape, every field that already
//   reads as a length, and the direction for the shapes that carry one. No raw draft text ever
//   reaches it, so a half-typed *"3,"* cannot come back from a reload as a value nobody entered.
// - **`lastSeenText`** — the `liveText` already reconciled against. It is what tells *the URL
//   changed* apart from *the draft changed*, which comparing the first two alone cannot do.
//
// **Why the router and not `window.history.replaceState`.** The native call updates the address bar
// and the client hooks without Next's own record of the history entry following it, so on a browser
// Back the router restores the URL it recorded and the typed room is gone. That is defect D4,
// measured in a production build, and `eslint.config.mjs`'s room block now bans the call so the
// mechanism cannot return. Going through `router.replace` is what makes Next's record the URL we
// intend.
//
// **Why a debounce rather than a write per keystroke.** `router.replace` re-runs the page, so the
// settle interval is what keeps a customer filling three fields to a handful of requests while a
// per-keystroke write would spend one on every digit.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// `useSearchParams` is read from `next/navigation` rather than from `@/i18n/navigation`: next-intl
// wraps the navigations that need a locale prefix, and a query is the same query in both locales.
import { usePathname, useRouter } from "@/i18n/navigation";

import { metresTextForUrl } from "./metres-text";
import { parseMetresToMillimetres } from "./parse-metres";
import {
  carriesCornerDirection,
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "./room-draft";
import {
  isCornerDirection,
  parseRoomUrlState,
  requiredFieldsFor,
  singleValue,
  type RoomSearchParams,
  type RoomUrlState,
} from "./room-url-state";

/**
 * How long typing has to stop before the URL is written, in milliseconds (ruling Q-D45-3).
 *
 * Longer than a fast typist's gap between digits (~150–250 ms), so a value is written once rather
 * than three times, and short enough that a customer who stops to look and then reloads still has
 * their room. It is also the bound on **two accepted limits**, both of them a character or two of
 * typing and neither of them a room:
 *
 * 1. **A browser Back *gesture* taken within this interval of the last keystroke leaves that
 *    keystroke out of the entry it leaves**, because the outgoing entry is unwritable once popstate
 *    has fired. The buttons flush (`departTo` below); the gesture cannot be flushed for.
 * 2. **A character typed between tapping a button and that tap's flush landing is lost.** The
 *    write effect below refuses to start a new write while a departure is in flight, so the
 *    character never reaches the URL and the destination is the query that was flushed. *What this
 *    buys:* without it the later write overtakes the flush, the departure fails to recognise its
 *    own echo and disarms, and the customer is left with a primary button that did nothing and no
 *    hard navigation behind it. **A stray character beats a dead *Continuă*** — and on a phone the
 *    tap blurs the field first, so the input this costs is rarer than the one it fixes.
 *
 * Neither limit touches a reload: a reload reads the entry's URL, which the settle has already
 * written.
 */
export const URL_SETTLE_MS = 400;

/** Where a deliberate navigation leads. Held as a value rather than as a closure over the draft,
 *  because a departure is armed when the button is tapped and dispatched a round trip later. */
export type RoomDestination = "shapes" | "presets";

export interface RoomQuerySync {
  readonly draft: RoomDraft;
  readonly setDraft: (draft: RoomDraft) => void;
  /** A deliberate navigation: it flushes a pending write and leaves once the flush has landed, so
   *  the entry left behind is correct before it becomes a back-target. */
  readonly departTo: (destination: RoomDestination) => void;
}

/**
 * The draft the customer is editing, kept in step with the URL the browser actually holds.
 *
 * `seedShape` is **only** the shape the first draft is built with. Every later re-seeding reads the
 * shape out of the live query inside `reconcileRoomDraft`, so passing a different one after mount
 * changes nothing. It is a parameter rather than a read of the live query here because the caller
 * has already proved a shape is there by rendering this step at all, and asking again would force
 * an `undefined` branch that no URL can reach.
 */
export function useRoomQuerySync(seedShape: RoomShape): RoomQuerySync {
  const searchParams = useSearchParams();
  const liveQuery = queryFromSearchParams(searchParams);
  const liveText = searchParams.toString();

  const { draft, setDraft } = useReconciledRoomDraft({
    seedShape,
    liveQuery,
    liveText,
  });
  const draftText = canonicalRoomQuery(draft).toString();
  const departTo = useRoomDeparture({ liveQuery, liveText, draftText });

  return { draft, setDraft, departTo };
}

interface ReconciliationInputs {
  /** Read once, in the lazy initialiser below, and inert on every render after it. */
  readonly seedShape: RoomShape;
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
}

interface ReconciledRoomDraft {
  readonly draft: RoomDraft;
  readonly setDraft: (draft: RoomDraft) => void;
}

/**
 * The read half of the loop, as a `setState` **during render** in React's documented
 * adjust-state-when-props-change form. Deliberately not an effect: an effect would paint the stale
 * room first and correct it on the next frame, which is defect D5 with a delay rather than without
 * one.
 */
function useReconciledRoomDraft({
  seedShape,
  liveQuery,
  liveText,
}: ReconciliationInputs): ReconciledRoomDraft {
  const locale = useLocale();
  const [draft, setDraft] = useState<RoomDraft>(() =>
    roomDraftFromQuery(seedShape, liveQuery, locale),
  );
  const [lastSeenText, setLastSeenText] = useState(liveText);

  const reconciled = reconcileRoomDraft({
    draft,
    lastSeenText,
    liveQuery,
    liveText,
    locale,
  });
  if (reconciled.lastSeenText !== lastSeenText) {
    setLastSeenText(reconciled.lastSeenText);
    setDraft(reconciled.draft);
  }

  return { draft: reconciled.draft, setDraft };
}

interface DepartureInputs {
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
  /** `canonicalRoomQuery(draft).toString()` — the draft as the URL would carry it, never raw text. */
  readonly draftText: string;
}

/** A navigation waiting on its own flush: where the customer asked to go, and the exact text that
 *  was written on the way out. The push fires when the live query comes back as that text and on no
 *  other change. */
interface ArmedDeparture {
  readonly destination: RoomDestination;
  readonly flushedText: string;
}

/**
 * The write half of the loop, and the departure that has to flush it.
 *
 * **Both live here because a deliberate navigation must clear the settle timer**, and a rule split
 * between the timer and two button handlers is the rule that gets half-applied. Cancelling the
 * timer and pushing is the tempting version and it re-creates D4 on the fastest path: a customer
 * who types the last digit and taps 100 ms later would leave an entry that never received it.
 *
 * **What happens when a flush never lands, stated because it is a resting place and not a bug.**
 * Next turns a failed navigation into a hard one to the same URL
 * (`next/dist/client/components/app-router.js:214-231`), so the flushed query reaches the address
 * bar anyway and the page reloads with the room intact. If a flush is dropped without that — the
 * departure stays armed, the URL stays stale and the draft stays whole; nothing is lost and nothing
 * retries. **The next tap resolves it**, by re-issuing the flush and re-arming. A keystroke does
 * not, because of the suppression rule above. **Do not add a retry timer** — it would be a third
 * write path chasing a failure nobody has measured, in a module whose whole argument is that there
 * is one.
 */
function useRoomDeparture({
  liveQuery,
  liveText,
  draftText,
}: DepartureInputs): (destination: RoomDestination) => void {
  const navigation = useRoomNavigation();
  const latestNavigation = useRef(navigation);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const armedDeparture = useRef<ArmedDeparture | undefined>(undefined);
  // **I6 — the shape step writes nothing.** No shape in the live query means the customer is at
  // 1A, whatever this component was last mounted for: *Înapoi* pushes the bare pathname and lands
  // exactly there, and a screen that then rewrote the address bar would undo the navigation the
  // customer just made. The screen's own branch now derives from the live query too, so the
  // dimensions step genuinely unmounts at 1A — **and this guard stays**, because an invariant that
  // rests on a tree shape comes back the moment the tree changes.
  const liveQueryNamesARoom = roomShapeInQuery(liveQuery) !== undefined;

  useEffect(() => {
    // The router object next-intl returns is memoised on Next's own router instance, whose identity
    // nothing here can promise. Keying the settle timer on it would restart the debounce on every
    // render, so the timer reads the newest navigation through a ref instead of capturing one.
    latestNavigation.current = navigation;
  });

  // **Declared before the write effect on purpose, and the order is load-bearing.** Effects run in
  // declaration order within a commit, so on a URL change the departure resolves *first* and the
  // write effect below then sees a disarmed ref. Were it the other way round, a traversal arriving
  // while a departure was armed would suppress the one canonicalising write that traversal is owed.
  useEffect(() => {
    const departure = armedDeparture.current;
    if (departure === undefined) return;
    armedDeparture.current = undefined;
    // The flush has committed only when the live query comes back as the text we wrote. Any other
    // change is a traversal overtaking the departure, and a customer who has gone Back does not
    // want the push.
    if (departure.flushedText === liveText) {
      latestNavigation.current.pushTo(departure.destination, liveText);
    }
  }, [liveText]);

  useEffect(() => {
    // **A departure in flight suppresses new writes.** The customer has asked to leave; a keystroke
    // landing after the tap would otherwise start a second write that overtakes the flush, and the
    // departure would read the later write as *not its own flush* and disarm without pushing —
    // a dead primary button. The character typed in that window is lost instead, which is the
    // trade recorded at `URL_SETTLE_MS`. This effect is not re-run when the ref changes, and does
    // not need to be: a departure is armed from an event handler, and the next render after it is
    // the one this guard has to catch.
    if (armedDeparture.current !== undefined) return;
    if (!liveQueryNamesARoom || liveText === draftText) return;
    const timer = setTimeout(() => {
      settleTimer.current = undefined;
      latestNavigation.current.replaceWith(draftText);
    }, URL_SETTLE_MS);
    settleTimer.current = timer;
    // **I2 — a navigation beats a pending write.** Any change to `liveText` runs this cleanup
    // before the next effect, so no `router.replace` can carry a query the customer has already
    // navigated away from.
    return () => {
      clearTimeout(timer);
      settleTimer.current = undefined;
    };
  }, [liveQueryNamesARoom, liveText, draftText]);

  return function departTo(destination: RoomDestination): void {
    if (!liveQueryNamesARoom || liveText === draftText) {
      navigation.pushTo(destination, draftText);
      return;
    }
    // Flush **now** rather than on the settle — the customer is leaving — and leave only once it
    // comes back. Dispatching the push in this same tick would lose the flush entirely: Next marks
    // a pending action discarded when a navigation dispatches, and the history write only happens
    // when the state commits (`next/dist/client/components/app-router-instance.js:146-160`).
    clearTimeout(settleTimer.current);
    settleTimer.current = undefined;
    navigation.replaceWith(draftText);
    armedDeparture.current = { destination, flushedText: draftText };
  };
}

interface RoomNavigation {
  readonly replaceWith: (queryText: string) => void;
  readonly pushTo: (destination: RoomDestination, queryText: string) => void;
}

/** The two navigations this screen makes, each over the query text it carries as an argument. The
 *  shape step is reached at the bare pathname, which is why it has no query of its own. */
function useRoomNavigation(): RoomNavigation {
  const router = useRouter();
  const pathname = usePathname();

  return {
    replaceWith(queryText) {
      // `{ scroll: false }`: the customer is looking at a field, and a write that moved the page
      // under them would be worse than the stale URL it fixes.
      router.replace(
        { pathname, query: queryEntriesOf(queryText) },
        { scroll: false },
      );
    },
    pushTo(destination, queryText) {
      router.push(
        destination === "presets"
          ? { pathname, query: queryEntriesOf(queryText) }
          : { pathname },
      );
    },
  };
}

/**
 * **The reconciliation, as a pure function** (criterion 20).
 *
 * 1. `liveText === lastSeenText` — nothing to do. **This is the typing path**, and it is why a
 *    keystroke can never re-seed the draft: typing moves `draftText` and leaves `liveText` alone.
 * 2. Otherwise the URL changed, so `lastSeenText` follows it, and either
 *    - `liveText` is what this draft would write — **our own write echoing back** — and the draft
 *      is kept exactly as it is, caret, half-typed text and all; or
 *    - the customer is in a different room, and every field, the shape and the direction are
 *      re-seeded from the query they actually hold.
 *
 * **One residue, accepted and bounded** (Wave 7F1-D45): a Back landing on a URL that happens to
 * equal the current `draftText` is read as an echo, so text that never parsed as a length (*"3,"*)
 * stays in its field. The room shown and the URL still agree. A second discriminator to chase it
 * re-seeds on an echo somewhere, which is the defect that matters.
 */
export function reconcileRoomDraft({
  draft,
  lastSeenText,
  liveQuery,
  liveText,
  locale,
}: RoomReconciliationInputs): RoomReconciliation {
  if (liveText === lastSeenText) return { draft, lastSeenText };
  const draftText = canonicalRoomQuery(draft).toString();
  if (liveText === draftText) {
    return { draft, lastSeenText: liveText };
  }
  // A query naming no shape names no room either, so the draft keeps the shape it has and loses
  // only what the query no longer answers for.
  const shape = roomShapeInQuery(liveQuery) ?? draft.shape;
  return {
    draft: roomDraftFromQuery(shape, liveQuery, locale),
    lastSeenText: liveText,
  };
}

export interface RoomReconciliationInputs {
  readonly draft: RoomDraft;
  readonly lastSeenText: string;
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
  readonly locale: string;
}

export interface RoomReconciliation {
  readonly draft: RoomDraft;
  readonly lastSeenText: string;
}

/** Just the two readers this needs, so the hook's `ReadonlyURLSearchParams` and a test's plain
 *  `URLSearchParams` both satisfy it. */
type RepeatedKeyReader = Pick<URLSearchParams, "keys" | "getAll">;

/**
 * **The live query, read by the parser's own rule that a repeated key is not a value.**
 *
 * `useSearchParams().get()` returns the **first** of `?wallA=3.56&wallA=4.2`, which would silently
 * overturn a contract this milestone shipped and tested while leaving every other test green. Read
 * through `getAll`, a repeated key stays an array and `singleValue` refuses it exactly as it
 * refuses the page's own repeated key.
 */
export function queryFromSearchParams(
  searchParams: RepeatedKeyReader,
): RoomSearchParams {
  return Object.fromEntries(
    [...new Set(searchParams.keys())].map((key) => {
      const values = searchParams.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}

/**
 * **The URL is the room's only store** (criterion 9): the shape, every field that already reads as a
 * length, and the corner direction for the shapes that turn one — in `serialiseRoomInput`'s own key
 * order, with `metresTextForUrl`'s own wire form, and nothing else.
 *
 * **A field that does not yet parse is simply absent.** That is the 1B-with-a-marked-field state
 * `parseRoomUrlState` already produces, so no raw draft text ever reaches the query and a half-typed
 * *"3,"* cannot come back from a reload as a value the customer never entered.
 */
export function canonicalRoomQuery(draft: RoomDraft): URLSearchParams {
  const params = new URLSearchParams();
  params.set("shape", draft.shape);
  for (const field of requiredFieldsFor(draft.shape)) {
    const millimetres = draft.lengths[field].millimetres;
    if (millimetres !== undefined) {
      params.set(field, metresTextForUrl(millimetres));
    }
  }
  if (carriesCornerDirection(draft.shape)) {
    // Ruling R6's third layer: the toggle is visible with a position, so the URL says what the
    // customer sees. The parser's reading of an *absent* `direction` is untouched by this.
    params.set("direction", draft.cornerDirection);
  }
  return params;
}

/** The draft a URL arrives as: every field the shape asks for that the query already answers, shown
 *  in the customer's own notation, and the corner the query names or frame 1B's pre-selected left. */
export function roomDraftFromQuery(
  shape: RoomShape,
  query: RoomSearchParams,
  locale: string,
): RoomDraft {
  const withLengths = requiredFieldsFor(shape).reduce(
    (draft, field) => withLengthFromQuery(draft, field, query[field], locale),
    createRoomDraft(shape),
  );
  const direction = singleValue(query.direction);
  return isCornerDirection(direction)
    ? withCornerDirection(withLengths, direction)
    : withLengths;
}

/** The shape a query names, asked of the parser rather than of the query's own `shape` key, so the
 *  form and the parser cannot disagree about what counts as a shape. 1A names none. */
export function roomShapeInQuery(
  query: RoomSearchParams,
): RoomShape | undefined {
  return roomShapeInState(parseRoomUrlState(query));
}

/** The same question of a parse already in hand. The screen marks the sub-state and branches on the
 *  shape from one `parseRoomUrlState`, so the marker and the step it draws cannot describe two
 *  different readings of one URL. */
export function roomShapeInState(state: RoomUrlState): RoomShape | undefined {
  if (state.substate === "1A") return undefined;
  if (state.substate === "1B") return state.shape;
  return state.input.shape;
}

function withLengthFromQuery(
  draft: RoomDraft,
  field: RoomLengthField,
  value: RoomSearchParams[string],
  locale: string,
): RoomDraft {
  const parsed = parseMetresToMillimetres(singleValue(value) ?? "");
  return parsed.ok
    ? withStoredLength(draft, { field, millimetres: parsed.mm, locale })
    : draft;
}

/**
 * The entries next-intl's href builder takes, out of a query text.
 *
 * **Canonical text only.** `Object.fromEntries` keeps the **last** of a repeated key, so this would
 * quietly pick an answer out of `?wallA=3.56&wallA=4.2` — the very thing `queryFromSearchParams`
 * exists to refuse. Every caller passes `canonicalRoomQuery`'s output, which repeats no key, and
 * `flushedText` is that same text, so the constraint holds today. It is written here because the
 * argument for it lives two functions away and the next caller will not go looking for it.
 *
 * Exported so `room-query-sync.test.ts` asserts **this** function in the serialisation round trip
 * a departure depends on, rather than a copy of it that could drift.
 */
export function queryEntriesOf(queryText: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(queryText));
}
