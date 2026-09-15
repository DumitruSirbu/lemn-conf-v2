"use client";

// **Step 1's screen** — frame 1A (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:48-99`)
// and frame 1B (`:101-187`).
//
// The top bar is drawn in **every** sub-state (M7 criterion 1), because the wordmark, the step and
// the language control do not depend on how far into the room the customer has got.
//
// **The step pill reuses `configure.step` and `configure.stepPill` at `step: 1`** (ruling R7). The
// numbers are ICU arguments rather than a composed *1/4*, so a language change re-renders them;
// and the sentence the pill announces is the one the owner already approved, held in one leaf rather
// than copied into a second under `room.*` where the two could drift apart.
//
// **Nothing here writes to a store, a cookie or web storage**: the URL is the room's only store
// (ADR 0111 decision 3). At 1A the chosen card is the one piece of state not yet in the URL and
// *Continuă* is what puts it there; from 1B onward the query is rewritten **as the customer types**
// by a debounced `router.replace` (ruling R9, `room-query-sync.ts`), so a half-entered room survives
// a reload — and, because the write goes through Next's own router rather than
// `window.history.replaceState`, a browser Back as well.
//
// **What this screen is showing is the query the browser holds, never the one the server parsed**
// (ruling R9). Next reuses a page segment on a back/forward navigation
// (`next/dist/docs/01-app/02-guides/upgrading/version-15.md:525`), so a parse handed down as a prop
// describes the entry the customer *left* rather than the one they are looking at — which is how a
// traversal came to draw 1A under a 1B URL (defect D5). `useSearchParams` is therefore the single
// authority here: the sub-state, the marked fields and the shape branch all derive from it, and the
// route hands this component no parse to disagree with.
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type DesignRoom,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
// `useSearchParams` is read from `next/navigation` rather than from `@/i18n/navigation`: next-intl
// wraps the navigations that need a locale prefix, and a query is the same query in both locales.
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

// **A temporary cross-route coupling, and it is the coupling ruling R5 exists to delete.** A second
// screen reaching into the editor's route folder for a shared control is the wrong end state; R5
// removes it by moving the component to `src/chrome/locale-menu.tsx` with a `className` for its
// positioning cell, and that wave updates this line and `configure-screen.tsx`'s.
//
// **Why it is still here** (coordinator, 2026-09-14, deferring R5 to its own wave): R5 was ruled on
// an estimate of *one moved file, one import line, zero CSS risk*, and that estimate was corrected
// here. The move breaks four test files, one of them frozen by this wave — and the `className` prop
// breaks `top-bar-box.test.ts` and `qa-w4-top-bar.adversarial.test.ts` **with no move at all**,
// because those two assert that the locale cell's positioning lives in the component and that the
// screen does not carry `styles.locale}`. Those are ADR 0104 structural guards on the top bar's
// grid, not path constants, so R5 is an invariant change rather than a relocation and does not
// belong in a Light wave that is also drawing a screen from scratch.
import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { usePathname, useRouter } from "@/i18n/navigation";

import { DimensionsForm } from "./dimensions-form";
import { GenerationSteps } from "./generation-steps";
import { PLAN_BOX, PlanPreview } from "./plan-preview";
import { derivePlanPreview } from "./plan-preview-model";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  queryFromSearchParams,
  roomShapeInState,
  useRoomQuerySync,
} from "./room-query-sync";
import { useGeneration, type GenerationRun } from "./use-generation";
import styles from "./room.module.css";
import {
  missingLengthFields,
  withCornerDirection,
  withEnteredText,
  withRoomShape,
  type RoomDraft,
} from "./room-draft";
import { parseRoomUrlState } from "./room-url-state";
import { ShapeChips, ShapePicker } from "./shape-picker";

export interface RoomScreenProps {
  /** The policy the cards are offered against. Defaulted rather than threaded through the page, so
   *  the route stays the shell criterion 17 requires; a test hands in another one to prove the CTA
   *  reads the policy instead of spelling a shape's letter (criterion 3). */
  readonly policy?: RoomPolicy;
}

/** Step 1 of 4. The arguments the two approved leaves are rendered with, in one place so the pill
 *  and the sentence it announces can never disagree about which step this is. */
const STEP_ONE_OF_FOUR = { step: 1, totalSteps: 4 } as const;

export function RoomScreen({ policy = APPROVED_ROOM_POLICY }: RoomScreenProps) {
  const liveQuery = queryFromSearchParams(useSearchParams());
  const liveState = parseRoomUrlState(liveQuery);
  const shapeInTheUrl = roomShapeInState(liveState);
  // **The composition lives here so the top bar can read it** (wave 7F4 ruling R14, ground truth
  // G11): frames 1A–1C title the screen *Cameră* and 1D–1F title it *Preset*, and the bar is drawn
  // above the branch. It is **client state and not a URL sub-state** (R13) — a new query key is
  // stripped by the settle, a new path segment 404s under the proxy allow-list, and an addressable
  // composition URL would re-run generation on every reload and mint a second design.
  const run = useGeneration();
  const { leave } = run;
  // The one client flag this screen branches on, and the reason the title and the body cannot
  // disagree about which sub-state is drawn: both read this single expression.
  const isComposing = shapeInTheUrl !== undefined && run.state.phase !== "idle";

  // **A URL that names no shape names no room to compose for.** This is the 1A guard and nothing
  // wider: a run is ended when the query it was started from is gone, so a screen cannot draw a
  // kitchen composed for a room the URL no longer names. It ends a run; it **starts** none (R15),
  // and under StrictMode the second invocation clears an already-clear run.
  //
  // **It is not what catches a browser Back out of 1F** — the effect below is. An earlier note here
  // claimed composition mints no history entry, so that a Back out of 1F landed at 1A. It does not:
  // `departTo("presets")` *pushes* the room's own query, and the entry behind it is the settle's
  // `replace` of that same query, so a Back lands on a URL that still names the shape and this
  // effect never fires. *"Leaving the room behind leaves its composition behind"* was only ever true
  // of the shape-less URL, which is the one case this line still covers.
  useEffect(() => {
    if (shapeInTheUrl === undefined) leave();
  }, [shapeInTheUrl, leave]);

  // **A history traversal out of composition clears the run and shows the form** (coordinator's
  // ruling, 2026-09-15), because both entries around 1F carry the same query and nothing else can
  // tell the traversal apart: not `liveText`, which is unchanged, and not the sub-state, which is
  // 1D on both sides. Without this the customer presses Back, 1F stays on the glass, and the button
  // appears to do nothing — the defect class wave 7F1 was spent removing.
  //
  // **R13 is intact**: the run is cleared by an *event*, and nothing about composition is written
  // to or read from the URL. `leave` is idempotent, so a traversal taken anywhere else in step 1
  // clears an already-clear run.
  useEffect(() => {
    window.addEventListener("popstate", leave);
    return () => {
      window.removeEventListener("popstate", leave);
    };
  }, [leave]);

  return (
    // The two markers the traversal gate and the visual pass read the screen's sub-state off. They
    // live on the screen rather than on the route because they have to report what the customer is
    // **looking at**: derived from one parse of the live query, they cannot disagree with the branch
    // taken below, and a segment restored on Back re-derives both instead of replaying the server's.
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

/** The bar is drawn in every sub-state and **only its title changes** in composition (criterion 25):
 *  the pill still resolves the approved step leaves at `step: 1` and the locale menu is untouched. */
function RoomTopBar({ isComposing }: { readonly isComposing: boolean }) {
  const translate = useTranslations();

  return (
    <div className={styles.topBar}>
      <header className={styles.topBarCell}>
        <span className={styles.wordmark} data-testid="top-bar-wordmark">
          {translate("brand")}
        </span>
        {/* The step, twice over and from one source: the pill the frame draws, and — as its
            accessible name — the sentence that names the step. "1/4" read aloud is two numbers and
            a slash. `role="img"` over a visually hidden span, for the reason the editor's own bar
            records: a hidden span is a clipped one, and the containment gate cannot tell
            "deliberately hidden" from "squeezed off the row". */}
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
  const [chosenShape, setChosenShape] = useState<RoomShape | undefined>(
    undefined,
  );
  // The wave's one buildability question, asked of the policy and never of a shape's letter
  // (criterion 3). Wave 7J turns the straight kitchen on by adding its approved bounds to
  // `APPROVED_ROOM_POLICY`, and this line is what lets it do that without editing a component.
  const canContinue =
    chosenShape !== undefined && isShapeBuildable(chosenShape, policy);

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
          onChoose={setChosenShape}
        />
        <p className={styles.note}>{translate("room.dimensionsLater")}</p>
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

interface DimensionsStepProps {
  /** The first draft's shape and nothing more: the chips below read `draft.shape`, and a later URL
   *  naming another shape re-seeds through the sync rather than through this prop. */
  readonly seedShape: RoomShape;
  readonly policy: RoomPolicy;
  readonly run: GenerationRun;
}

/**
 * Sub-states 1B onward: the chips, the live plan, the corner toggle and the length fields, over a
 * draft this component owns and a URL the sync keeps in step with it (ruling R9).
 *
 * **1F is drawn from inside here, and this component never unmounts for it** (wave 7F4 ruling R14).
 * If entering composition unmounted the dimensions step, the convergence loop would unmount with a
 * departure armed and a flush in flight, and *Înapoi* out of 1F would have to re-seed the form from
 * whatever the URL happened to hold. Keeping `useRoomQuerySync` mounted above the branch makes
 * leaving 1F a **pure state clear**: the draft is still in memory, caret residue and all, and nothing
 * re-seeds. `room-query-sync.ts` is untouched by this wave and `RoomDestination` gains no member —
 * the no-second-discriminator rule applies unchanged, and this is the wave that rule names as its
 * amplifier, because *Continuă*'s push now has a destination that matters.
 */
function DimensionsStep({ seedShape, policy, run }: DimensionsStepProps) {
  const translate = useTranslations();
  const { draft, setDraft, departTo } = useRoomQuerySync(seedShape);

  /**
   * **The one place generation is started from, and it is an event handler** (ruling R15).
   *
   * `reactStrictMode: true` double-invokes effects in development, so an effect that generated would
   * build two kits and — once wave 7F4b hands off — mint two design rows, with every existing test
   * green. A tap runs this once.
   *
   * The departure still flushes exactly as it did before this wave (criterion 24): the query the
   * customer leaves behind is written first, and the push that follows lands on the URL already
   * showing. Composition is added **beside** that, not in place of it.
   */
  function continueFromLengths(): void {
    departTo("presets");
    const room = roomInDraft(draft);
    if (room !== undefined) run.compose(room);
  }

  if (run.state.phase !== "idle") {
    return <GenerationSteps run={run.state} onBack={run.leave} />;
  }

  return (
    <>
      <div className={styles.dimensionsBody}>
        <ShapeChips
          chosenShape={draft.shape}
          onChoose={(chosen) => {
            setDraft(withRoomShape(draft, chosen));
          }}
        />
        <PlanPreview plan={derivePlanPreview(draft, PLAN_BOX)} />
        <DimensionsForm
          draft={draft}
          onEnterLength={(field, text) => {
            setDraft(withEnteredText(draft, { field, text }));
          }}
          onChooseCorner={(direction) => {
            setDraft(withCornerDirection(draft, direction));
          }}
        />
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
          disabled={!canContinueFrom(draft, policy)}
          data-testid="room-continue"
          onClick={continueFromLengths}
        >
          {translate("room.continue")}
        </button>
      </div>
    </>
  );
}

/** *Continuă* leads on once the shape can be built and every field the shape asks for reads as a
 *  length. Neither half is a bound: whether the lengths are **allowed** is `validateRoomInput`'s
 *  question, its reasons are wave 7F2's surface, and nothing here duplicates either. */
function canContinueFrom(draft: RoomDraft, policy: RoomPolicy): boolean {
  return (
    isShapeBuildable(draft.shape, policy) &&
    missingLengthFields(draft).length === 0
  );
}

/**
 * **The room a composition runs for: the draft's, read through the parser the URL is read with.**
 *
 * The draft is put into its canonical query and that query is parsed, so this asks the *same*
 * question of the same authority the address bar is answered by — a room reaches sub-state 1D here
 * exactly when it would reach it from a URL, with no second reading of what a valid room is.
 *
 * **Why the draft and not `useSearchParams`, which is what the screen branches on everywhere else.**
 * The URL trails the draft by the settle interval, so within 400 ms of a keystroke the query is a
 * room the customer has already moved past — or, at 1B, no room at all — while `departTo` is at that
 * moment flushing the draft to the address bar. Generating from the live query there would compose
 * the previous room, or silently compose nothing and leave *Continuă* dead for those 400 ms. This is
 * the query the URL is about to hold, which is the one the customer asked for.
 *
 * `undefined` for a room the domain refuses: that is sub-state 1C, the tap is the departure alone,
 * and the sentence the customer reads there is wave 7F2's (ruling R16).
 */
function roomInDraft(draft: RoomDraft): DesignRoom | undefined {
  const state = parseRoomUrlState(
    queryEntriesOf(canonicalRoomQuery(draft).toString()),
  );
  return state.substate === "1D" ? state.room : undefined;
}
