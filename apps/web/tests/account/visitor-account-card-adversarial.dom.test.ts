// @vitest-environment happy-dom
//
// **Lot 2 U15d (plan M8B Lot 2 section 14.2, U15-4), adversarial round: the card's showing across remounts, late
// answers and editors that must not arm it.**
//
// `visitor-account-card.dom.test.ts` holds the criterion's rows; this file holds what a row cannot say: the card
// through a sequence of screens (a language switch, a dismissal, a hand-over) and through an answer that arrives at
// the wrong moment. The session module and the Back record are the real ones; the session route is a stubbed `fetch`.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  refreshSession,
  resetAccountSessionForTests,
} from "@/account/session/use-account-session";
import { VisitorAccountCard } from "@/account/session/visitor-account-card";
import {
  forgetEditorOrigin,
  readStepOneAccountCardLatch,
  recordEditedEditorLeft,
  recordEditorOpenedFromStepOne,
  resetStepOneAccountCardLatchForTests,
} from "@/app/configurator/configure/back-guard";

import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const CARD = '[data-testid="visitor-account-card"]';
const CREATE_ACCOUNT = '[data-testid="visitor-account-card-create"]';
const NOT_NOW = '[data-testid="visitor-account-card-not-now"]';
const DESIGN_ID = "abcdefghijklmnopqrstu";
const OTHER_DESIGN_ID = "ABCDEFGHIJKLMNOPQRSTU";

const ANONYMOUS_SESSION = { state: "anonymous" };
const CLIENT_SESSION = {
  state: "signed-in",
  email: "ana@example.com",
  capabilities: ["design.read.own", "design.edit.own", "account.manage.own"],
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
  resetStepOneAccountCardLatchForTests();
  forgetEditorOrigin();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  forgetEditorOrigin();
});

function responseOf(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A session route that answers when the test says so: `fetch` is called as many times as the module asks. */
function sessionRouteTheTestAnswers(): {
  readonly answer: (body: unknown) => void;
  readonly requests: () => number;
} {
  const waiting: ((response: Response) => void)[] = [];
  const fetchStub = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        waiting.push(resolve);
      }),
  );
  vi.stubGlobal("fetch", fetchStub);
  return {
    answer: (body) => {
      waiting.shift()?.(responseOf(body));
    },
    requests: () => fetchStub.mock.calls.length,
  };
}

function sessionRouteAnswering(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(responseOf(body))),
  );
}

function leaveAnEditedEditor(designId = DESIGN_ID): void {
  recordEditorOpenedFromStepOne(designId);
  recordEditedEditorLeft({ designId, hasBeenEdited: true });
}

async function mountStepOne(locale: TestLocale = "ro"): Promise<void> {
  screen = mountInCatalogue(createElement(VisitorAccountCard), locale);
  await flushPromises(5);
}

async function switchLanguageTo(locale: TestLocale): Promise<void> {
  screen?.unmount();
  await mountStepOne(locale);
}

function isCardShown(): boolean {
  return screen?.container.querySelector(CARD) != null;
}

function pressNotNow(): void {
  click(requireIn(screen?.container ?? document.body, NOT_NOW));
}

describe("a dismissal outlives the screen it was made on", () => {
  it("stays dismissed through a language switch, in both directions", async () => {
    leaveAnEditedEditor();
    sessionRouteAnswering(ANONYMOUS_SESSION);
    await mountStepOne("ro");
    pressNotNow();

    await switchLanguageTo("ru");
    expect(isCardShown()).toBe(false);

    await switchLanguageTo("ro");
    expect(isCardShown()).toBe(false);
  });

  it("stays dismissed when another edited editor is left afterwards and Step 1 is mounted again", async () => {
    leaveAnEditedEditor();
    sessionRouteAnswering(ANONYMOUS_SESSION);
    await mountStepOne();
    pressNotNow();
    screen?.unmount();

    leaveAnEditedEditor(OTHER_DESIGN_ID);
    await mountStepOne();

    expect(isCardShown()).toBe(false);
  });

  it("is shown again by a remount that follows no dismissal, in the language now on screen (the owed card is kept)", async () => {
    leaveAnEditedEditor();
    sessionRouteAnswering(ANONYMOUS_SESSION);
    await mountStepOne("ro");
    expect(isCardShown()).toBe(true);

    await switchLanguageTo("ru");

    expect(screen?.container.querySelector(CREATE_ACCOUNT)?.textContent).toBe(
      ruMessages.visitorAccountCard.createAccount,
    );
    expect(readStepOneAccountCardLatch()).toBe("due");
  });
});

describe("repeated Back", () => {
  it("leaving the same edited editor over and over still shows one card", async () => {
    sessionRouteAnswering(ANONYMOUS_SESSION);
    recordEditorOpenedFromStepOne(DESIGN_ID);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
    }

    await mountStepOne();

    expect(screen?.container.querySelectorAll(CARD)).toHaveLength(1);
    expect(readStepOneAccountCardLatch()).toBe("due");
  });

  it("a later leave that owes nothing does not take back a card that is owed", async () => {
    sessionRouteAnswering(ANONYMOUS_SESSION);
    leaveAnEditedEditor();

    recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: false });
    recordEditedEditorLeft({ designId: OTHER_DESIGN_ID, hasBeenEdited: true });
    recordEditedEditorLeft({ designId: null, hasBeenEdited: true });
    await mountStepOne();

    expect(isCardShown()).toBe(true);
  });

  it("leaving after the dismissal never brings the card back", async () => {
    sessionRouteAnswering(ANONYMOUS_SESSION);
    leaveAnEditedEditor();
    await mountStepOne();
    pressNotNow();
    screen?.unmount();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
      leaveAnEditedEditor(OTHER_DESIGN_ID);
    }
    await mountStepOne();

    expect(isCardShown()).toBe(false);
  });
});

describe("an editor that must not arm the card", () => {
  it.each([
    [
      "one nothing was changed in",
      () => {
        recordEditorOpenedFromStepOne(DESIGN_ID);
        recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: false });
      },
    ],
    [
      "one reached by a link or a resume (Step 1 recorded no hand-over)",
      () => {
        recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
      },
    ],
    [
      "one whose origin was forgotten before the confirmation",
      () => {
        recordEditorOpenedFromStepOne(DESIGN_ID);
        forgetEditorOrigin();
        recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
      },
    ],
    [
      "the editor of another design than the one Step 1 handed over to",
      () => {
        recordEditorOpenedFromStepOne(DESIGN_ID);
        recordEditedEditorLeft({
          designId: OTHER_DESIGN_ID,
          hasBeenEdited: true,
        });
      },
    ],
    [
      "a screen with no design open",
      () => {
        recordEditorOpenedFromStepOne(DESIGN_ID);
        recordEditedEditorLeft({ designId: null, hasBeenEdited: true });
      },
    ],
    [
      "an editor whose hand-over has since been replaced by another's (a stale confirmation)",
      () => {
        recordEditorOpenedFromStepOne(DESIGN_ID);
        recordEditorOpenedFromStepOne(OTHER_DESIGN_ID);
        recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
      },
    ],
  ])(
    "shows nothing to a definite anonymous visitor after %s",
    async (_label, leave) => {
      sessionRouteAnswering(ANONYMOUS_SESSION);
      leave();

      await mountStepOne();

      expect(isCardShown()).toBe(false);
    },
  );
});

describe("a session answer that arrives late", () => {
  it("is the one request of the document: a screen remounted while it is out waits for the same answer, and shows in its language", async () => {
    leaveAnEditedEditor();
    const route = sessionRouteTheTestAnswers();
    await mountStepOne("ro");
    screen?.unmount();
    await mountStepOne("ru");
    expect(isCardShown()).toBe(false);

    route.answer(ANONYMOUS_SESSION);
    await flushPromises(5);

    expect(route.requests()).toBe(1);
    expect(screen?.container.querySelector(CREATE_ACCOUNT)?.textContent).toBe(
      ruMessages.visitorAccountCard.createAccount,
    );
  });

  it("does not show a card the visitor has handed over from while it was out: the hand-over spent it", async () => {
    leaveAnEditedEditor();
    const route = sessionRouteTheTestAnswers();
    await mountStepOne();

    recordEditorOpenedFromStepOne(OTHER_DESIGN_ID);
    route.answer(ANONYMOUS_SESSION);
    await flushPromises(5);

    expect(isCardShown()).toBe(false);
    expect(readStepOneAccountCardLatch()).toBe("offered");
  });

  it("arrives after the screen is gone: nothing is logged, and the screen mounted next shows the card at once", async () => {
    leaveAnEditedEditor();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const route = sessionRouteTheTestAnswers();
    await mountStepOne();
    screen?.unmount();

    route.answer(ANONYMOUS_SESSION);
    await flushPromises(5);
    await mountStepOne();

    expect(errors).not.toHaveBeenCalled();
    expect(isCardShown()).toBe(true);
    expect(route.requests()).toBe(1);
  });

  it("says signed-in after the card was on show (a sign-in in another tab, a page restored): the card goes", async () => {
    leaveAnEditedEditor();
    sessionRouteAnswering(ANONYMOUS_SESSION);
    await mountStepOne();
    expect(isCardShown()).toBe(true);

    sessionRouteAnswering(CLIENT_SESSION);
    refreshSession();
    await flushPromises(5);

    expect(isCardShown()).toBe(false);
  });
});
