// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4: what a `429` wait does to the three staff writes when the person goes on typing or
// choosing during it, and what the staff session store does when the page that raised it is gone. The developer's suites
// press the button during the wait; these touch the field and the select first, which resets the feedback the button reads.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStaffSessionExpiry,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import {
  allIn,
  byWords,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import {
  chooseOption,
  noteCreated,
  routeKitchen,
  statusSaved,
  typeIntoTextarea,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
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

const LOCALE: TestLocale = "ro";
const WAIT_SECONDS = 30;
const TYPED = "Clientul vrea fronturi din nuc.";

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function notes(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-notes"]');
}

function field(): HTMLTextAreaElement {
  return requireIn<HTMLTextAreaElement>(notes(), "textarea");
}

function noteButton(): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(notes(), 'button[type="submit"]');
}

function statusControl(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-status-control"]');
}

function statusButton(): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(statusControl(), "button");
}

function serve(routes: {
  readonly note?: () => KitchenAnswer;
  readonly status?: () => KitchenAnswer;
  readonly kitchen?: Record<string, unknown>;
}): void {
  harness.answers(
    routeKitchen({
      read: () => ({ body: routes.kitchen ?? wireKitchen() }),
      ...(routes.note === undefined ? {} : { note: routes.note }),
      ...(routes.status === undefined ? {} : { status: routes.status }),
    }),
  );
}

describe("a note while the wait of a 429 runs", () => {
  it("keeps the button off for the whole wait when the person edits the text during it", async () => {
    let attempt = 0;
    serve({
      note: () => {
        attempt += 1;
        return attempt === 1
          ? RATE_LIMITED_ANSWER(WAIT_SECONDS)
          : noteCreated({ text: TYPED });
      },
    });
    await harness.mount({ locale: LOCALE });
    typeIntoTextarea(field(), TYPED);
    click(noteButton());
    await harness.settle();
    expect(noteButton().getAttribute("aria-disabled")).toBe("true");

    typeIntoTextarea(field(), `${TYPED} Si apoi.`);

    expect(noteButton().getAttribute("aria-disabled")).toBe("true");
    await harness.pass(WAIT_SECONDS * 1000 + 1000);
    expect(noteButton().getAttribute("aria-disabled")).toBeNull();
  });
});

describe("a status while the wait of a 429 runs", () => {
  it("keeps the button off for the whole wait when the person chooses another status during it", async () => {
    let attempt = 0;
    serve({
      status: () => {
        attempt += 1;
        return attempt === 1
          ? RATE_LIMITED_ANSWER(WAIT_SECONDS)
          : statusSaved("contacted");
      },
    });
    await harness.mount({ locale: LOCALE });
    const select = (): HTMLSelectElement =>
      requireIn<HTMLSelectElement>(statusControl(), "select");
    chooseOption(select(), "contacted");
    click(statusButton());
    await harness.settle();
    expect(statusButton().getAttribute("aria-disabled")).toBe("true");

    chooseOption(select(), "closed");

    expect(statusButton().getAttribute("aria-disabled")).toBe("true");
    await harness.pass(WAIT_SECONDS * 1000 + 1000);
    expect(statusButton().getAttribute("aria-disabled")).toBeNull();
  });
});

describe("the wait of a 429, in each form its Retry-After is told", () => {
  it.each([
    ["a countdown", 30],
    ["whole minutes", 900],
    ["a clock time", 7200],
  ])(
    "holds a note off for the whole wait told as %s, sends nothing when it ends, and one request for the press after it",
    async (_, seconds) => {
      let attempt = 0;
      serve({
        note: () => {
          attempt += 1;
          return attempt === 1
            ? RATE_LIMITED_ANSWER(seconds)
            : noteCreated({ text: TYPED });
        },
      });
      await harness.mount({ locale: LOCALE });
      typeIntoTextarea(field(), TYPED);
      click(noteButton());
      await harness.settle();
      const waitMs = seconds * 1000;

      await harness.pass(waitMs - 2000);
      click(noteButton());
      await harness.settle();
      expect(noteButton().getAttribute("aria-disabled")).toBe("true");
      expect(writesOf(harness.server)).toHaveLength(1);

      await harness.pass(4000);
      expect(noteButton().getAttribute("aria-disabled")).toBeNull();
      expect(writesOf(harness.server)).toHaveLength(1);
      click(noteButton());
      await harness.settle();
      expect(writesOf(harness.server)).toHaveLength(2);
    },
  );
});

describe("an unhide whose request was limited", () => {
  it("does not let a press within the wait, after the dialog was closed and opened again, pass without a word", async () => {
    harness.answers(
      routeKitchen({
        read: () => ({ body: wireKitchen({ kitchen: { isHidden: true } }) }),
        unhide: () => RATE_LIMITED_ANSWER(WAIT_SECONDS),
      }),
    );
    await harness.mount({ locale: LOCALE });
    const opener = requireIn(
      harness.container(),
      '[data-testid="staff-kitchen-hidden-banner"] > button',
    );
    const dialog = (): HTMLElement =>
      requireIn(document.body, '[role="alertdialog"]');
    const button = (words: string): HTMLElement =>
      byWords(dialog(), "button", words);
    const { unhideConfirm, unhideCancel } = roMessages.staffActions;
    click(opener);
    await harness.settle();
    click(button(unhideConfirm));
    await harness.settle();
    click(button(unhideCancel));
    await harness.settle();
    click(opener);
    await harness.settle();

    click(button(unhideConfirm));
    await harness.settle();

    expect(writesOf(harness.server)).toHaveLength(1);
    expect(allIn(dialog(), '[data-tone="warning"]')).toHaveLength(1);
  });
});

describe("the staff session store after the page that raised it is gone", () => {
  it("asks for no kitchen on the unmounted page's behalf when the person has signed in again", async () => {
    let reads = 0;
    harness.answers(() => {
      reads += 1;
      return reads === 1 ? UNAUTHENTICATED_ANSWER : { body: wireKitchen() };
    });
    await harness.mount({ locale: LOCALE });
    expect(getStaffSessionExpiry()).toBeDefined();
    harness.unmount();
    const readsBefore = harness.kitchenRequests().length;

    resolveStaffSessionExpired();
    await harness.settle();

    expect(harness.kitchenRequests()).toHaveLength(readsBefore);
  });
});
