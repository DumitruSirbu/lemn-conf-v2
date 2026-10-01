// **The convergence loop between the room draft and the URL** — M7 wave 7F1-D45, ruling R9.
//
// The draft and the query are two representations of one room, and this module's whole job is to
// make them agree. Four values carry every rule below:
//
// - **`liveText`** — the query the client actually holds, `useSearchParams().toString()`. After a
//   traversal this is the entry's own query; after our own write it is what we wrote.
// - **`draftText`** — `canonicalRoomQuery(draft).toString()`: the shape, every field that already
//   reads as a length, and the direction for the shapes that carry one. No raw draft text ever
//   reaches it, so text that is not whole millimetres (*"3,6"*) cannot come back from a reload as a
//   value nobody entered.
// - **`lastSeenText`** — the `liveText` already reconciled against. It is what tells *the URL
//   changed* apart from *the draft changed*, which comparing the first two alone cannot do.
// - **`writtenNotYetSeen`** — the texts the settle has written whose echo has not come back yet,
//   oldest first (M7 wave 7F2, slice S3b). A write's round trip is the window a keystroke can land
//   in, so its echo can arrive after the draft has moved on; without this list that echo reads as
//   another room and the keystroke is lost.
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
 *
 * **After a late echo (slice S3b), limit 1 grows by that echo's round trip, in that path only.** The
 * late echo keeps the draft and the settle then writes it once more, counted from the echo's
 * arrival, so the URL lags the field by one more settle and a Back gesture in that window can lose
 * the tail typed since the echo. Still a few characters, never a room, and still never on a reload.
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
 * The read half of the loop, as a `setState` **during render** in React's documented
 * adjust-state-when-props-change form. Deliberately not an effect: an effect would paint the stale
 * room first and correct it on the next frame, which is defect D5 with a delay rather than without
 * one.
 *
 * `writtenNotYetSeen` is state rather than a ref because the reconciliation reads it during render.
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
 * **A `popstate` forgets every write** (S3b rule 5). Next discards a pending navigation when a
 * traversal dispatches (`next/dist/client/components/app-router-instance.js:146-160`), so after one
 * no write of ours can still commit, and an arrival equal to one is the entry the customer went to.
 * Next dispatches that traversal from its own `popstate` listener in the same event, so this update
 * is processed no later than the arrival it announces.
 *
 * It only ever returns the rule to D45's; it re-seeds nothing D45 keeps, because the `draftText`
 * branch does not read the list. The screen's own `popstate` listener, which clears a composition
 * run, is a different rule and stays in `room-screen.tsx`.
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
  recordWrite,
  forgetWrites,
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
      // Recorded as it is dispatched, so its echo is ours however late it comes back (S3b rule 3).
      recordWrite(draftText);
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
  }, [liveQueryNamesARoom, liveText, draftText, recordWrite]);

  return function departTo(destination: RoomDestination): void {
    // **Every departure forgets every write, and the flush is never recorded** (S3b rule 4; review
    // R1.1/R1.2 for the direct path). A write still in flight can land after the tap. Were it
    // remembered, its echo would pass as ours and keep the draft, and the write effect would see
    // `liveText !== draftText` while the push is pending: D45's trigger condition, a `replace` that
    // discards the push, and a dead *Înapoi* or a lost 1F entry. That holds on the direct path too,
    // where the draft is already back at the live text when the tap lands. Forgotten, any arrival
    // after the tap is classified exactly as D45 classifies it.
    forgetWrites();
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
 *    - `liveText` is a write of ours still in `writtenNotYetSeen` — **a late echo**, of a write the
 *      draft has since moved past (slice S3b) — and the draft is kept, the same object, so the
 *      write effect writes it once more; or
 *    - the customer is in a different room, and every field, the shape and the direction are
 *      re-seeded from the query they actually hold, and no write of ours is awaited any more.
 *
 * Both echo branches forget the oldest copy of the arrived write and every entry before it
 * (`writtenAfter`, which says why the oldest).
 *
 * **One residue, accepted and bounded** (Wave 7F1-D45): a Back landing on a URL that happens to
 * equal the current `draftText` is read as an echo, so text that is not whole millimetres (*"3,6"*)
 * stays in its field. The room shown and the URL still agree. A second discriminator to chase it
 * re-seeds on an echo somewhere, which is the defect that matters.
 *
 * **Why the late-echo branch is not that second discriminator.** The prohibition is about telling a
 * Back that lands on `draftText` apart from an echo, and every candidate for it re-seeds on an echo
 * somewhere. This branch leaves the `draftText` branch alone — it consults neither the list nor a
 * `popstate` — and only turns re-seeds into keeps, for texts this screen itself wrote. D45's trigger
 * condition (the write effect seeing `liveText !== draftText` in the commit where a departure
 * pushes) cannot fire through it: every departure, direct or flushed, empties the list at the tap,
 * before anything can arrive.
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
  // A query naming no shape names no room either, so the draft keeps the shape it has and loses
  // only what the query no longer answers for.
  const shape = roomShapeInQuery(liveQuery) ?? draft.shape;
  return {
    draft: roomDraftFromQuery(shape, liveQuery),
    lastSeenText: liveText,
    writtenNotYetSeen: NO_WRITES_NOT_YET_SEEN,
  };
}

/**
 * The writes dispatched after the **oldest** copy of `arrived`, or none if it was never written.
 *
 * **Why the oldest copy, and why stale entries are accepted** (S3b.10, QA finding F1). Next commits
 * navigations in dispatch order, and a newer dispatch discards a pending older one
 * (`next/dist/client/components/app-router-instance.js:146-160`). So an arrival retires every write
 * sent before it — **but a text alone cannot say which copy arrived once a text repeats.** Type 3,
 * 36, then back to 3: the list is `[A, B, A]`, and when `A` lands the same inputs describe two
 * histories. Under a commit race the *first* `A` arrived and `B` is still coming; dropping `B` would
 * make it re-seed when it lands, and the digit typed since is lost. Under the discard order the
 * *second* `A` arrived and nothing more is coming. One input cannot have two outputs, so this keeps
 * everything after the oldest copy: **a lost digit is the defect, a stale entry is only a stale
 * entry.** No write that can still echo is ever forgotten, and every matching arrival still shortens
 * the list.
 *
 * **The invariant that bounds the stale entries, stated exactly.** The list is emptied by every
 * `popstate`, by every departure (`departTo`, on both its paths), and by every arrival that changes
 * `liveText` and equals no entry, whichever branch classifies it. So a traversal empties it whether
 * or not it is announced, unless it lands, unannounced, on a stale entry's text: a URL change that
 * is neither ours nor a `popstate`. That is the one case a stale entry misleads, and it is recorded
 * as residue F3 in the milestone (S3b.10), not built for.
 *
 * **Do not "tighten" this back to the newest copy** (risk R-S3b-6): QA's commit-race tests in
 * `qa-7f2-s3b-late-echo.adversarial.test.ts` are the witnesses that it loses a digit.
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
 * `parseRoomUrlState` already produces, so no raw draft text ever reaches the query and text that is
 * not whole millimetres (*"3,6"*) cannot come back from a reload as a value the customer never entered.
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

/** The draft a URL arrives as: every field the shape asks for that the query already answers,
 *  refilled as the whole millimetres the field takes (ADR 0126), and the corner the query names or
 *  frame 1B's pre-selected left. */
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
): RoomDraft {
  const parsed = parseMetresToMillimetres(singleValue(value) ?? "");
  return parsed.ok
    ? withStoredLength(draft, { field, millimetres: parsed.mm })
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
