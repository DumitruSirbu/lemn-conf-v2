"use client";

// **Sub-state 1F's body** — frame 1F (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`),
// M7 waves 7F4a and 7F4b.
//
// **The footer's primary control has a destination from 7F4b on**, and the frame draws only the
// waiting state it had in 7F4a. The two states beyond it — the write that did not land, and the
// composition that did not finish — are drafted rather than drawn, and `ComposeCta` is where all
// three are decided.
//
// **It renders what the model publishes and decides nothing.** The six rows (the sixth, the
// dishwasher, by wave 7D5b and ADR 0110 Amendment M3), their extents and their statuses are
// `generation-model.ts`'s; this file turns each row and each status into the leaf that names it and
// draws the frame around them. No row's label is spelled at a call site, because a role added to
// `GENERATION_PRIORITIES` must fail to compile rather than render a key at a customer.
//
// **Nothing here is sequenced** (ruling R12). `generateKitchen` is one synchronous call returning a
// finished log, so the list is either wholly pending or wholly resolved; no row has a timer, no row
// changes state without the log changing, and there is no progress to report because there is no
// progress to observe.
//
// **A *nu poate fi inclus* row is drawn as the frame draws it** (ruling R10): a dashed border, a
// muted background, the `−` glyph and the trailing label. There is no `text-decoration:
// line-through` anywhere — the earlier criterion's word *"struck"* is about the item being struck
// from the composition, and the frame strikes no text.
//
// **The five leaves this file renders under `room.compose.{stepsLabel,status.placed,
// status.notPlaced,rule,dropped}` carry the owner's 2026-09-15 rulings in Romanian, and their Russian
// was re-drafted to follow them** — ADR 0113 decision 4, which makes a reworded Romanian leaf an
// ordinary change whose consequences *are* the lock updated, the golden hashes rebaselined for those
// keys, and the Russian re-drafted. That is the ruling's own consequence and not a pending approval:
// ADR 0113 decision 3 approves the Russian of these leaves by the same ruling as the Romanian, and
// **Gate O2 — the owner's read of `ru.json` — closed on 2026-09-11** (`docs/STATUS.md`). There is no
// open approval step here for anyone to look for.
//
// The Russian moved with the Romanian rather than being left stale because the catalogues must stay
// key-identical, and a Russian sentence still reading *не помещается* beside a Romanian one that no
// longer does would be worse than either. `stepsLabel` is the fifth and latest: the owner made the
// heading passive (*Ce este inclus*), so the Russian follows it into *Что включено* and matches the
// `включено` its own rows already show.
import {
  cornerDirectionOf,
  wallsOf,
  type DesignRoom,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import { useLocale, useTranslations } from "next-intl";

import {
  droppedRolesIn,
  GENERATION_ROLE_MESSAGE_KEY,
  GENERATION_ROW_MESSAGE_KEY,
  GENERATION_STATUS_MESSAGE_KEY,
  type GenerationRow,
  type GenerationRowStatus,
} from "./generation-model";
import { PlanPreview } from "./plan-preview";
import {
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
} from "./room-draft";
import { parsedRoomLengthsOf } from "./room-url-state";
import styles from "./room.module.css";
import type { ActiveGenerationRun } from "./use-generation";

export interface GenerationStepsProps {
  /** The run being drawn. `idle` is excluded by the type, so this component has no "not composing"
   *  branch to get wrong: the screen renders the form in that case and never reaches here. */
  readonly run: ActiveGenerationRun;
  /** Leaves composition. A pure state clear that restores the fields with the draft exactly as it
   *  was — no `departTo`, no re-seed from the URL (criterion 26, ruling R14). */
  readonly onBack: () => void;
  /** Asks the failed hand-off to write again. Offered only in that state, and it re-runs the
   *  composition's own attempt rather than composing anything (criterion 41). */
  readonly onRetry: () => void;
}

/** The shape's short name, as the summary line reads it. A `Record` over `DesignRoom["shape"]`, so a
 *  shape the domain learns to store is a compile error here rather than a missing word. Only the L
 *  reaches this screen today; wave 7J's straight kitchen made the second arm live, and this U arm is
 *  data-only — the U card itself stays unreachable until U6 widens `APPROVED_ROOM_POLICY`
 *  (M7B plan, *Why nothing is reachable before U6*). */
const SHAPE_SHORT_MESSAGE_KEY = {
  L: "room.shapes.L.short",
  linear: "room.shapes.linear.short",
  U: "room.shapes.U.short",
} as const satisfies Readonly<Record<DesignRoom["shape"], string>>;

/**
 * The row's own class per status. A `Record` for `SHAPE_SHORT_MESSAGE_KEY`'s reason: a fourth row
 * state would have to be drawn before it could ship.
 *
 * **The classes themselves are not typed.** `styles.*` is `string | undefined`, so a stylesheet that
 * stopped declaring `.composeRowDropped` makes `not_placed` `undefined` — permitted by the
 * `satisfies` below, filtered out by `classNames`, and the dropped row silently loses its dashed
 * border, its muted background and its `−` glyph with every test still green. The guard against that
 * is `tests/room/generation-steps.dom.test.ts`, which takes the class each status **actually renders
 * with** off the DOM and requires `room.module.css` to declare it.
 */
const ROW_STATUS_CLASS = {
  pending: styles.composeRowPending,
  placed: styles.composeRowPlaced,
  not_placed: styles.composeRowDropped,
} as const satisfies Readonly<Record<GenerationRowStatus, string | undefined>>;

/** The classes a CSS module actually declares, joined. `styles.*` is `string | undefined` — a class
 *  the stylesheet stopped declaring is absent rather than a compile error — so an absent one is
 *  dropped instead of being written into the attribute as the word *undefined*. */
function classNames(...declared: readonly (string | undefined)[]): string {
  return declared.filter((name) => name !== undefined).join(" ");
}

export function GenerationSteps({
  run,
  onBack,
  onRetry,
}: GenerationStepsProps) {
  const translate = useTranslations();

  return (
    <>
      <div className={styles.composeBody} data-testid="room-compose">
        <div className={styles.composeIntro}>
          <h2 className={styles.composeHeading}>
            {translate("room.compose.heading")}
          </h2>
          <RoomSummary room={run.room} />
        </div>
        <ComposeNotice run={run} />
        {/* **A failed run has no rows to draw, and this is a narrowing rather than a decision**:
            `GenerationRunState`'s `failed` member carries no `rows` at all, so the alternative to
            this branch is a compile error and not a screen claiming *inclus* over a design that was
            discarded (coordinator's ruling, 2026-09-15). */}
        {run.phase === "failed" ? null : <StepList rows={run.rows} />}
        {run.phase === "composed" ? <DroppedRoles log={run.log} /> : null}
        <p className={styles.composeRule}>{translate("room.compose.rule")}</p>
        <CompositionPlanAside room={run.room} />
      </div>
      <div className={styles.composeFooter}>
        <button
          type="button"
          className={styles.back}
          data-testid="room-compose-back"
          onClick={onBack}
        >
          {translate("room.back")}
        </button>
        <ComposeCta run={run} onRetry={onRetry} />
      </div>
    </>
  );
}

/**
 * **D1F's desktop-only aside: the room's own plan, static and beside the steps** (7L D10).
 *
 * The milestone's earlier idea — a preview that fills as bodies are placed — is struck by ruling
 * R12's own derivation: `generateKitchen` is one synchronous call, so there is no progress to draw a
 * picture of, and animating one would be animating a fiction (Q-7L-2, coordinator-confirmed). What
 * ships instead is **the same static plan 1B already drew** for this room, from `PlanPreview` — the
 * S2 component, unmarked, never a second layout function over the same draft.
 *
 * **`.composeAside` is what the base shell hides** (criterion 14): a phone customer's screen reader
 * never reaches this subtree and it holds no tab stop, because the wrapper carries `display: none`
 * outside the desktop block (`room.module.css`) rather than this component choosing not to render.
 */
function CompositionPlanAside({ room }: { readonly room: DesignRoom }) {
  return (
    <div className={styles.composeAside} data-testid="room-compose-plan">
      <PlanPreview draft={roomDraftFor(room)} />
    </div>
  );
}

/** The stored draft a composed room's own numbers make — `PlanPreview` takes a `RoomDraft`, and this
 *  is the composition's only route to one, built once here rather than threaded down from wherever a
 *  design was minted. `parsedRoomLengthsOf` (`room-url-state.ts`) is the one place a `DesignRoom`'s
 *  own numbers become wall/height fields, shared with `roomHrefFromDesignRoom`'s URL (7L review
 *  finding F5), so this draft and that URL cannot map a stored room's numbers two different ways. */
function roomDraftFor(room: DesignRoom): RoomDraft {
  const draftWithDirection = withCornerDirection(
    createRoomDraft(room.shape),
    cornerDirectionOf(room),
  );
  return parsedRoomLengthsOf(room).reduce(withStoredLength, draftWithDirection);
}

/**
 * **The footer's primary control, in the three positions the wave gives it.**
 *
 * *Working* — a `<div>` announcing the run, which is ADR 0104 decision 6's shape for a control that
 * performs nothing: the customer asked once, and the composition and the write that follows it are
 * one wait with one label. 52 px is the frame's height and is already past the 44 px target. A
 * hand-off that has **finished** (`handoff: "saved"`) is drawn here too, because on the path that
 * reaches it the editor is already opening; `HandoffStatus` says why the two are nonetheless
 * different states, and what is undecided about the one case where they look the same and are not.
 *
 * *The write failed* — a real `<button>`, because there is now an action to offer, and it re-runs
 * the composition's own attempt (criterion 41).
 *
 * *The composition failed* — **nothing**. Wave 7F4a drew the busy control in every state, which was
 * honest while nothing could ever resolve; with a destination in place a spinner reading
 * *Se compune…* under *Compunerea nu s-a putut finaliza* would promise an arrival that is not
 * coming. The way out of that state is *Înapoi*, and criterion 35 asks for no other.
 */
function ComposeCta({
  run,
  onRetry,
}: {
  readonly run: ActiveGenerationRun;
  readonly onRetry: () => void;
}) {
  const translate = useTranslations();

  if (run.phase === "failed") return null;
  if (run.phase === "composed" && run.handoff === "failed") {
    return (
      <button
        type="button"
        className={styles.cta}
        data-testid="room-compose-retry"
        onClick={onRetry}
      >
        {translate("room.compose.retry")}
      </button>
    );
  }

  return (
    <div className={styles.composeCta} data-testid="room-compose-cta">
      <span className={styles.composeCtaSpinner} aria-hidden="true" />
      {translate("room.compose.busy")}
    </div>
  );
}

/** Frame 1F's one-line room, in the whole millimetres the customer typed (ADR 0126). The numbers are
 *  ICU arguments, exactly as `room.planWallLabel`'s are, so their form is the catalogue's and a digit
 *  is never concatenated into a sentence.
 *
 *  **Which leaf, decided by how many walls the domain gives the shape** (`wallsOf`, M7B plan D7; ADR
 *  0130 D10): one wall reads `roomSummaryLinear`, two `roomSummary`, three `roomSummaryU`. A straight
 *  room's own entered fields are wall A and height, never a second wall — `room.depthMm` is the drawn
 *  floor's depth in front of the run (ADR 0130 D3), not a length the customer typed, so the summary
 *  must not print it as though it were one. The count is read rather than the shape compared, so a
 *  wave that widens a shape's walls moves this summary with it. */
function RoomSummary({ room }: { readonly room: DesignRoom }) {
  const translate = useTranslations();
  const wallCount = wallsOf(room.shape).length;
  const shape = translate(SHAPE_SHORT_MESSAGE_KEY[room.shape]);

  return (
    <span className={styles.composeSummary} data-testid="room-compose-summary">
      {wallCount === 1
        ? translate("room.compose.roomSummaryLinear", {
            shape,
            wallA: room.widthMm,
            height: room.heightMm,
          })
        : wallCount === 2
          ? translate("room.compose.roomSummary", {
              shape,
              wallA: room.widthMm,
              wallB: room.depthMm,
              height: room.heightMm,
            })
          : translate("room.compose.roomSummaryU", {
              shape,
              wallA: room.widthMm,
              wallB: room.depthMm,
              wallC: wallCOf(room),
              height: room.heightMm,
            })}
    </span>
  );
}

/** Wall C's length through the one `DesignRoom` mapping (`parsedRoomLengthsOf`), which refuses a U
 *  that carries none rather than printing another wall's number in its place. */
function wallCOf(room: DesignRoom): number {
  const wallC = parsedRoomLengthsOf(room).find(
    (length) => length.field === "wallC",
  );
  if (wallC === undefined) {
    throw new Error("1F's summary asked for wall C of a room that has none");
  }
  return wallC.millimetres;
}

/**
 * The band above the list: why the customer is waiting, or — with no frame to draw either — that the
 * composition did not finish, or that the kitchen was composed and could not be opened.
 *
 * It says **nothing about the room** in any of the three: a room too small is refused before
 * generation runs and its sentence is wave 7F2's, at 1C (ruling R16).
 *
 * **The two failures are separate sentences because they leave the customer in different places.**
 * A composition that did not finish has no kitchen behind it and the way on is back to the
 * dimensions; a write that did not land has the whole kitchen behind it, drawn and true, and the way
 * on is to ask again.
 *
 * **It is the screen's live region, and the only one 1F has** (QA finding F4, wave 7F4b). Both
 * failures **replace what the customer was last told is happening**: the band said *Se compune…*,
 * nothing was tapped, and now it says the opposite. That — a sentence withdrawing the one before it —
 * is what is announced here, and it is why the rule does not reach `DroppedRoles`, a sibling of this
 * region that appears once, beside the rows, and contradicts nothing. Without a live region, a
 * screen-reader user waits on *Se compune…* for a retry button that silently appeared and a sentence
 * that silently changed.
 *
 * **`polite`, not `role="alert"`**, for `editor-panel.tsx`'s reason at `PanelNoticeRow`: nothing is
 * waiting on the customer and nothing is lost by finishing the sentence in progress. The retry button
 * keeps standing there.
 *
 * **Liveness is unconditional, and the happy path is silent because the sentence does not change.**
 * `composing` and a composed kitchen still being written resolve to the **same leaf**, so the text a
 * screen reader would be given at *composing → composed* is the text it already has. React does
 * mutate this subtree there — the spinner `<span>` is removed and the `data-compose-*` attributes
 * move — and the silence is `aria-relevant`'s: it defaults to *additions text*, so a removal is not
 * announced. `generation-steps.dom.test.ts`'s `isAnnounceable` is the statement of that rule, and its
 * silent-happy-path test now counts the raw mutations too, so it cannot pass over an observer that
 * saw nothing. **Commit `e2f24dc` carries the wrong version of this paragraph** — it claims React
 * mutates nothing here — and that message cannot be rewritten; this is the correction.
 *
 * The alternative — switching `aria-live` on in the same commit that changes the text — is the
 * well-known way to get no announcement at all, because a region has to be live *before* the
 * mutation it should announce. `noticeMessageKeyFor`'s one-leaf-for-two-states property is therefore
 * load-bearing and is pinned by `generation-steps.dom.test.ts`.
 *
 * **Focus is deliberately not moved.** The rows above are composed, true and worth reading; taking
 * the caret to *Încearcă din nou* would interrupt someone mid-list to hand them a control that is two
 * tabs away and going nowhere. 7F4a's broader gap — 1F opening with focus on `<body>` — stays
 * recorded rather than fixed here.
 */
function ComposeNotice({ run }: { readonly run: ActiveGenerationRun }) {
  const translate = useTranslations();
  const hasFailed = run.phase === "failed" || hasFailedHandoff(run);

  return (
    <div
      className={classNames(
        styles.composeNotice,
        hasFailed ? styles.composeNoticeFailed : undefined,
      )}
      aria-live="polite"
      data-testid="room-compose-notice"
      data-compose-phase={run.phase}
      data-compose-handoff={run.phase === "composed" ? run.handoff : undefined}
    >
      {run.phase === "composing" ? (
        <span className={styles.composeSpinner} aria-hidden="true" />
      ) : null}
      <span className={styles.composeNoticeText}>
        {translate(noticeMessageKeyFor(run))}
      </span>
    </div>
  );
}

function hasFailedHandoff(run: ActiveGenerationRun): boolean {
  return run.phase === "composed" && run.handoff === "failed";
}

/** The three sentences the band can carry, as a literal union: next-intl resolves a key's arguments
 *  from its type, and a `string` return would make every one of them look like an ICU message.
 *
 *  **Every state but a failure shares one leaf on purpose.** `composing`, and a composed kitchen
 *  whose write is in flight or has landed, all read `noPresetNotice`, which is what keeps
 *  `ComposeNotice`'s live region silent while the happy path runs: the text never changes, so
 *  nothing is announced until a failure changes it. Giving the saving state a sentence of its own
 *  would narrate *pending → composed* at a screen-reader user for no reason. */
function noticeMessageKeyFor(
  run: ActiveGenerationRun,
):
  | "room.compose.failed"
  | "room.compose.saveFailed"
  | "room.compose.noPresetNotice" {
  if (run.phase === "failed") return "room.compose.failed";
  if (hasFailedHandoff(run)) return "room.compose.saveFailed";
  return "room.compose.noPresetNotice";
}

function StepList({ rows }: { readonly rows: readonly GenerationRow[] }) {
  const translate = useTranslations();

  return (
    <div className={styles.composeSteps}>
      <span className={styles.composeStepsLabel}>
        {translate("room.compose.stepsLabel")}
      </span>
      <ul className={styles.composeRows} data-testid="room-compose-rows">
        {rows.map((row) => (
          <StepRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function StepRow({ row }: { readonly row: GenerationRow }) {
  const translate = useTranslations();

  return (
    <li
      className={classNames(styles.composeRow, ROW_STATUS_CLASS[row.status])}
      data-testid={`room-compose-row-${row.id}`}
      data-compose-status={row.status}
    >
      {/* The mark is drawn by the stylesheet and named by the status beside it, so it carries no
          information of its own — see `.composeRowGlyph`. */}
      <span className={styles.composeRowGlyph} aria-hidden="true" />
      <span
        className={styles.composeRowName}
        data-testid={`room-compose-name-${row.id}`}
      >
        {translate("room.compose.rowLabel", {
          role: translate(GENERATION_ROW_MESSAGE_KEY[row.id]),
          extent:
            row.extent.kind === "restOfWall"
              ? translate("room.compose.storageExtent")
              : translate("room.compose.rowWidth", {
                  millimetres: row.extent.millimetres,
                }),
        })}
      </span>
      <span
        className={styles.composeRowStatus}
        data-testid={`room-compose-status-${row.id}`}
      >
        {translate(GENERATION_STATUS_MESSAGE_KEY[row.status])}
      </span>
    </li>
  );
}

/**
 * **The roles the room left no wall for, named once and explained no further.**
 *
 * The instruction is binding and is quoted here because it is the whole specification: *"one message
 * naming the dropped roles, in the state the screen already has, reading `plan.dropped` as it stands.
 * No new sub-state, no per-role explanation, no recovery flow."*
 *
 * **Where the ruling lives today: `docs/milestones/M7-room-and-presets.md`, wave 7D4.** It is owed a
 * home in ADR 0110 as **Amendment F — wave 7D4's slice S0, not yet written.** Cite the milestone
 * until it exists; a missing amendment here is a missing *record*, never a missing rule.
 *
 * **The Romanian sentence is approved** — the owner answered question Q7F4-1 on 2026-09-15 and
 * `room.compose.dropped` now names the wall sizes as the reason, which is the substance the ruling
 * asked for. One general reason and no per-role one, so the quoted instruction still holds.
 */
function DroppedRoles({ log }: { readonly log: GenerationLog }) {
  const translate = useTranslations();
  const locale = useLocale();
  const dropped = droppedRolesIn(log);
  if (dropped.length === 0) return null;

  return (
    <p className={styles.composeDropped} data-testid="room-compose-dropped">
      {translate("room.compose.dropped", {
        // Joined by the locale's own list rule rather than by a comma written here: a list separator is
        // the locale's to decide (ADR 0095 decision 3), and this product runs in two.
        roles: new Intl.ListFormat(locale).format(
          dropped.map((role) => translate(GENERATION_ROLE_MESSAGE_KEY[role])),
        ),
      })}
    </p>
  );
}
