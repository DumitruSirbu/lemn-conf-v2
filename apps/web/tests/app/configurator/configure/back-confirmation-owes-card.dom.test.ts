// @vitest-environment happy-dom
//
// **Lot 2 U15d (plan M8B Lot 2 section 14.2, U15-4 condition 2): confirming Back owes Step 1 the visitor's card only
// from an edited editor that was reached from Step 1.**
//
// Both ways out of the editor, the back links and the browser's Back, end in `BackConfirmationDialog`'s *Confirm*, so
// this is the one place the record is written. The link's question asks on every click, an unedited editor and one reached
// by a link or a resume included, so the gate is the record's, not the dialog's.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { BackConfirmationDialog } from "@/app/configurator/configure/back-confirmation";
import {
  forgetEditorOrigin,
  readStepOneAccountCardLatch,
  recordEditorOpenedFromStepOne,
  resetStepOneAccountCardLatchForTests,
  type StepOneAccountCardLatch,
} from "@/app/configurator/configure/back-guard";
import { useConfiguratorStore } from "@/store/configurator-store";

import { flushPromises } from "../../../support/render-hook";
import {
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../../../support/render-with-intl";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const OTHER_DESIGN_ID = "ABCDEFGHIJKLMNOPQRSTU";
const CONFIRM = '[data-testid="back-confirm-confirm"]';
const STAY = '[data-testid="back-confirm-confirm-back"]';

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  resetAccountSessionForTests();
  resetStepOneAccountCardLatchForTests();
  forgetEditorOrigin();
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  forgetEditorOrigin();
});

async function pressOnTheDialog(
  selector: string,
  onConfirm: () => void = () => undefined,
): Promise<void> {
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(BackConfirmationDialog, {
        onConfirm,
        onStay: () => undefined,
      }),
    ),
  );
  await flushPromises(3);
  click(requireIn(screen.container, selector));
}

function theEditorHolds(facts: {
  readonly designId: string | null;
  readonly hasBeenEdited: boolean;
}): void {
  useConfiguratorStore.setState(facts);
}

describe("confirming Back", () => {
  it("owes the card from an edited editor that Step 1 handed over to", async () => {
    recordEditorOpenedFromStepOne(DESIGN_ID);
    theEditorHolds({ designId: DESIGN_ID, hasBeenEdited: true });

    await pressOnTheDialog(CONFIRM);

    expect(readStepOneAccountCardLatch()).toBe("due");
  });

  it.each<
    [
      string,
      { designId: string | null; hasBeenEdited: boolean },
      string | undefined,
    ]
  >([
    [
      "an editor nothing was changed in",
      { designId: DESIGN_ID, hasBeenEdited: false },
      DESIGN_ID,
    ],
    [
      "an editor not reached from Step 1 (a link or a resume)",
      { designId: DESIGN_ID, hasBeenEdited: true },
      undefined,
    ],
    [
      "an editor of another design than the one Step 1 handed over to",
      { designId: DESIGN_ID, hasBeenEdited: true },
      OTHER_DESIGN_ID,
    ],
    [
      "a screen with no design open",
      { designId: null, hasBeenEdited: true },
      DESIGN_ID,
    ],
  ])("owes nothing from %s", async (_label, editor, handedOverTo) => {
    if (handedOverTo !== undefined) recordEditorOpenedFromStepOne(handedOverTo);
    theEditorHolds(editor);

    await pressOnTheDialog(CONFIRM);

    expect(readStepOneAccountCardLatch()).toBe("none");
  });

  it("owes nothing when the customer stays", async () => {
    recordEditorOpenedFromStepOne(DESIGN_ID);
    theEditorHolds({ designId: DESIGN_ID, hasBeenEdited: true });

    await pressOnTheDialog(STAY);

    expect(readStepOneAccountCardLatch()).toBe("none");
  });

  it("still leaves, and records the debt before it does", async () => {
    recordEditorOpenedFromStepOne(DESIGN_ID);
    theEditorHolds({ designId: DESIGN_ID, hasBeenEdited: true });
    const latchWhenLeaving: StepOneAccountCardLatch[] = [];

    await pressOnTheDialog(CONFIRM, () => {
      latchWhenLeaving.push(readStepOneAccountCardLatch());
    });

    expect(latchWhenLeaving).toEqual(["due"]);
  });

  it("owes the card once: a second edited editor left after it was offered owes nothing", async () => {
    recordEditorOpenedFromStepOne(DESIGN_ID);
    theEditorHolds({ designId: DESIGN_ID, hasBeenEdited: true });
    await pressOnTheDialog(CONFIRM);
    recordEditorOpenedFromStepOne(OTHER_DESIGN_ID);
    theEditorHolds({ designId: OTHER_DESIGN_ID, hasBeenEdited: true });
    screen?.unmount();

    await pressOnTheDialog(CONFIRM);

    expect(readStepOneAccountCardLatch()).toBe("offered");
  });
});
