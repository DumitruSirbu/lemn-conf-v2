// @vitest-environment happy-dom
//
// **Lot 2 U15d (plan M8B Lot 2 section 14.2, U15-4 and U15-5): the card Step 1 shows once to a visitor who has just left
// an edited editor.**
//
// The session module and the Back confirmation's record are the real ones; the session route is a stubbed `fetch`, so
// "definite" is the module's own flag. Every row of the criterion's *must not render* list has a case, and each case that
// can be told from the card's own condition (the session, the person's sign-out, the latch) is mutation-proven.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  markSignedOutByPerson,
  resetAccountSessionForTests,
} from "@/account/session/use-account-session";
import { VisitorAccountCard } from "@/account/session/visitor-account-card";
import {
  readStepOneAccountCardLatch,
  recordEditedEditorLeft,
  recordEditorOpenedFromStepOne,
  resetStepOneAccountCardLatchForTests,
} from "@/app/configurator/configure/back-guard";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
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
const STAFF_SESSION = {
  state: "signed-in",
  email: "staff@example.com",
  capabilities: ["contact.read", "account.manage.own"],
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
  resetStepOneAccountCardLatchForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function answerWith(body: unknown): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
}

/** The editor reached from Step 1, changed, and left by confirming: the card is owed. */
function leaveAnEditedEditor(): void {
  recordEditorOpenedFromStepOne(DESIGN_ID);
  recordEditedEditorLeft({ designId: DESIGN_ID, hasBeenEdited: true });
}

async function mountCard(
  sessionRoute: () => Promise<Response>,
  locale: TestLocale = "ro",
): Promise<void> {
  vi.stubGlobal("fetch", vi.fn(sessionRoute));
  screen = mountInCatalogue(createElement(VisitorAccountCard), locale);
  await flushPromises(5);
}

function isCardShown(): boolean {
  return screen?.container.querySelector(CARD) != null;
}

describe("when the card is shown", () => {
  it.each(LOCALES)(
    "%s: to a definite anonymous visitor who has left an edited editor, in the catalogue's words",
    async (locale) => {
      leaveAnEditedEditor();

      await mountCard(answerWith(ANONYMOUS_SESSION), locale);

      const card = screen?.container.querySelector(CARD);
      const { title, body, createAccount, notNow } =
        CATALOGUES[locale].visitorAccountCard;
      expect(card?.textContent).toContain(title);
      expect(card?.textContent).toContain(body);
      expect(card?.querySelector(CREATE_ACCOUNT)?.textContent).toBe(
        createAccount,
      );
      expect(card?.querySelector(NOT_NOW)?.textContent).toBe(notNow);
    },
  );

  it("appears when the server's answer arrives, not before", async () => {
    leaveAnEditedEditor();
    let answer: (response: Response) => void = () => undefined;
    await mountCard(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    expect(isCardShown()).toBe(false);

    answer(
      new Response(JSON.stringify(ANONYMOUS_SESSION), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await flushPromises(5);

    expect(isCardShown()).toBe(true);
  });

  it.each(LOCALES)(
    "%s: its way in is a plain link to the register page in the same language, with no return path",
    async (locale) => {
      leaveAnEditedEditor();
      await mountCard(answerWith(ANONYMOUS_SESSION), locale);

      const link = screen?.container.querySelector(CREATE_ACCOUNT);

      expect(link?.tagName).toBe("A");
      expect(link?.getAttribute("href")).toBe(`/${locale}/account/register`);
    },
  );
});

describe("when the card is not shown", () => {
  it.each([
    ["a signed-in client", answerWith(CLIENT_SESSION)],
    ["a signed-in staff member", answerWith(STAFF_SESSION)],
    [
      "a session not yet answered",
      () => new Promise<Response>(() => undefined),
    ],
    [
      "a failed read (503), which reads as anonymous without being an answer",
      () => Promise.resolve(new Response("{}", { status: 503 })),
    ],
    ["a request that fails", () => Promise.reject(new Error("offline"))],
  ])("to %s", async (_label, sessionRoute) => {
    leaveAnEditedEditor();

    await mountCard(sessionRoute);

    expect(isCardShown()).toBe(false);
  });

  it("after the person signed out on this document, because the kitchen they left is already their account's", async () => {
    leaveAnEditedEditor();
    await mountCard(answerWith(CLIENT_SESSION));

    markSignedOutByPerson();
    await flushPromises(3);

    expect(isCardShown()).toBe(false);
  });

  it("on a first arrival at Step 1, when no edited editor has been left", async () => {
    await mountCard(answerWith(ANONYMOUS_SESSION));

    expect(isCardShown()).toBe(false);
  });
});

describe("the card's one showing", () => {
  it("goes at 'Nu acum' and is not owed again, however often an edited editor is left after it", async () => {
    leaveAnEditedEditor();
    await mountCard(answerWith(ANONYMOUS_SESSION));

    click(requireIn(screen?.container ?? document.body, NOT_NOW));

    expect(isCardShown()).toBe(false);
    expect(readStepOneAccountCardLatch()).toBe("offered");
    leaveAnEditedEditor();
    expect(readStepOneAccountCardLatch()).toBe("offered");
  });

  it("survives a language switch, which remounts the screen, until it is answered", async () => {
    leaveAnEditedEditor();
    await mountCard(answerWith(ANONYMOUS_SESSION), "ro");
    screen?.unmount();

    screen = mountInCatalogue(createElement(VisitorAccountCard), "ru");
    await flushPromises(5);

    expect(screen.container.querySelector(CREATE_ACCOUNT)?.textContent).toBe(
      ruMessages.visitorAccountCard.createAccount,
    );
  });

  it("is spent when Step 1 hands over to an editor, so a return to Step 1 does not show it a second time", async () => {
    leaveAnEditedEditor();
    await mountCard(answerWith(ANONYMOUS_SESSION));
    screen?.unmount();

    recordEditorOpenedFromStepOne(OTHER_DESIGN_ID);
    recordEditedEditorLeft({
      designId: OTHER_DESIGN_ID,
      hasBeenEdited: true,
    });
    screen = mountInCatalogue(createElement(VisitorAccountCard));
    await flushPromises(5);

    expect(isCardShown()).toBe(false);
  });
});

describe("a card that asks nothing of the visitor", () => {
  it("is a labelled region, not a dialog: no aria-modal, no inert, and nothing takes focus", async () => {
    leaveAnEditedEditor();
    const outsideControl = document.createElement("button");
    document.body.append(outsideControl);
    outsideControl.focus();

    await mountCard(answerWith(ANONYMOUS_SESSION));

    const card = screen?.container.querySelector(CARD);
    expect(card?.tagName).toBe("SECTION");
    expect(card?.getAttribute("aria-labelledby")).not.toBeNull();
    expect(document.querySelector("[aria-modal]")).toBeNull();
    expect(
      document.querySelector("[role=dialog], [role=alertdialog]"),
    ).toBeNull();
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.activeElement).toBe(outsideControl);
  });

  it("writes no cookie, localStorage or sessionStorage entry, showing or dismissed", async () => {
    const cookieWrites = vi.spyOn(document, "cookie", "set");
    const storageWrites = vi.spyOn(Storage.prototype, "setItem");
    leaveAnEditedEditor();
    await mountCard(answerWith(ANONYMOUS_SESSION));

    click(requireIn(screen?.container ?? document.body, NOT_NOW));

    expect(cookieWrites).not.toHaveBeenCalled();
    expect(storageWrites).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("has exactly two controls, a link and a button, and no other offer (no list, no keep-kitchen control)", async () => {
    leaveAnEditedEditor();
    await mountCard(answerWith(ANONYMOUS_SESSION));

    const controls = allIn(
      screen?.container ?? document.body,
      "a, button, input, select, textarea",
    );

    expect(controls.map((control) => control.tagName)).toEqual(["A", "BUTTON"]);
  });
});

/* eslint-disable no-restricted-syntax -- 6B-j allow-list: negative claims about the card's wording (what it must not say, U15-5) and the two words that make its one positive claim, asserted on the catalogue's leaves; no leaf can supply a sentence the catalogue must not hold. The exact Romanian is pinned by the approved copy lock. */
describe("what the card says", () => {
  const NAMES_AN_ACCOUNT_AS_THE_KEEPER =
    /salvat[ăa]? în cont|сохранен[аы]? в аккаунте/i;

  it.each(LOCALES)(
    "%s: the kitchen is kept in this browser and can be attached to an account, and is not said to be saved in one",
    (locale) => {
      const { title, body } = CATALOGUES[locale].visitorAccountCard;
      const inThisBrowser =
        locale === "ro" ? /în acest browser/ : /в этом браузере/;
      const attach = locale === "ro" ? /atașa/ : /прикрепить/;

      expect(body).toMatch(inThisBrowser);
      expect(body).toMatch(attach);
      expect(`${title} ${body}`).not.toMatch(NAMES_AN_ACCOUNT_AS_THE_KEEPER);
    },
  );

  it.each(LOCALES)(
    "%s: it never offers a list of kitchens to a visitor, never speaks of a loss and offers no keep-kitchen control",
    (locale) => {
      const everyLeaf = Object.values(
        CATALOGUES[locale].visitorAccountCard,
      ).join(" ");

      expect(everyLeaf).not.toMatch(/Bucătăriile mele|Мои кухни/i);
      expect(everyLeaf).not.toMatch(/pierd|потер/i);
      expect(everyLeaf).not.toMatch(/Nu o păstra|Salvează|Не сохранять/i);
    },
  );
});
/* eslint-enable no-restricted-syntax */
