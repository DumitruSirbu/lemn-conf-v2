"use client";

// Sub-state 1F's body (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`). It renders what
// `generation-model.ts` publishes and decides nothing: a role added to `GENERATION_PRIORITIES` fails to compile
// rather than rendering a key at a customer. Nothing is sequenced: `generateKitchen` is one synchronous call, so
// the list is wholly pending or wholly resolved. A *nu poate fi inclus* row is drawn as the frame draws it (dashed
// border, muted background, `−` glyph, trailing label), never with `text-decoration: line-through`.
import {
  cornerDirectionOf,
  wallsOf,
  type DesignRoom,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import { useLocale, useTranslations } from "next-intl";

import { useContent } from "@/i18n/use-content";

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
  /** Leaves composition: a pure state clear that restores the draft exactly as it was, with no `departTo` and
   *  no re-seed from the URL. */
  readonly onBack: () => void;
  /** Asks the failed hand-off to write again. Offered only in that state, and re-runs the composition's own
   *  attempt rather than composing anything. */
  readonly onRetry: () => void;
  /** The customer was shown presets and chose to generate, so 1F must not say that none fits (ADR 0112 Amendment A). */
  readonly wasOfferedPresets?: boolean;
}

/** The shape's short name, as the summary line reads it. A `Record` over `DesignRoom["shape"]`, so a shape
 *  the domain learns to store is a compile error here rather than a missing word. */
const SHAPE_SHORT_MESSAGE_KEY = {
  L: "room.shapes.L.short",
  linear: "room.shapes.linear.short",
  U: "room.shapes.U.short",
} as const satisfies Readonly<Record<DesignRoom["shape"], string>>;

/**
 * The row's own class per status; a `Record`, so a fourth row state must be drawn before it ships. The classes are
 * untyped (`styles.*` is `string | undefined`): `tests/room/generation-steps.dom.test.ts` requires `room.module.css`
 * to declare the class each status renders with, since a dropped class silently loses the dashed border and glyph.
 */
const ROW_STATUS_CLASS = {
  pending: styles.composeRowPending,
  placed: styles.composeRowPlaced,
  not_placed: styles.composeRowDropped,
} as const satisfies Readonly<Record<GenerationRowStatus, string | undefined>>;

/** The classes a CSS module declares, joined: an absent one is dropped rather than written into the
 *  attribute as the word *undefined*. */
function classNames(...declared: readonly (string | undefined)[]): string {
  return declared.filter((name) => name !== undefined).join(" ");
}

export function GenerationSteps({
  run,
  onBack,
  onRetry,
  wasOfferedPresets = false,
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
        <ComposeNotice run={run} wasOfferedPresets={wasOfferedPresets} />
        {/* A failed run carries no `rows`, so this is a type narrowing: no screen claims *inclus* over a
            discarded design. */}
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
 * D1F's desktop-only aside: the room's own plan, static because there is no progress to draw (`generateKitchen` is
 * one synchronous call). It is the same unmarked `PlanPreview` 1B draws, never a second layout function.
 * `.composeAside` is `display: none` outside the desktop block (`room.module.css`), so a phone's screen reader
 * never reaches it.
 */
function CompositionPlanAside({ room }: { readonly room: DesignRoom }) {
  return (
    <div className={styles.composeAside} data-testid="room-compose-plan">
      <PlanPreview draft={roomDraftFor(room)} />
    </div>
  );
}

/** The stored draft a composed room's own numbers make, for `PlanPreview`. `parsedRoomLengthsOf` is the one
 *  place a `DesignRoom`'s numbers become wall/height fields, shared with `roomHrefFromDesignRoom`'s URL, so
 *  this draft and that URL cannot map them two different ways. */
function roomDraftFor(room: DesignRoom): RoomDraft {
  const draftWithDirection = withCornerDirection(
    createRoomDraft(room.shape),
    cornerDirectionOf(room),
  );
  return parsedRoomLengthsOf(room).reduce(withStoredLength, draftWithDirection);
}

/**
 * The footer's primary control in three positions. Working, and a finished hand-off (`handoff: "saved"`, see
 * `HandoffStatus`): a `<div>` announcing the run, the shape ADR 0104 decision 6 gives a control that performs
 * nothing. Write failed: a `<button>` that re-runs the composition's own attempt. The day's limit reached: nothing,
 * since an attempt would be refused until tomorrow and the way out is *Înapoi*. Composition failed: nothing, since
 * a busy control reading *Se compune…* under *Compunerea nu s-a putut finaliza* would promise an arrival that is
 * not coming; the way out is *Înapoi*.
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
  if (hasLimitedHandoff(run)) return null;
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

/** Frame 1F's one-line room, in the whole millimetres the customer typed (ADR 0126). The numbers are ICU
 *  arguments, so a digit is never concatenated into a sentence.
 *
 *  The leaf follows the wall count `wallsOf` gives the shape: one wall `roomSummaryLinear`, two `roomSummary`,
 *  three `roomSummaryU`. A straight room's entered fields are wall A and height; `room.depthMm` is the drawn
 *  floor's depth, not a length the customer typed (ADR 0130 decision 2), so it must not be printed as one. */
export function RoomSummary({ room }: { readonly room: DesignRoom }) {
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
 * The band above the list: why the customer is waiting, that the composition did not finish, or that the kitchen
 * was composed and could not be opened. It says nothing about the room (a room too small is refused at 1C). The
 * two failures are separate sentences because they leave the customer in different places: no kitchen behind them
 * (back to the dimensions) or a whole kitchen behind them (ask again).
 *
 * 1F's only live region, `polite` rather than `role="alert"` (as `PanelNoticeRow` in `editor-panel.tsx`): both
 * failures withdraw what the customer was last told. The happy path stays silent because the sentence does not
 * change: `composing` and a composed kitchen being written resolve to the same leaf (`noticeMessageKeyFor`), and
 * `aria-relevant` defaults to *additions text*, so the spinner's removal is not announced. The region must be live
 * before the mutation it announces, so `aria-live` is never switched on with the text change. Focus is deliberately
 * not moved: it would interrupt someone mid-list. `generation-steps.dom.test.ts` pins this.
 */
function ComposeNotice({
  run,
  wasOfferedPresets,
}: {
  readonly run: ActiveGenerationRun;
  readonly wasOfferedPresets: boolean;
}) {
  const translate = useTranslations();
  const content = useContent();
  const hasFailed =
    run.phase === "failed" || hasFailedHandoff(run) || hasLimitedHandoff(run);

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
        {wasOfferedPresets && !hasFailed
          ? content.presetChooser.composingNotice
          : translate(noticeMessageKeyFor(run))}
      </span>
    </div>
  );
}

function hasFailedHandoff(run: ActiveGenerationRun): boolean {
  return run.phase === "composed" && run.handoff === "failed";
}

function hasLimitedHandoff(run: ActiveGenerationRun): boolean {
  return run.phase === "composed" && run.handoff === "limited";
}

/** The four sentences the band can carry, as a literal union (next-intl resolves a key's arguments from its
 *  type). Every state but a failure shares one leaf on purpose: `composing` and a composed kitchen whose write
 *  is in flight or landed all read `noPresetNotice`, so the live region stays silent until a failure changes
 *  the text. */
function noticeMessageKeyFor(
  run: ActiveGenerationRun,
):
  | "room.compose.failed"
  | "room.compose.saveFailed"
  | "room.compose.limitReached"
  | "room.compose.noPresetNotice" {
  if (run.phase === "failed") return "room.compose.failed";
  if (hasFailedHandoff(run)) return "room.compose.saveFailed";
  if (hasLimitedHandoff(run)) return "room.compose.limitReached";
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
          information of its own. */}
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
 * The roles the room left no wall for, named once and explained no further: one message naming the dropped
 * roles, with no new sub-state, per-role explanation or recovery flow (see ADR 0110 Amendment F). The one
 * general reason is the wall sizes, in `room.compose.dropped`.
 */
function DroppedRoles({ log }: { readonly log: GenerationLog }) {
  const translate = useTranslations();
  const locale = useLocale();
  const dropped = droppedRolesIn(log);
  if (dropped.length === 0) return null;

  return (
    <p className={styles.composeDropped} data-testid="room-compose-dropped">
      {translate("room.compose.dropped", {
        // Joined by the locale's own list rule, not a comma written here: a list separator is the locale's to
        // decide.
        roles: new Intl.ListFormat(locale).format(
          dropped.map((role) => translate(GENERATION_ROLE_MESSAGE_KEY[role])),
        ),
      })}
    </p>
  );
}
