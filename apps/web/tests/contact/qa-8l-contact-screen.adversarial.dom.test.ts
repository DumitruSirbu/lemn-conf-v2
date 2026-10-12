// @vitest-environment happy-dom
//
// Wave 8L adversarial QA at the screen: the form's memory is mounted once per page (a second instance beside it would be
// a second, unguarded send, which is not supported), the limits are counted in code points and not in the UTF-16 units an
// input counts, and a value at the limit is carried into the request whole. The scene probe and the locale menu are
// stubs; nothing is answered.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookInstances = vi.hoisted(() => ({ created: 0 }));

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div"),
}));
vi.mock("@/contact/use-contact-submission", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/contact/use-contact-submission")>();
  return {
    ...original,
    useContactSubmission: (
      options: Parameters<typeof original.useContactSubmission>[0],
    ) => {
      // One increment per mounted instance, not per render: the initialiser of a state runs once per instance.
      useState(() => {
        hookInstances.created += 1;
        return hookInstances.created;
      });
      return original.useContactSubmission(options);
    },
  };
});

import {
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
} from "@lemnaria/configurator-domain";

import { CallbackContactScreen } from "@/contact/contact-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  changeStore,
  DESIGN_ID,
  editWithoutSaving,
  hydrateSavedDesign,
} from "./contact-submission-harness";
import {
  elementIn,
  fillWholeForm,
  inputNamed,
  leave,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  sentencesShown,
  typeInto,
  type MountedScreen,
  type RecordedTraffic,
} from "./contact-screen-harness";

/** MATHEMATICAL BOLD CAPITAL A: two UTF-16 units, one code point, and a letter the domain accepts in a name. */
const ASTRAL_LETTER = "\u{1D400}";
const TOO_LONG = MESSAGES.ro.contact.fieldErrors.TOO_LONG;

let screen: MountedScreen | undefined;
let traffic: RecordedTraffic;

beforeEach(() => {
  hookInstances.created = 0;
  traffic = recordTraffic();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
});

function mountCallback(): { container: HTMLElement; unmount: () => void } {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: MESSAGES.ro,
        timeZone: "Europe/Chisinau",
        children: createElement(CallbackContactScreen, { isSendable: true }),
      }),
    );
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function bodyOfTheOnlyRequest(): {
  contact: { name: string; locality: string };
} {
  expect(traffic.contactBodies).toHaveLength(1);
  return traffic.contactBodies[0] as {
    contact: { name: string; locality: string };
  };
}

describe("the form's memory is mounted once per page", () => {
  it("is one instance, one form, one call to action and one honeypot on a design's page", () => {
    screen = mountContactScreen();

    expect(hookInstances.created).toBe(1);
    expect(screen.container.querySelectorAll("form")).toHaveLength(1);
    expect(
      screen.container.querySelectorAll('[data-testid="contact-cta"]'),
    ).toHaveLength(1);
    expect(
      screen.container.querySelectorAll('input[name="reference_note"]'),
    ).toHaveLength(1);
  });

  it("is one instance, one form and one call to action on the callback page", () => {
    const callback = mountCallback();
    screen = callback;

    expect(hookInstances.created).toBe(1);
    expect(callback.container.querySelectorAll("form")).toHaveLength(1);
    expect(
      callback.container.querySelectorAll('[data-testid="contact-cta"]'),
    ).toHaveLength(1);
  });

  it("stays one instance across the sending state, a failed answer and the retry that follows", async () => {
    screen = mountContactScreen();
    fillWholeForm(screen.container);

    pressCallToAction(screen.container);
    await traffic.answerOldest({
      status: 503,
      body: { code: "CONTACT_UNAVAILABLE" },
    });
    act(() => {
      elementIn(
        screen?.container ?? document.body,
        '[data-testid="contact-retry"]',
        HTMLButtonElement,
      ).click();
    });

    expect(traffic.contactBodies).toHaveLength(2);
    expect(hookInstances.created).toBe(1);
  });
});

describe("a limit is counted in code points", () => {
  it.each([
    ["name", "name", CONTACT_NAME_MAX_LENGTH],
    ["locality", "locality", CONTACT_LOCALITY_MAX_LENGTH],
  ] as const)(
    "the %s field takes exactly its limit of astral letters, shows no error, and carries them whole into the request",
    (_label, field, limit) => {
      screen = mountContactScreen();
      const container = screen.container;
      fillWholeForm(container);
      const text = ASTRAL_LETTER.repeat(limit);
      expect(text.length).toBe(limit * 2);

      typeInto(inputNamed(container, field), text);
      leave(inputNamed(container, field));
      pressCallToAction(container);

      expect(sentencesShown(container)).toEqual([]);
      expect(bodyOfTheOnlyRequest().contact[field]).toBe(text);
    },
  );

  it.each([
    ["name", "name", CONTACT_NAME_MAX_LENGTH],
    ["locality", "locality", CONTACT_LOCALITY_MAX_LENGTH],
  ] as const)(
    "the %s field refuses one astral letter more with its own sentence, beside it, and sends nothing",
    (_label, field, limit) => {
      screen = mountContactScreen();
      const container = screen.container;
      fillWholeForm(container);
      typeInto(inputNamed(container, field), ASTRAL_LETTER.repeat(limit + 1));

      leave(inputNamed(container, field));

      expect(sentencesShown(container)).toEqual([TOO_LONG]);
      expect(inputNamed(container, field).getAttribute("aria-invalid")).toBe(
        "true",
      );
      pressCallToAction(container);
      expect(traffic.contactBodies).toEqual([]);
    },
  );

  it("counts a name of ninety-nine plain letters and one astral one as one hundred, and one more as a hundred and one", () => {
    screen = mountContactScreen();
    const container = screen.container;
    fillWholeForm(container);
    const atTheLimit = `${"a".repeat(CONTACT_NAME_MAX_LENGTH - 1)}${ASTRAL_LETTER}`;

    typeInto(inputNamed(container, "name"), atTheLimit);
    leave(inputNamed(container, "name"));
    expect(sentencesShown(container)).toEqual([]);

    typeInto(inputNamed(container, "name"), `${atTheLimit}a`);
    leave(inputNamed(container, "name"));
    expect(sentencesShown(container)).toEqual([TOO_LONG]);
  });

  it("does not count the blanks around a value at the limit", () => {
    screen = mountContactScreen();
    const container = screen.container;
    fillWholeForm(container);

    typeInto(
      inputNamed(container, "name"),
      `  ${ASTRAL_LETTER.repeat(CONTACT_NAME_MAX_LENGTH)}  `,
    );
    leave(inputNamed(container, "name"));

    expect(sentencesShown(container)).toEqual([]);
  });

  it("sets no maxlength on any input: the attribute counts UTF-16 units and would refuse a valid astral name early", () => {
    screen = mountContactScreen();

    const limited = [...screen.container.querySelectorAll("input")].filter(
      (input) => input.hasAttribute("maxlength"),
    );

    expect(limited).toEqual([]);
  });

  it("refuses a lone surrogate, which the request body could not carry as text, with the forbidden-character sentence", () => {
    screen = mountContactScreen();
    const container = screen.container;
    fillWholeForm(container);

    typeInto(inputNamed(container, "name"), "Ana\uD800");
    leave(inputNamed(container, "name"));

    expect(sentencesShown(container)).toEqual([
      MESSAGES.ro.contact.fieldErrors.FORBIDDEN_CHARACTER,
    ]);
    pressCallToAction(container);
    expect(traffic.contactBodies).toEqual([]);
  });
});

describe("the form with no design", () => {
  it("is not held by another design's unsaved edit that happens to be in the page's store (8L.10: it has no design behind it, so no wait on a save)", () => {
    // The store is the page's one, and outlives a client navigation: an edit still being saved there is about a design
    // this request does not name.
    const callback = mountCallback();
    screen = callback;
    hydrateSavedDesign();
    editWithoutSaving("an edit of a design this form does not send");
    fillWholeForm(callback.container);

    pressCallToAction(callback.container);

    expect(
      callback.container.querySelector('[data-testid="contact-save-wait"]'),
      "a sentence about saving an edit",
    ).toBeNull();
    expect(
      callback.container
        .querySelector('[data-testid="contact-cta"]')
        ?.getAttribute("aria-disabled"),
    ).toBeNull();
    expect(traffic.contactBodies).toHaveLength(1);
  });
});

describe("the design's form while its save is in conflict", () => {
  it("says the choice is made in the editor and draws a way there, as the review does for the same sentence", () => {
    screen = mountContactScreen();
    const container = screen.container;
    editWithoutSaving("an edit the server refused as a conflict");
    changeStore({ saveStatus: "conflict" });

    const sentence = elementIn(container, '[data-testid="contact-save-wait"]');
    const toTheEditor = [...container.querySelectorAll("a")].filter((anchor) =>
      new RegExp(`/d/${DESIGN_ID}(\\?.*)?$`).test(
        anchor.getAttribute("href") ?? "",
      ),
    );

    expect(sentence.textContent).toBe(MESSAGES.ro.reviewScreen.conflict);
    expect(
      toTheEditor,
      "the sentence sends the customer to the editor and the screen has no link to it",
    ).toHaveLength(1);
  });
});
