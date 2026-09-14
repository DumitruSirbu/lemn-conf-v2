"use client";

// **Step 1's screen** — frame 1A today (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:48-99`),
// with 1B's fields, corner toggle and plan preview arriving in wave 7F1's next slice.
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
// (ADR 0111 decision 3). The choice below is the one piece of state that is not in the URL yet, and
// *Continuă* is what puts it there.
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

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

import styles from "./room.module.css";
import type { RoomUrlState } from "./room-url-state";
import { ShapePicker } from "./shape-picker";

export interface RoomScreenProps {
  readonly state: RoomUrlState;
  /** The policy the cards are offered against. Defaulted rather than threaded through the page, so
   *  the route stays the shell criterion 17 requires; a test hands in another one to prove the CTA
   *  reads the policy instead of spelling a shape's letter (criterion 3). */
  readonly policy?: RoomPolicy;
}

/** Step 1 of 4. The arguments the two approved leaves are rendered with, in one place so the pill
 *  and the sentence it announces can never disagree about which step this is. */
const STEP_ONE_OF_FOUR = { step: 1, totalSteps: 4 } as const;

export function RoomScreen({
  state,
  policy = APPROVED_ROOM_POLICY,
}: RoomScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const shapeQuestionId = useId();
  const [chosenShape, setChosenShape] = useState<RoomShape | undefined>(
    shapeAlreadyInTheUrl(state),
  );

  function continueToLengths(): void {
    if (chosenShape === undefined) return;
    router.push({ pathname, query: { shape: chosenShape } });
  }

  return (
    <div className={styles.screen}>
      <RoomTopBar />
      {state.substate === "1A" ? (
        <ShapeStep
          chosenShape={chosenShape}
          labelledBy={shapeQuestionId}
          policy={policy}
          onChoose={setChosenShape}
          onContinue={continueToLengths}
        />
      ) : null}
    </div>
  );
}

function RoomTopBar() {
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
          {translate("room.title")}
        </span>
      </header>
      <LocaleMenu />
    </div>
  );
}

interface ShapeStepProps {
  readonly chosenShape: RoomShape | undefined;
  readonly labelledBy: string;
  readonly policy: RoomPolicy;
  readonly onChoose: (shape: RoomShape) => void;
  readonly onContinue: () => void;
}

function ShapeStep({
  chosenShape,
  labelledBy,
  policy,
  onChoose,
  onContinue,
}: ShapeStepProps) {
  const translate = useTranslations();
  // The wave's one buildability question, asked of the policy and never of a shape's letter
  // (criterion 3). Wave 7J turns the straight kitchen on by adding its approved bounds to
  // `APPROVED_ROOM_POLICY`, and this line is what lets it do that without editing a component.
  const canContinue =
    chosenShape !== undefined && isShapeBuildable(chosenShape, policy);

  return (
    <>
      <div className={styles.body}>
        <div className={styles.intro}>
          <h2 className={styles.question} id={labelledBy}>
            {translate("room.shapeQuestion")}
          </h2>
          <p className={styles.lead}>{translate("room.shapeLead")}</p>
        </div>
        <ShapePicker
          chosenShape={chosenShape}
          labelledBy={labelledBy}
          onChoose={onChoose}
        />
        <p className={styles.note}>{translate("room.dimensionsLater")}</p>
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cta}
          disabled={!canContinue}
          data-testid="room-continue"
          onClick={onContinue}
        >
          {translate("room.continue")}
        </button>
      </div>
    </>
  );
}

/** The shape the query already names, so a customer who goes back from the lengths finds the card
 *  they chose still chosen. 1A is the one sub-state that names none. */
function shapeAlreadyInTheUrl(state: RoomUrlState): RoomShape | undefined {
  if (state.substate === "1A") return undefined;
  if (state.substate === "1B") return state.shape;
  return state.input.shape;
}
