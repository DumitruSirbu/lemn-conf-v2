// @vitest-environment happy-dom
// The visitor's link in the editor's top bar draws one of two faces, which the stylesheet shows (`account.module.css`);
// this file holds what the markup owes it: the name a screen reader is told is the words whichever face is shown, the
// form the host asked for reaches the element the stylesheet reads it from, and a signed-in person is never offered the
// link. The probes the fit model measures from are the same two faces, equal when the control is the glyph.
import { createElement, createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountControl,
  AccountFormProbes,
  type SignInForm,
} from "@/account/session/account-control";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";

import roMessages from "../../../src/messages/ro.json";
import ruMessages from "../../../src/messages/ru.json";
import { flushPromises } from "../../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../../support/render-with-intl";

const SIGN_IN_FORMS: readonly SignInForm[] = [
  "text",
  "icon",
  "icon-below-desktop",
];
const SIGN_IN_WORDS = {
  ro: roMessages.accountControl.signIn,
  ru: ruMessages.accountControl.signIn,
} as const;

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function answerWith(session: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
}

function neverAnswer(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
}

const ANONYMOUS = { state: "anonymous" };
const CLIENT = {
  state: "signed-in",
  email: "ana@example.com",
  capabilities: ["design.read.own"],
};

async function mountControl(
  signInForm: SignInForm | undefined,
  locale: TestLocale = "ro",
): Promise<MountedScreen> {
  const props =
    signInForm === undefined
      ? { cellClassName: "cell" }
      : { cellClassName: "cell", signInForm };
  screen = mountInCatalogue(createElement(AccountControl, props), locale);
  await flushPromises(5);
  return screen;
}

const signInLinkIn = (page: MountedScreen): HTMLElement | undefined =>
  page.container.querySelector<HTMLElement>(
    '[data-testid="top-bar-account-sign-in"]',
  ) ?? undefined;

describe("a visitor's link", () => {
  it.each(
    (["ro", "ru"] as const).flatMap((locale) =>
      SIGN_IN_FORMS.map((form) => [locale, form] as const),
    ),
  )(
    "%s / %s: is named by the words, whichever face is shown",
    async (locale, form) => {
      answerWith(ANONYMOUS);
      const page = await mountControl(form, locale);

      const link = signInLinkIn(page);
      expect(link?.getAttribute("aria-label")).toBe(SIGN_IN_WORDS[locale]);
      expect(link?.getAttribute("href")).toBe(`/${locale}/account/login`);
    },
  );

  it.each(SIGN_IN_FORMS)(
    "carries the form the host asked for (%s) on the element the stylesheet reads it from",
    async (form) => {
      answerWith(ANONYMOUS);
      const page = await mountControl(form);

      expect(signInLinkIn(page)?.getAttribute("data-form")).toBe(form);
    },
  );

  it("has both faces in its markup, so the stylesheet alone decides which is shown", async () => {
    answerWith(ANONYMOUS);
    const page = await mountControl("icon-below-desktop");

    const link = signInLinkIn(page);
    const words = allIn(link ?? page.container, "span").filter(
      (face) => face.textContent === SIGN_IN_WORDS.ro,
    );
    const glyphs = allIn(link ?? page.container, "span").filter(
      (face) => face.getAttribute("aria-hidden") === "true",
    );
    expect(words).toHaveLength(1);
    expect(glyphs).toHaveLength(1);
  });

  it("is drawn with its words when the host asks for nothing", async () => {
    answerWith(ANONYMOUS);
    const page = await mountControl(undefined);

    expect(signInLinkIn(page)?.getAttribute("data-form")).toBe("text");
  });

  it("holds its place before the server has answered, in the form the host asked for and out of sight", async () => {
    neverAnswer();
    const page = await mountControl("icon");

    const stand = page.container.querySelector<HTMLElement>(
      '[data-testid="top-bar-account"] [data-form]',
    );
    expect(signInLinkIn(page)).toBeUndefined();
    expect(stand?.getAttribute("data-form")).toBe("icon");
    expect(stand?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(SIGN_IN_FORMS)(
    "is never drawn for a signed-in client, whatever form the host asks for (%s)",
    async (form) => {
      answerWith(CLIENT);
      const page = await mountControl(form);

      expect(signInLinkIn(page)).toBeUndefined();
      expect(
        page.container.querySelector('[data-testid="top-bar-account-trigger"]'),
      ).not.toBeNull();
    },
  );
});

describe("the probes the top bar's fit is measured from", () => {
  async function mountProbes(session: unknown): Promise<{
    readonly text: RefObject<HTMLSpanElement | null>;
    readonly icon: RefObject<HTMLSpanElement | null>;
  }> {
    answerWith(session);
    const text = createRef<HTMLSpanElement>();
    const icon = createRef<HTMLSpanElement>();
    screen = mountInCatalogue(
      createElement(
        "div",
        null,
        createElement(AccountControl, { cellClassName: "cell" }),
        createElement(AccountFormProbes, { textRef: text, iconRef: icon }),
      ),
    );
    await flushPromises(5);
    return { text, icon };
  }

  it("draws a visitor's two faces, the words in one and the glyph in the other", async () => {
    const probes = await mountProbes(ANONYMOUS);

    expect(probes.text.current?.getAttribute("data-form")).toBe("text");
    expect(probes.icon.current?.getAttribute("data-form")).toBe("icon");
  });

  it("draws a signed-in client's control as the glyph in both, so choosing between them returns nothing", async () => {
    const probes = await mountProbes(CLIENT);

    expect(probes.text.current?.getAttribute("data-form")).toBe("icon");
    expect(probes.icon.current?.getAttribute("data-form")).toBe("icon");
  });

  it("stands outside the cell and out of the accessibility tree", async () => {
    const probes = await mountProbes(ANONYMOUS);

    const cell = screen?.container.querySelector(
      '[data-testid="top-bar-account"]',
    );
    expect(cell?.contains(probes.text.current)).toBe(false);
    expect(probes.text.current?.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
