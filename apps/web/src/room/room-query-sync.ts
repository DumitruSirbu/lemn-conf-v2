// Convergence loop between the room draft and the URL (ADR 0127): two representations of one room that must agree.
// - `liveText`: the query the client holds (`useSearchParams().toString()`): the entry's own query after a
//   traversal, what we wrote after our own write.
// - `draftText`: `canonicalRoomQuery(draft).toString()`; no raw draft text reaches it, so text that is not whole
//   millimetres (*"3,6"*) cannot come back from a reload as a value nobody entered.
// - `lastSeenText`: the `liveText` already reconciled against; tells "the URL changed" from "the draft changed".
// - `writtenNotYetSeen`: texts the settle wrote whose echo has not come back, oldest first. Without it a late echo
//   reads as another room and the keystroke is lost.
// Writes go through `router.replace`, never `window.history.replaceState` (banned in `eslint.config.mjs`): the
// native call leaves Next's history record stale, so Back restores the router's URL and the typed room is gone.
// The debounce exists because `router.replace` re-runs the page.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
 * How long typing has to stop before the URL is written, in ms (ADR 0127 decision 2). It bounds two accepted
 * losses of a character or two, never a room: a Back gesture within it of the last keystroke leaves that keystroke
 * out of the entry it leaves, and a character typed between a button tap and its flush landing is dropped, because
 * writes are suppressed while a departure is in flight. Neither touches a reload. After a late echo the first
 * window grows by that echo's round trip.
 */
export const URL_SETTLE_MS = 400;

/** Where a deliberate navigation leads. A value, not a closure over the draft: a departure is armed at the
 *  tap and dispatched a round trip later. */
export type RoomDestination = "shapes" | "presets";

export interface RoomQuerySync {
  readonly draft: RoomDraft;
  readonly setDraft: (draft: RoomDraft) => void;
  /** A deliberate navigation: it flushes a pending write and leaves once the flush has landed, so
   *  the entry left behind is correct before it becomes a back-target. */
  readonly departTo: (destination: RoomDestination) => void;
}

/**
 * The draft the customer is editing, kept in step with the live URL. `seedShape` only builds the first
 * draft; later re-seeding reads the shape from the live query inside `reconcileRoomDraft`, so passing a
 * different one after mount changes nothing.
 */
export function useRoomQuerySync(seedShape: RoomShape): RoomQuerySync {
  const searchParams = useSearchParams();
  const liveQuery = queryFromSearchParams(searchParams);
  const liveText = searchParams.toString();

  const { draft, setDraft, recordWrite, forgetWrites } = useReconciledRoomDraft(
    { seedShape, liveQuery, liveText },
  );
  const draftText = canonicalRoomQuery(draft).toString();
  const departTo = useRoomDeparture({
    liveQuery,
    liveText,
    draftText,
    recordWrite,
    forgetWrites,
  });

  return { draft, setDraft, departTo };
}

interface ReconciliationInputs {
  /** Read once, in the lazy initialiser below, and inert on every render after it. */
  readonly seedShape: RoomShape;
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
}

/** The two commands over `writtenNotYetSeen` the write side needs. Both are stable across renders,
 *  so the settle's effect can depend on them without restarting its timer. */
interface WrittenNotYetSeenCommands {
  /** A settle has dispatched this text. */
  readonly recordWrite: (queryText: string) => void;
  /** No write of ours can echo any more, so the rule is D45's own until the next write. */
  readonly forgetWrites: () => void;
}

interface ReconciledRoomDraft extends WrittenNotYetSeenCommands {
  readonly draft: RoomDraft;
  readonly setDraft: (draft: RoomDraft) => void;
}

/** Nothing written and not yet seen. Shared, so an unchanged empty list is the same value. */
const NO_WRITES_NOT_YET_SEEN: readonly string[] = [];

/**
 * The read half of the loop: a `setState` during render (React's adjust-state-on-prop-change form), not an
 * effect, which would paint the stale room first. `writtenNotYetSeen` is state, not a ref, because the
 * reconciliation reads it during render.
 */
function useReconciledRoomDraft({
  seedShape,
  liveQuery,
  liveText,
}: ReconciliationInputs): ReconciledRoomDraft {
  const [draft, setDraft] = useState<RoomDraft>(() =>
    roomDraftFromQuery(seedShape, liveQuery),
  );
  const [lastSeenText, setLastSeenText] = useState(liveText);
  const [writtenNotYetSeen, setWrittenNotYetSeen] = useState(
    NO_WRITES_NOT_YET_SEEN,
  );
  const commands = useWrittenNotYetSeenCommands(setWrittenNotYetSeen);
  useForgetWritesOnTraversal(commands.forgetWrites);

  const reconciled = reconcileRoomDraft({
    draft,
    lastSeenText,
    liveQuery,
    liveText,
    writtenNotYetSeen,
  });
  if (reconciled.lastSeenText !== lastSeenText) {
    setLastSeenText(reconciled.lastSeenText);
    setDraft(reconciled.draft);
    setWrittenNotYetSeen(reconciled.writtenNotYetSeen);
  }

  return { draft: reconciled.draft, setDraft, ...commands };
}

function useWrittenNotYetSeenCommands(
  setWrittenNotYetSeen: Dispatch<SetStateAction<readonly string[]>>,
): WrittenNotYetSeenCommands {
  const recordWrite = useCallback(
    (queryText: string) => {
      setWrittenNotYetSeen((written) => [...written, queryText]);
    },
    [setWrittenNotYetSeen],
  );
  const forgetWrites = useCallback(() => {
    setWrittenNotYetSeen(NO_WRITES_NOT_YET_SEEN);
  }, [setWrittenNotYetSeen]);
  return { recordWrite, forgetWrites };
}

/**
 * A `popstate` forgets every write: Next discards a pending navigation when a traversal dispatches
 * (`next/dist/client/components/app-router-instance.js:146-160`), so no write of ours can still commit. This runs
 * in the same event, no later than the arrival it announces; the screen's own `popstate` listener (which clears
 * a composition run) stays in `room-screen.tsx`.
 */
function useForgetWritesOnTraversal(forgetWrites: () => void): void {
  useEffect(() => {
    window.addEventListener("popstate", forgetWrites);
    return () => {
      window.removeEventListener("popstate", forgetWrites);
    };
  }, [forgetWrites]);
}

interface DepartureInputs extends WrittenNotYetSeenCommands {
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
  /** `canonicalRoomQuery(draft).toString()` — the draft as the URL would carry it, never raw text. */
  readonly draftText: string;
}

/** A navigation waiting on its own flush: where the customer asked to go and the text written on the way
 *  out. The push fires when the live query comes back as that text and on no other change. */
interface ArmedDeparture {
  readonly destination: RoomDestination;
  readonly flushedText: string;
}

/**
 * The write half of the loop, and the departure that has to flush it, together because a deliberate navigation must
 * clear the settle timer. A flush that never lands leaves the departure armed, the URL stale and the draft whole;
 * the next tap re-issues it, and Next turns a failed navigation into a hard one
 * (`next/dist/client/components/app-router.js:214-231`). Do not add a retry timer: it would be a third write path
 * chasing an unmeasured failure.
 */
function useRoomDeparture({
  liveQuery,
  liveText,
  draftText,
  recordWrite,
  forgetWrites,
}: DepartureInputs): (destination: RoomDestination) => void {
  const navigation = useRoomNavigation();
  const latestNavigation = useRef(navigation);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const armedDeparture = useRef<ArmedDeparture | undefined>(undefined);
  // The shape step writes nothing: no shape in the live query means the customer is at 1A, and a screen
  // that rewrote the address bar would undo *Înapoi*'s bare-pathname push. Keep this guard even though the
  // screen's branch also derives from the live query: an invariant resting on a tree shape returns when the
  // tree changes.
  const liveQueryNamesARoom = roomShapeInQuery(liveQuery) !== undefined;

  useEffect(() => {
    // next-intl's router is memoised on Next's, whose identity is not guaranteed: keying the settle timer on
    // it would restart the debounce every render, so the timer reads the newest navigation through a ref.
    latestNavigation.current = navigation;
  });

  // Declared before the write effect, and the order is load-bearing: effects run in declaration order, so on
  // a URL change the departure resolves first and the write effect sees a disarmed ref. Reversed, a
  // traversal arriving during an armed departure would suppress its own canonicalising write.
  useEffect(() => {
    const departure = armedDeparture.current;
    if (departure === undefined) return;
    armedDeparture.current = undefined;
    // The flush has committed only when the live query comes back as the text we wrote; any other change is
    // a traversal overtaking the departure, and a customer who went Back does not want the push.
    if (departure.flushedText === liveText) {
      latestNavigation.current.pushTo(departure.destination, liveText);
    }
  }, [liveText]);

  useEffect(() => {
    // A departure in flight suppresses new writes: a keystroke after the tap would start a write that
    // overtakes the flush, and the departure would not recognise its own echo and would disarm without
    // pushing. The typed character is lost instead (see `URL_SETTLE_MS`). Not re-run when the ref changes: a
    // departure is armed from an event handler and the next render is the one this guard must catch.
    if (armedDeparture.current !== undefined) return;
    if (!liveQueryNamesARoom || liveText === draftText) return;
    const timer = setTimeout(() => {
      settleTimer.current = undefined;
      // Recorded as it is dispatched, so its echo is ours however late it comes back (ADR 0127 decision 4).
      recordWrite(draftText);
      latestNavigation.current.replaceWith(draftText);
    }, URL_SETTLE_MS);
    settleTimer.current = timer;
    // A navigation beats a pending write: any change to `liveText` runs this cleanup first, so no
    // `router.replace` carries a query the customer has already navigated away from.
    return () => {
      clearTimeout(timer);
      settleTimer.current = undefined;
    };
  }, [liveQueryNamesARoom, liveText, draftText, recordWrite]);

  return function departTo(destination: RoomDestination): void {
    // Every departure forgets every write and never records the flush (ADR 0127 decision 8): a write still
    // in flight could land after the tap, pass as our echo and keep the draft, and the write effect would
    // then `replace` and discard the pending push. This holds on the direct path too.
    forgetWrites();
    if (!liveQueryNamesARoom || liveText === draftText) {
      navigation.pushTo(destination, draftText);
      return;
    }
    // Flush now rather than on the settle, and leave only once it comes back: pushing in this tick would
    // lose the flush, because Next discards a pending action when a navigation dispatches
    // (`next/dist/client/components/app-router-instance.js:146-160`).
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
 * The reconciliation, as a pure function. An unchanged `liveText` is the typing path and never re-seeds the draft.
 * A changed one moves `lastSeenText` and either keeps the draft (it is what the draft would write, our own echo; or
 * a write still in `writtenNotYetSeen`, a late echo, so the write effect writes it once more) or re-seeds every
 * field from the query because the customer is in a different room, awaiting no write. Echo branches forget the
 * oldest copy of the arrived write and everything before it (`writtenAfter`).
 *
 * Accepted residue: a Back landing on a URL equal to the current `draftText` reads as an echo, so text that is not
 * whole millimetres (*"3,6"*) stays in its field. Do not add a second discriminator: any candidate re-seeds on an
 * echo somewhere.
 */
export function reconcileRoomDraft({
  draft,
  lastSeenText,
  liveQuery,
  liveText,
  writtenNotYetSeen,
}: RoomReconciliationInputs): RoomReconciliation {
  if (liveText === lastSeenText) {
    return { draft, lastSeenText, writtenNotYetSeen };
  }
  const echoed = {
    draft,
    lastSeenText: liveText,
    writtenNotYetSeen: writtenAfter(writtenNotYetSeen, liveText),
  };
  if (liveText === canonicalRoomQuery(draft).toString()) return echoed;
  if (writtenNotYetSeen.includes(liveText)) return echoed;
  // A query naming no shape names no room, so the draft keeps its shape and loses only what the query no
  // longer answers for.
  const shape = roomShapeInQuery(liveQuery) ?? draft.shape;
  return {
    draft: roomDraftFromQuery(shape, liveQuery),
    lastSeenText: liveText,
    writtenNotYetSeen: NO_WRITES_NOT_YET_SEEN,
  };
}

/**
 * The writes dispatched after the oldest copy of `arrived`, or none if it was never written (ADR 0127 decision 7).
 * A text alone cannot say which copy arrived once it repeats (typing 3, 36, 3 gives `[A, B, A]`), so keeping
 * everything after the oldest copy never forgets a write that can still echo: a lost digit is the defect, a stale
 * entry is only stale. Do not tighten this to the newest copy: the commit-race tests in
 * `qa-7f2-s3b-late-echo.adversarial.test.ts` witness that it loses a digit.
 */
function writtenAfter(
  writtenNotYetSeen: readonly string[],
  arrived: string,
): readonly string[] {
  const oldestCopy = writtenNotYetSeen.indexOf(arrived);
  return oldestCopy === -1
    ? NO_WRITES_NOT_YET_SEEN
    : writtenNotYetSeen.slice(oldestCopy + 1);
}

export interface RoomReconciliationInputs {
  readonly draft: RoomDraft;
  readonly lastSeenText: string;
  readonly liveQuery: RoomSearchParams;
  readonly liveText: string;
  /** The settle's writes whose echo has not come back yet, oldest first. */
  readonly writtenNotYetSeen: readonly string[];
}

export interface RoomReconciliation {
  readonly draft: RoomDraft;
  readonly lastSeenText: string;
  readonly writtenNotYetSeen: readonly string[];
}

/** Just the two readers this needs, so the hook's `ReadonlyURLSearchParams` and a test's plain
 *  `URLSearchParams` both satisfy it. */
type RepeatedKeyReader = Pick<URLSearchParams, "keys" | "getAll">;

/**
 * The live query, read by the parser's rule that a repeated key is not a value. `useSearchParams().get()`
 * returns the first of `?wallA=3.56&wallA=4.2`; through `getAll` a repeated key stays an array and
 * `singleValue` refuses it.
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
 * The URL is the room's only store: the shape, every field that already reads as a length and the corner
 * direction for the shapes that turn one, in `serialiseRoomInput`'s key order with `metresTextForUrl`'s wire
 * form. A field that does not yet parse is absent, so no raw draft text reaches the query.
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
    // The toggle is visible with a position, so the URL says what the customer sees; the parser's reading of
    // an absent `direction` is unchanged.
    params.set("direction", draft.cornerDirection);
  }
  return params;
}

/** The draft a URL arrives as: every field the query already answers, refilled as whole millimetres
 *  (ADR 0126), and the corner the query names or frame 1B's pre-selected left. */
export function roomDraftFromQuery(
  shape: RoomShape,
  query: RoomSearchParams,
): RoomDraft {
  const withLengths = requiredFieldsFor(shape).reduce(
    (draft, field) => withLengthFromQuery(draft, field, query[field]),
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

/** The same question of a parse already in hand, so the marker and the step the screen draws come from one
 *  `parseRoomUrlState` and cannot describe two readings of one URL. */
export function roomShapeInState(state: RoomUrlState): RoomShape | undefined {
  if (state.substate === "1A") return undefined;
  if (state.substate === "1B") return state.shape;
  return state.input.shape;
}

function withLengthFromQuery(
  draft: RoomDraft,
  field: RoomLengthField,
  value: RoomSearchParams[string],
): RoomDraft {
  const parsed = parseMetresToMillimetres(singleValue(value) ?? "");
  return parsed.ok
    ? withStoredLength(draft, { field, millimetres: parsed.mm })
    : draft;
}

/**
 * The entries next-intl's href builder takes, out of a query text. Canonical text only: `Object.fromEntries`
 * keeps the last of a repeated key, which would quietly pick an answer `queryFromSearchParams` exists to
 * refuse. Every caller passes `canonicalRoomQuery`'s output, which repeats no key.
 */
export function queryEntriesOf(queryText: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(queryText));
}
