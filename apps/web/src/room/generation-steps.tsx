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
// **A *nu poate fi inclus* row is drawn as the frame draws it** (ruling R10): a dashed border, a
// muted background, the `−` glyph and the trailing label. There is no `text-decoration:
// line-through` anywhere — the earlier criterion's word *"struck"* is about the item being struck
// from the composition, and the frame strikes no text.
//
// **The five leaves this file renders under `room.compose.{stepsLabel,status.placed,
// status.notPlaced,rule,dropped}` carry the owner's 2026-09-15 rulings in Romanian, and the Russian
// re-drafted to follow them under [ADR 0113](../../../../docs/decisions/0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
// decision 4** — a reworded Romanian leaf *means* the Russian is re-drafted; that is the ruling's own
// consequence, not a pending approval. The catalogues must stay key-identical, and a Russian sentence
// still reading *не помещается* beside a Romanian one that no longer does would be worse than either.
// `stepsLabel` is the fifth: the owner's second ruling made the heading passive (*Ce este inclus*),
// so the Russian follows it into *Что включено* and matches the `включено` its own rows show.
//
// **Do not mark these as awaiting Gate O2.** That gate **closed on 2026-09-11** (`docs/STATUS.md`),
// and ADR 0113 decision 3 approves the Russian draft of these leaves by the same ruling as the
// Romanian. An earlier version of this paragraph said otherwise on the coordinator's instruction,
// which cited a note that had gone stale.
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
        {/* **A failed run has no rows to draw, and this is a narrowing rather than a decision**:
            `GenerationRunState`'s `failed` member carries no `rows` at all, so the alternative to
            this branch is a compile error and not a screen claiming *inclus* over a design that was
            discarded (coordinator's ruling, 2026-09-15). */}
        {run.phase === "failed" ? null : <StepList rows={run.rows} />}
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
        // Joined by the locale's own list rule rather than by a comma written here — the same reason
        // the decimal separator is derived in `metres-text.ts` and never spelled.
        roles: new Intl.ListFormat(locale).format(
          dropped.map((role) => translate(GENERATION_ROLE_MESSAGE_KEY[role])),
        ),
      })}
    </p>
  );
}
