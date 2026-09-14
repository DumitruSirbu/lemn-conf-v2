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
// (ruling R2), so a half-entered room survives a reload.
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type CornerDirection,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { useLocale, useTranslations } from "next-intl";
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
import { metresTextForUrl } from "./metres-text";
import { PLAN_BOX, PlanPreview } from "./plan-preview";
import { derivePlanPreview } from "./plan-preview-model";
import styles from "./room.module.css";
import {
  carriesCornerDirection,
  createRoomDraft,
  missingLengthFields,
  withCornerDirection,
  withEnteredText,
  withRoomShape,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "./room-draft";
import { parseMetresToMillimetres } from "./parse-metres";
import {
  requiredFieldsFor,
  type RoomSearchParams,
  type RoomUrlState,
} from "./room-url-state";
import { ShapeChips, ShapePicker } from "./shape-picker";

export interface RoomScreenProps {
  readonly state: RoomUrlState;
  /** The query the page parsed `state` out of. The sub-states carry which fields are still to be
   *  filled but not the lengths that already read (`room-url-state.ts:95-97`), and 1B's fields have
   *  to show what the URL already holds — so the form hydrates from the query the page already had
   *  rather than from a second parse or a stored copy. */
  readonly query: RoomSearchParams;
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
  query,
  policy = APPROVED_ROOM_POLICY,
}: RoomScreenProps) {
  const shapeInTheUrl = shapeAlreadyInTheUrl(state);

  return (
    <div className={styles.screen}>
      <RoomTopBar />
      {shapeInTheUrl === undefined ? (
        <ShapeStep policy={policy} />
      ) : (
        <DimensionsStep
          key={roomEntryKey(shapeInTheUrl, query)}
          shape={shapeInTheUrl}
          query={query}
          policy={policy}
        />
      )}
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
  readonly shape: RoomShape;
  readonly query: RoomSearchParams;
  readonly policy: RoomPolicy;
}

/**
 * Sub-states 1B onward: the chips, the live plan, the corner toggle and the length fields, over a
 * draft this component owns and a URL it rewrites as the customer types.
 */
function DimensionsStep({ shape, query, policy }: DimensionsStepProps) {
  const translate = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [draft, setDraft] = useState<RoomDraft>(() =>
    roomDraftFromQuery(shape, query, locale),
  );

  const canonicalQuery = canonicalRoomQuery(draft);
  useCanonicalQueryInTheAddressBar(canonicalQuery.toString());

  function continueToPresets(): void {
    router.push({ pathname, query: Object.fromEntries(canonicalQuery) });
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
            router.push({ pathname });
          }}
        >
          {translate("room.back")}
        </button>
        <button
          type="button"
          className={styles.cta}
          disabled={!canContinueFrom(draft, policy)}
          data-testid="room-continue"
          onClick={continueToPresets}
        >
          {translate("room.continue")}
        </button>
      </div>
    </>
  );
}

/**
 * **Ruling R2's mechanism, verified against `next/dist/docs/01-app/01-getting-started/
 * 04-linking-and-navigating.md:343-398` rather than from memory.** `window.history.replaceState`
 * updates the address bar and syncs the router **without a server round trip and without a history
 * entry**, so the query follows the caret while the customer types and *Continuă* is still the only
 * thing that pushes. `router.replace` would re-run the page for every keystroke and can take the
 * caret with it — criterion 11's navigation spy is what catches the wrong mechanism.
 */
function useCanonicalQueryInTheAddressBar(canonicalQuery: string): void {
  useEffect(() => {
    window.history.replaceState(null, "", `?${canonicalQuery}`);
  }, [canonicalQuery]);
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
function canonicalRoomQuery(draft: RoomDraft): URLSearchParams {
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

/**
 * **What makes a render a *different* room to enter, and so a new form.** The draft is seeded from
 * the query once, when the step mounts: re-seeding it on every render would fight the caret, and
 * never re-seeding it would leave 1A's empty draft standing after *Continuă* navigates.
 *
 * The query the page hands over changes on a **navigation** and on nothing else — `replaceState`
 * rewrites the address bar without re-running the page — so this key moves exactly when a push, a
 * reload or the browser's Back gives the customer another room, which is ADR 0111 decision 3's
 * *"Back restores it, a reload keeps it"*. Tapping a chip or typing a digit leaves it alone.
 */
function roomEntryKey(shape: RoomShape, query: RoomSearchParams): string {
  const roomKeys = ["shape", ...requiredFieldsFor(shape), "direction"];
  return roomKeys.map((key) => singleValueIn(query[key]) ?? "").join("|");
}

/** The draft a URL arrives as: every field the shape asks for that the query already answers, shown
 *  in the customer's own notation, and the corner the query names or frame 1B's pre-selected left. */
function roomDraftFromQuery(
  shape: RoomShape,
  query: RoomSearchParams,
  locale: string,
): RoomDraft {
  const withLengths = requiredFieldsFor(shape).reduce(
    (draft, field) => withLengthFromQuery(draft, field, query[field], locale),
    createRoomDraft(shape),
  );
  const direction = singleValueIn(query.direction);
  return isCornerDirection(direction)
    ? withCornerDirection(withLengths, direction)
    : withLengths;
}

function withLengthFromQuery(
  draft: RoomDraft,
  field: RoomLengthField,
  value: RoomSearchParams[string],
  locale: string,
): RoomDraft {
  const parsed = parseMetresToMillimetres(singleValueIn(value) ?? "");
  return parsed.ok
    ? withStoredLength(draft, { field, millimetres: parsed.mm, locale })
    : draft;
}

/** A repeated key is not a value — the same rule `parseRoomUrlState` reads the query by, so the form
 *  and the parser cannot disagree about what `?wallA=3.6&wallA=4.2` means. */
function singleValueIn(value: RoomSearchParams[string]): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isCornerDirection(
  value: string | undefined,
): value is CornerDirection {
  return value === "left" || value === "right";
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

/** The shape the query already names, so a customer who goes back from the lengths finds the card
 *  they chose still chosen. 1A is the one sub-state that names none. */
function shapeAlreadyInTheUrl(state: RoomUrlState): RoomShape | undefined {
  if (state.substate === "1A") return undefined;
  if (state.substate === "1B") return state.shape;
  return state.input.shape;
}
