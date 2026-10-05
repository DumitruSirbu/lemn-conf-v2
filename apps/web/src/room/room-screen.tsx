"use client";

// Step 1's screen: 1A (choose a shape) and 1B onward (the lengths). The top bar is drawn in every
// sub-state. The step pill reuses `configure.step` and `configure.stepPill` at `step: 1`: the numbers
// are ICU arguments so a language change re-renders them, and the announced sentence has one leaf.
//
// Nothing here writes to a store, cookie or web storage: the URL is the room's only store (ADR 0111
// decision 3). From 1B the query is rewritten as the customer types by a debounced `router.replace`
// (`room-query-sync.ts`); going through Next's router, not `window.history`, keeps a browser Back working.
//
// The sub-state, marked fields and shape branch derive from `useSearchParams`, never from a parse
// handed down by the route: Next reuses a page segment on back/forward
// (`next/dist/docs/01-app/02-guides/upgrading/version-15.md:525`), so a prop describes the entry the
// customer left.
//
// Exception: 1C's surfaces read the draft, because the URL trails it by the settle interval and a
// reason read off the URL would appear and clear late. The reasons, red wall, note and *Continuă*'s
// state are the parse of the draft's own canonical query (`roomInDraft`); `<main>`'s markers stay the URL's.
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
// From `next/navigation`, not `@/i18n/navigation`: a query is the same in both locales.
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

// A temporary cross-route import of the editor's locale menu. Moving it to `src/chrome/` is not a
// relocation: `top-bar-box.test.ts` and `qa-w4-top-bar.adversarial.test.ts` are ADR 0104 structural
// guards asserting the locale cell's positioning lives in the component, which a `className` prop breaks.
import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { usePathname, useRouter } from "@/i18n/navigation";

import { DimensionsForm } from "./dimensions-form";
import { GenerationSteps } from "./generation-steps";
import { PlanPreview } from "./plan-preview";
import {
  canContinueFrom,
  draftStateOf,
  presentOneC,
  roomInDraft,
} from "./one-c-surfaces";
import { OneCStatus } from "./one-c-status";
import {
  queryFromSearchParams,
  roomShapeInState,
  useRoomQuerySync,
} from "./room-query-sync";
import { useGeneration, type GenerationRun } from "./use-generation";
import styles from "./room.module.css";
import {
  withCornerDirection,
  withEnteredText,
  withRoomShape,
  type RoomDraft,
} from "./room-draft";
import { parseRoomUrlState } from "./room-url-state";
import { ShapeChips, ShapePicker, ShapeRefusal } from "./shape-picker";
import { useTypingPause } from "./use-typing-pause";
import { ValidationSuggestion } from "./validation-suggestion";

/** The *Liniară* chip's control, which the suggestion card moves focus to once it unmounts (D8). */
const LINEAR_CHIP_CONTROL_SELECTOR =
  '[data-testid="room-shape-chip-control-linear"]';

export interface RoomScreenProps {
  /** The policy the cards are offered against; the CTA reads it rather than spelling a shape's letter. */
  readonly policy?: RoomPolicy;
}

/** One source for the pill and the sentence it announces, so they cannot disagree about the step. */
const STEP_ONE_OF_FOUR = { step: 1, totalSteps: 4 } as const;

export function RoomScreen({ policy = APPROVED_ROOM_POLICY }: RoomScreenProps) {
  const liveQuery = queryFromSearchParams(useSearchParams());
  const liveState = parseRoomUrlState(liveQuery, policy);
  const shapeInTheUrl = roomShapeInState(liveState);
  // The composition lives here so the top bar, drawn above the branch, can title the screen. It is
  // client state, not a URL sub-state: a new query key is stripped by the settle, a new path segment
  // 404s under the proxy allow-list, and an addressable composition URL would re-run generation on
  // every reload and mint a second design.
  const run = useGeneration();
  const { leave } = run;
  // Title and body read this one expression, so they cannot disagree about the sub-state.
  const isComposing = shapeInTheUrl !== undefined && run.state.phase !== "idle";

  // A URL that names no shape names no room to compose for, so the run ends. This ends a run and
  // starts none, and is idempotent under StrictMode. It does not catch a browser Back out of 1F: that
  // lands on a URL that still names the shape (`departTo("presets")` pushes the room's own query).
  useEffect(() => {
    if (shapeInTheUrl === undefined) leave();
  }, [shapeInTheUrl, leave]);

  // A history traversal out of composition clears the run and shows the form. Both entries around 1F
  // carry the same query, so only the event can tell the traversal apart; without it Back leaves 1F
  // on screen. Nothing about composition is written to or read from the URL, and `leave` is idempotent.
  useEffect(() => {
    window.addEventListener("popstate", leave);
    return () => {
      window.removeEventListener("popstate", leave);
    };
  }, [leave]);

  return (
    // The traversal gate and the visual pass read the sub-state off these markers. They live on the
    // screen, derived from the live query, so they cannot disagree with the branch taken below.
    <main
      className={styles.screen}
      data-room-substate={liveState.substate}
      data-marked-fields={liveState.markedFields.join(",")}
    >
      <RoomTopBar isComposing={isComposing} />
      {shapeInTheUrl === undefined ? (
        <ShapeStep policy={policy} />
      ) : (
        <DimensionsStep seedShape={shapeInTheUrl} policy={policy} run={run} />
      )}
    </main>
  );
}

/** Only the title changes in composition; the pill still resolves the step leaves at `step: 1`. */
function RoomTopBar({ isComposing }: { readonly isComposing: boolean }) {
  const translate = useTranslations();

  return (
    <div className={styles.topBar}>
      <header className={styles.topBarCell}>
        <span className={styles.wordmark} data-testid="top-bar-wordmark">
          {translate("brand")}
        </span>
        {/* The pill's accessible name is the sentence naming the step, since "1/4" reads aloud as two
            numbers and a slash. `role="img"` rather than a visually hidden span: the containment gate
            cannot tell a clipped hidden span from one squeezed off the row. */}
        <span
          className={styles.stepPill}
          role="img"
          aria-label={translate("configure.step", STEP_ONE_OF_FOUR)}
          data-testid="top-bar-step"
        >
          {translate("configure.stepPill", STEP_ONE_OF_FOUR)}
        </span>
        <span className={styles.title} data-testid="top-bar-title">
          {translate(isComposing ? "room.compose.title" : "room.title")}
        </span>
      </header>
      <LocaleMenu />
    </div>
  );
}

/** Sub-state 1A: choose a shape, and nothing is in the URL yet. */
function ShapeStep({ policy }: { readonly policy: RoomPolicy }) {
  const translate = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const shapeQuestionId = useId();
  const refusalId = useId();
  const [chosenShape, setChosenShape] = useState<RoomShape | undefined>(
    undefined,
  );
  const refusedShape = refusedShapeOf(chosenShape, policy);
  const canContinue = chosenShape !== undefined && refusedShape === undefined;

  function continueToLengths(): void {
    if (chosenShape === undefined) return;
    router.push({ pathname, query: { shape: chosenShape } });
  }

  return (
    <>
      <div className={styles.body}>
        <div className={styles.intro}>
          <h2 className={styles.question} id={shapeQuestionId}>
            {translate("room.shapeQuestion")}
          </h2>
          <p className={styles.lead}>{translate("room.shapeLead")}</p>
        </div>
        <ShapePicker
          chosenShape={chosenShape}
          labelledBy={shapeQuestionId}
          describedBy={refusalIdFor(refusedShape, refusalId)}
          onChoose={setChosenShape}
        />
        <ShapeRefusal id={refusalId} refusedShape={refusedShape} />
        <p className={styles.note} data-testid="room-dimensions-later">
          {translate("room.dimensionsLater")}
        </p>
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cta}
          disabled={!canContinue}
          data-testid="room-continue"
          onClick={continueToLengths}
        >
          {translate("room.continue")}
        </button>
      </div>
    </>
  );
}

/** The chosen card when the policy does not build it, asked of the policy and never of a shape's
 *  letter, so a newly approved shape enables *Continuă* and the refusal without editing a component. */
function refusedShapeOf(
  chosenShape: RoomShape | undefined,
  policy: RoomPolicy,
): RoomShape | undefined {
  if (chosenShape === undefined) return undefined;
  return isShapeBuildable(chosenShape, policy) ? undefined : chosenShape;
}

/** The refusal's id while a shape is refused: the wiring 1A and 1B share. */
function refusalIdFor(
  refusedShape: RoomShape | undefined,
  refusalId: string,
): string | undefined {
  return refusedShape === undefined ? undefined : refusalId;
}

interface DimensionsStepProps {
  /** Seeds the first draft only; a later URL naming another shape re-seeds through the sync. */
  readonly seedShape: RoomShape;
  readonly policy: RoomPolicy;
  readonly run: GenerationRun;
}

/**
 * Sub-states 1B onward, over a draft this component owns and a URL the sync keeps in step with it.
 *
 * 1F is drawn from inside here and this component never unmounts for it: unmounting would drop the
 * convergence loop with a departure armed and a flush in flight, and *Înapoi* would have to re-seed
 * the form from the URL. With `useRoomQuerySync` mounted above the branch, leaving 1F is a pure
 * state clear and the draft survives.
 */
function DimensionsStep({ seedShape, policy, run }: DimensionsStepProps) {
  const translate = useTranslations();
  const { draft, setDraft, departTo } = useRoomQuerySync(seedShape);
  const { typing, noteKeystroke, noteEdit, endPause } = useTypingPause(draft);
  const draftState = draftStateOf(draft, policy);
  const { surfaces: oneC, isContinueActive: canContinue } = presentOneC({
    draft,
    draftState,
    policy,
    typing,
  });
  const noteId = useId();
  const refusalId = useId();
  const suggestionId = useId();
  const refusedShape = oneC.isShapeRefused ? draft.shape : undefined;
  const dimensionsBodyRef = useRef<HTMLDivElement>(null);

  function edit(nextDraft: RoomDraft): void {
    noteEdit({ before: draft, after: nextDraft });
    setDraft(nextDraft);
  }

  /** The one place a shape is chosen from 1B on: the chips and the suggestion card both call it, so
   *  the card writes and navigates nothing the chip would not. */
  function chooseShape(shape: RoomShape): void {
    edit(withRoomShape(draft, shape));
  }

  /** Runs the *Liniară* chip's handler, then moves focus to that chip, since the card that had focus
   *  has unmounted. The chip is found by `data-testid` rather than a ref shared across two files. */
  function chooseLinearFromSuggestion(): void {
    chooseShape("linear");
    dimensionsBodyRef.current
      ?.querySelector<HTMLInputElement>(LINEAR_CHIP_CONTROL_SELECTOR)
      ?.focus();
  }

  /**
   * The one place generation starts, and it is an event handler: `reactStrictMode` double-invokes
   * effects in development, so an effect would build two kits and mint two design rows.
   *
   * The departure flushes first, then composition runs beside it. Over a room the domain refuses
   * (mid-burst the button can still be active over a 1C draft) the tap ends the pause so the reasons
   * appear, and calls no `departTo`: that would push the refused query as a history entry.
   */
  function continueFromLengths(): void {
    const room = roomInDraft(draftState);
    if (room === undefined || !canContinueFrom(draft, policy)) {
      endPause();
      return;
    }
    departTo("presets");
    run.compose(room);
  }

  if (run.state.phase !== "idle") {
    return (
      <GenerationSteps
        run={run.state}
        onBack={run.leave}
        onRetry={run.retryHandoff}
      />
    );
  }

  return (
    <>
      <div className={styles.dimensionsBody} ref={dimensionsBodyRef}>
        <ShapeChips
          chosenShape={draft.shape}
          describedBy={refusalIdFor(refusedShape, refusalId)}
          onChoose={chooseShape}
        />
        <ShapeRefusal id={refusalId} refusedShape={refusedShape} />
        <PlanPreview draft={draft} markedWalls={oneC.markedWalls} />
        <DimensionsForm
          draft={draft}
          fieldReasons={oneC.fieldReasons}
          unreadableFields={oneC.unreadableFields}
          suggestionId={oneC.isLinearSuggested ? suggestionId : undefined}
          onEnterLength={(field, text) => {
            const typed = withEnteredText(draft, { field, text });
            noteKeystroke({ before: draft, after: typed });
            setDraft(typed);
          }}
          onChooseCorner={(direction) => {
            edit(withCornerDirection(draft, direction));
          }}
        />
        <OneCStatus
          roomReasons={oneC.roomReasons}
          isNoteShown={oneC.isNoteShown}
          noteId={noteId}
          // A room-level reason names no field, so it is the only surface left to reference the
          // suggestion from when it fires with zero field reasons (e.g. ROOM_TOO_SMALL_FOR_KITCHEN).
          suggestionId={
            oneC.isLinearSuggested && oneC.fieldReasons.length === 0
              ? suggestionId
              : undefined
          }
        >
          <ValidationSuggestion
            isShown={oneC.isLinearSuggested}
            id={suggestionId}
            onChooseLinear={chooseLinearFromSuggestion}
          />
        </OneCStatus>
      </div>
      <div className={styles.dimensionsFooter}>
        <button
          type="button"
          className={styles.back}
          data-testid="room-back"
          onClick={() => {
            departTo("shapes");
          }}
        >
          {translate("room.back")}
        </button>
        <button
          type="button"
          className={styles.cta}
          disabled={!canContinue}
          // `presentOneC` shows the note only while this button is inactive, so the note alone decides.
          aria-describedby={oneC.isNoteShown ? noteId : undefined}
          data-testid="room-continue"
          onClick={continueFromLengths}
        >
          {translate("room.continue")}
        </button>
      </div>
    </>
  );
}
