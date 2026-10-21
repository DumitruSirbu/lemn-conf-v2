// @vitest-environment happy-dom
//
// Making a kitchen its client hid visible again (Lot 3 frames S3D and S3E), in Romanian and in Russian: the banner and its
// button, the question that opens on "cancel" and is not red, how it is left (cancel, Escape, the act), what a request
// out locks, and what each answer does. The server is the project's stand-in for `fetch`; the words are the shipped
// catalogue's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStaffSessionExpiry } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  byWords,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import {
  ONE_REFUSAL,
  NO_CONTENT,
  UNHIDE_ADDRESS,
  conflict,
  pressKey,
  readsOf,
  routeKitchen,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  type RecordedRequest,
} from "../support/staff-kitchens-wire";

import {
  setUpScreenHarness,
  type KitchenAnswer,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const A_DAY_MS = 24 * 60 * 60 * 1000;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

type UnhideRoute = (request: RecordedRequest) => KitchenAnswer;

function hiddenKitchen(): Record<string, unknown> {
  return wireKitchen({ kitchen: { isHidden: true } });
}

function serve(
  unhide: UnhideRoute,
  rereads: () => KitchenAnswer = () => ({ body: wireKitchen() }),
): void {
  let reads = 0;
  harness.answers(
    routeKitchen({
      read: () => {
        reads += 1;
        return reads === 1 ? { body: hiddenKitchen() } : rereads();
      },
      unhide,
    }),
  );
}

function banner(): HTMLElement {
  return requireIn(
    harness.container(),
    '[data-testid="staff-kitchen-hidden-banner"]',
  );
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="alertdialog"]');
}

function theDialog(): HTMLElement {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
}

describe.each(LOCALES)("making a hidden kitchen visible in %s", (locale) => {
  const copy = CATALOGUES[locale].staffActions;

  function openerButton(): HTMLButtonElement {
    return byWords<HTMLButtonElement>(banner(), "button", copy.unhideAction);
  }

  function cancelButton(): HTMLButtonElement {
    return byWords<HTMLButtonElement>(theDialog(), "button", copy.unhideCancel);
  }

  function confirmButton(): HTMLButtonElement {
    const found = allIn<HTMLButtonElement>(theDialog(), "button").find(
      (button) =>
        button.textContent === copy.unhideConfirm ||
        button.textContent === copy.unhideBusy,
    );
    if (found === undefined) throw new Error("no confirmation");
    return found;
  }

  async function open(): Promise<void> {
    click(openerButton());
    await harness.settle();
  }

  async function confirm(): Promise<void> {
    click(confirmButton());
    await harness.settle();
  }

  describe("the banner", () => {
    it("carries the button, in the banner's own status region", async () => {
      serve(() => NO_CONTENT);
      await harness.mount({ locale });

      expect(banner().getAttribute("role")).toBe("status");
      expect(openerButton().getAttribute("type")).toBe("button");
      expect(openerButton().getAttribute("aria-haspopup")).toBe("dialog");
    });

    it("is not drawn for a kitchen its client has not hidden", async () => {
      harness.answers(routeKitchen({ read: () => ({ body: wireKitchen() }) }));
      await harness.mount({ locale });

      expect(
        allIn(
          harness.container(),
          '[data-testid="staff-kitchen-hidden-banner"]',
        ),
      ).toHaveLength(0);
      expect(allIn(harness.container(), "button")).not.toContain(undefined);
      expect(harness.container().textContent).not.toContain(copy.unhideAction);
    });
  });

  describe("the question (frame S3E)", () => {
    beforeEach(async () => {
      serve(() => NO_CONTENT);
      await harness.mount({ locale });
      await open();
    });

    it("is an alert dialog with its question, its consequence and the note on the share link", () => {
      const asked = theDialog();

      expect(asked.getAttribute("aria-modal")).toBe("true");
      expect(requireIn(asked, "h2").textContent).toBe(copy.unhideTitle);
      expect(asked.textContent).toContain(copy.unhideBody);
      expect(asked.textContent).toContain(copy.unhideShareNote);
      const described = (asked.getAttribute("aria-describedby") ?? "").split(
        " ",
      );
      expect(described).toHaveLength(2);
      for (const id of described) {
        expect(asked.querySelector(`[id="${id}"]`)).not.toBeNull();
      }
    });

    it("is drawn into the frame's main, so the rest of the page goes inert", () => {
      const main = requireIn(harness.container(), "main");

      expect(theDialog().closest("main")).toBe(main);
      const bands = [...main.children].filter(
        (band) => !band.contains(theDialog()),
      );
      expect(bands.length).toBeGreaterThan(0);
      for (const band of bands) expect(band.hasAttribute("inert")).toBe(true);
    });

    it("opens on 'cancel', and its confirmation is the primary button and not the destructive one", () => {
      expect(document.activeElement).toBe(cancelButton());
      expect(confirmButton().className).toContain("dialogPrimary");
      expect(confirmButton().className).not.toContain("dialogDestructive");
    });

    it("keeps Tab inside: from 'cancel' to the confirmation and back", () => {
      pressKey(cancelButton(), "Tab");
      expect(document.activeElement).toBe(confirmButton());

      pressKey(confirmButton(), "Tab", true);
      expect(document.activeElement).toBe(cancelButton());
    });

    it("closes on 'cancel' with no request, and gives focus back to the button that opened it", async () => {
      click(cancelButton());
      await harness.settle();

      expect(dialog()).toBeNull();
      expect(writesOf(harness.server)).toHaveLength(0);
      expect(document.activeElement).toBe(openerButton());
      expect(
        allIn(
          harness.container(),
          '[data-testid="staff-kitchen-hidden-banner"]',
        ),
      ).toHaveLength(1);
    });

    it("closes on Escape with no request, and gives focus back to the button that opened it", async () => {
      pressKey(document, "Escape");
      await harness.settle();

      expect(dialog()).toBeNull();
      expect(writesOf(harness.server)).toHaveLength(0);
      expect(document.activeElement).toBe(openerButton());
    });

    it("gives focus back to the button too when the browser had focused it on the press", async () => {
      pressKey(document, "Escape");
      await harness.settle();
      openerButton().focus();
      click(openerButton());
      await harness.settle();

      click(cancelButton());
      await harness.settle();

      expect(document.activeElement).toBe(openerButton());
    });

    it("can be opened again after it was closed", async () => {
      pressKey(document, "Escape");
      await harness.settle();

      await open();

      expect(dialog()).not.toBeNull();
    });
  });

  describe("the act", () => {
    it("sends one POST to the kitchen's unhide route, and nothing for a second press while it is out", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      await open();

      click(confirmButton());
      click(confirmButton());
      await harness.settle();

      const writes = writesOf(harness.server);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.url.pathname).toBe(UNHIDE_ADDRESS);
      expect(writes[0]?.init.method).toBe("POST");
    });

    it("locks the dialog while the request is out: busy, and neither Escape, 'cancel' nor the scrim leave it", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      await open();
      const button = confirmButton();

      click(button);
      await harness.settle();

      expect(confirmButton()).toBe(button);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.textContent).toBe(copy.unhideBusy);
      pressKey(document, "Escape");
      click(cancelButton());
      click(
        requireIn(document.body, '[aria-hidden="true"][class*="dialogScrim"]'),
      );
      await harness.settle();

      expect(dialog()).not.toBeNull();
      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it("closes the dialog on a 204, takes the banner away, says the kitchen is visible, and does not read the kitchen again", async () => {
      serve(() => NO_CONTENT);
      await harness.mount({ locale });
      await open();

      await confirm();

      expect(dialog()).toBeNull();
      expect(
        allIn(
          harness.container(),
          '[data-testid="staff-kitchen-hidden-banner"]',
        ),
      ).toHaveLength(0);
      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-unhide-announcement"]',
        ).textContent,
      ).toBe(copy.unhideDone);
      expect(readsOf(harness.server)).toHaveLength(1);
      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it("gives focus to the page's heading when the button it came from is gone", async () => {
      serve(() => NO_CONTENT);
      await harness.mount({ locale });
      await open();

      await confirm();

      expect(document.activeElement).toBe(requireIn(harness.container(), "h1"));
    });

    it("keeps the rest of the page where it was: the kitchen, the notes, the status", async () => {
      serve(() => NO_CONTENT);
      await harness.mount({ locale });
      const profile = requireIn(
        harness.container(),
        '[data-testid="staff-kitchen-profile"]',
      );
      await open();

      await confirm();

      expect(
        requireIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
      ).toBe(profile);
    });
  });

  describe("an answer that says the kitchen is not as the page shows it", () => {
    it("tells a 409 not-hidden: the dialog closes, the kitchen is read once behind the page, and the page says it was not hidden", async () => {
      serve(() => conflict("not-hidden"));
      await harness.mount({ locale });
      await open();

      await confirm();
      await harness.pass(A_DAY_MS);

      expect(dialog()).toBeNull();
      expect(readsOf(harness.server)).toHaveLength(2);
      expect(
        allIn(
          harness.container(),
          '[data-testid="staff-kitchen-hidden-banner"]',
        ),
      ).toHaveLength(0);
      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-unhide-announcement"]',
        ).textContent,
      ).toBe(copy.unhideNotHidden);
      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it("tells the one refusal: the dialog closes and the kitchen is read, and the page tells it is not available", async () => {
      serve(
        () => ONE_REFUSAL,
        () => ONE_REFUSAL,
      );
      await harness.mount({ locale });
      await open();

      await confirm();

      expect(dialog()).toBeNull();
      expect(readsOf(harness.server)).toHaveLength(2);
      expect(
        allIn(harness.container(), '[data-testid="staff-kitchen-not-found"]'),
      ).toHaveLength(1);
    });
  });

  describe("an answer that is not the act", () => {
    it.each([
      ["a 503", UNAVAILABLE_ANSWER],
      ["no connection", "offline"],
      ["a 409 that is no word of this route", conflict("not-sent")],
      ["a 500", { status: 500 }],
    ] as const)(
      "keeps the dialog open with the failure after %s, and sends nothing more by itself",
      async (_, answer) => {
        serve(() => answer);
        await harness.mount({ locale });
        await open();

        await confirm();
        await harness.pass(A_DAY_MS);

        expect(dialog()).not.toBeNull();
        expect(requireIn(theDialog(), '[role="alert"]').textContent).toContain(
          CATALOGUES[locale].accountForm.unavailableTitle,
        );
        expect(writesOf(harness.server)).toHaveLength(1);
        expect(readsOf(harness.server)).toHaveLength(1);
        expect(
          allIn(
            harness.container(),
            '[data-testid="staff-kitchen-hidden-banner"]',
          ),
        ).toHaveLength(1);
      },
    );

    it("lets the person press again after a failure, and then makes the kitchen visible once", async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1 ? UNAVAILABLE_ANSWER : NO_CONTENT;
      });
      await harness.mount({ locale });
      await open();
      await confirm();

      await confirm();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(dialog()).toBeNull();
    });

    it("tells a 403 as a right the account lacks, in the dialog", async () => {
      serve(() => FORBIDDEN_ANSWER);
      await harness.mount({ locale });
      await open();

      await confirm();

      expect(dialog()).not.toBeNull();
      expect(requireIn(theDialog(), '[role="alert"]').textContent).toContain(
        copy.unhideForbiddenBody,
      );
      expect(getStaffSessionExpiry()).toBeUndefined();
    });

    it("holds a 429 as a warning in the dialog, sends nothing before the wait is over, and one request after it", async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1 ? RATE_LIMITED_ANSWER(30) : NO_CONTENT;
      });
      await harness.mount({ locale });
      await open();
      await confirm();
      expect(requireIn(theDialog(), '[data-tone="warning"]')).not.toBeNull();

      await confirm();
      await harness.pass(20_000);
      await confirm();
      expect(writesOf(harness.server)).toHaveLength(1);

      await harness.pass(11_000);
      await confirm();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(dialog()).toBeNull();
    });

    it("shows the warning again when the dialog is closed and opened within the wait, and wakes at its end without sending", async () => {
      serve(() => RATE_LIMITED_ANSWER(30));
      await harness.mount({ locale });
      await open();
      await confirm();
      click(cancelButton());
      await harness.settle();

      await open();

      expect(requireIn(theDialog(), '[data-tone="warning"]')).not.toBeNull();
      await confirm();
      expect(writesOf(harness.server)).toHaveLength(1);
      await harness.pass(31_000);
      await harness.pass(A_DAY_MS);
      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it("draws the session sheet for a 401, leaves the dialog open under it, and navigates nowhere", async () => {
      serve(() => UNAUTHENTICATED_ANSWER);
      await harness.mount({ locale });
      await open();

      await confirm();

      expect(
        allIn(harness.container(), '[data-testid="staff-session-sheet"]'),
      ).toHaveLength(1);
      expect(dialog()).not.toBeNull();
      expect(harness.assigned).toEqual([]);
      expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    });
  });
});
