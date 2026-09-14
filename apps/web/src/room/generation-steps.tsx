"use client";

// **Sub-state 1F's body** — frame 1F (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:404-461`),
// M7 wave 7F4a.
//
// **It renders what the model publishes and decides nothing.** The five rows, their extents and their
// statuses are `generation-model.ts`'s; this file turns each role and each status into the leaf that
// names it and draws the frame around them. No role's label is spelled at a call site, because a role
// added to `GENERATION_PRIORITIES` must fail to compile rather than render a key at a customer.
//
// **Nothing here is sequenced** (ruling R12). `generateKitchen` is one synchronous call returning a
// finished log, so the list is either wholly pending or wholly resolved; no row has a timer, no row
// changes state without the log changing, and there is no progress to report because there is no
// progress to observe.
//
// **A *nu încape* row is drawn as the frame draws it** (ruling R10): a dashed border, a muted
// background, the `−` glyph and the trailing label. There is no `text-decoration: line-through`
// anywhere — the earlier criterion's word *"struck"* is about the item being struck from the
// composition, and the frame strikes no text.
import type { DesignRoom, GenerationLog } from "@lemnaria/configurator-domain";
import { useLocale, useTranslations } from "next-intl";

import {
  droppedRolesIn,
  GENERATION_ROLE_MESSAGE_KEY,
  GENERATION_STATUS_MESSAGE_KEY,
  type GenerationRow,
  type GenerationRowStatus,
} from "./generation-model";
import { formatMetresForDisplay } from "./metres-text";
import styles from "./room.module.css";
import type { ActiveGenerationRun } from "./use-generation";

export interface GenerationStepsProps {
  /** The run being drawn. `idle` is excluded by the type, so this component has no "not composing"
   *  branch to get wrong: the screen renders the form in that case and never reaches here. */
  readonly run: ActiveGenerationRun;
  /** Leaves composition. A pure state clear that restores the fields with the draft exactly as it
   *  was — no `departTo`, no re-seed from the URL (criterion 26, ruling R14). */
  readonly onBack: () => void;
}

/** The shape's short name, as the summary line reads it. A `Record` over `DesignRoom["shape"]`, so a
 *  shape the domain learns to store is a compile error here rather than a missing word. Only the L
 *  reaches this screen today; wave 7J's straight kitchen is what makes the second arm live. */
const SHAPE_SHORT_MESSAGE_KEY = {
  L: "room.shapes.L.short",
  linear: "room.shapes.linear.short",
} as const satisfies Readonly<Record<DesignRoom["shape"], string>>;

/** The row's own class per status. A `Record` for `SHAPE_SHORT_MESSAGE_KEY`'s reason: a fourth row
 *  state would have to be drawn before it could ship. The values are typed as the CSS module
 *  declares them — a class this stylesheet stopped declaring is `undefined`, not a compile error, so
 *  `.composeRow*` is also asserted from the DOM in `tests/room/generation-steps.dom.test.ts`. */
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

export function GenerationSteps({ run, onBack }: GenerationStepsProps) {
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
        {run.rows === undefined ? null : <StepList rows={run.rows} />}
        {run.phase === "composed" ? <DroppedRoles log={run.log} /> : null}
        <p className={styles.composeRule}>{translate("room.compose.rule")}</p>
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
        {/* Wired to nothing in 7F4a, and a `<div>` for exactly that reason (ADR 0104 decision 6):
            the destination is wave 7F4b's, and until it lands this control announces the run rather
            than offering an action. It never resolves — that is the wave's shape, not a defect. */}
        <div className={styles.composeCta} data-testid="room-compose-cta">
          <span className={styles.composeCtaSpinner} aria-hidden="true" />
          {translate("room.compose.busy")}
        </div>
      </div>
    </>
  );
}

/** Frame 1F's one-line room, in the customer's own notation. The metres are formatted **before** they
 *  reach the message, exactly as `room.planWallLabel`'s are: the separator is the locale's rule and a
 *  digit is never concatenated into a sentence. */
function RoomSummary({ room }: { readonly room: DesignRoom }) {
  const translate = useTranslations();
  const locale = useLocale();

  return (
    <span className={styles.composeSummary} data-testid="room-compose-summary">
      {translate("room.compose.roomSummary", {
        shape: translate(SHAPE_SHORT_MESSAGE_KEY[room.shape]),
        wallA: formatMetresForDisplay(room.widthMm, locale),
        wallB: formatMetresForDisplay(room.depthMm, locale),
        height: formatMetresForDisplay(room.heightMm, locale),
      })}
    </span>
  );
}

/** The band above the list: why the customer is waiting, or — with no frame to draw it — that the
 *  composition did not finish. It says **nothing about the room**: a room too small is refused before
 *  generation runs and its sentence is wave 7F2's, at 1C (ruling R16). */
function ComposeNotice({ run }: { readonly run: ActiveGenerationRun }) {
  const translate = useTranslations();
  const hasFailed = run.phase === "failed";

  return (
    <div
      className={classNames(
        styles.composeNotice,
        hasFailed ? styles.composeNoticeFailed : undefined,
      )}
      data-testid="room-compose-notice"
      data-compose-phase={run.phase}
    >
      {run.phase === "composing" ? (
        <span className={styles.composeSpinner} aria-hidden="true" />
      ) : null}
      <span className={styles.composeNoticeText}>
        {translate(
          hasFailed ? "room.compose.failed" : "room.compose.noPresetNotice",
        )}
      </span>
    </div>
  );
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
          <StepRow key={row.role} row={row} />
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
      data-testid={`room-compose-row-${row.role}`}
      data-compose-status={row.status}
    >
      {/* The mark is drawn by the stylesheet and named by the status beside it, so it carries no
          information of its own — see `.composeRowGlyph`. */}
      <span className={styles.composeRowGlyph} aria-hidden="true" />
      <span
        className={styles.composeRowName}
        data-testid={`room-compose-name-${row.role}`}
      >
        {translate("room.compose.rowLabel", {
          role: translate(GENERATION_ROLE_MESSAGE_KEY[row.role]),
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
        data-testid={`room-compose-status-${row.role}`}
      >
        {translate(GENERATION_STATUS_MESSAGE_KEY[row.status])}
      </span>
    </li>
  );
}

/**
 * **The roles the room left no wall for, named once and explained no further.**
 *
 * ADR 0110 Amendment F's instruction is binding and is quoted here because it is the whole
 * specification: *"one message naming the dropped roles, in the state the screen already has, reading
 * `plan.dropped` as it stands. No new sub-state, no per-role explanation, no recovery flow."*
 *
 * **The sentence is unapproved copy, and this is the note that says so.** Amendment F asked the wave
 * that builds it to confirm the wording with the owner; that is **question Q7F4-1** and it is open.
 * `room.compose.dropped` is the plan's draft, shipped so the wave is not blocked — replace the leaf
 * when the owner answers, and delete this paragraph with it.
 */
function DroppedRoles({ log }: { readonly log: GenerationLog }) {
  const translate = useTranslations();
  const locale = useLocale();
  const dropped = droppedRolesIn(log);
  if (dropped.length === 0) return null;

  return (
    <p className={styles.composeDropped} data-testid="room-compose-dropped">
      {translate("room.compose.dropped", {
        // Joined by the locale's own list rule rather than by a comma written here — the same reason
        // the decimal separator is derived in `metres-text.ts` and never spelled.
        roles: new Intl.ListFormat(locale).format(
          dropped.map((role) => translate(GENERATION_ROLE_MESSAGE_KEY[role])),
        ),
      })}
    </p>
  );
}
