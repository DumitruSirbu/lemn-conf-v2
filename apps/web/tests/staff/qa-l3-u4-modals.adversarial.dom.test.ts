// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4: the session sheet raised by the writes, over the unhide dialog and over a typed note. The
// developer's suites raise it from a read and from one write at a time; these stack it, raise it from several writes, and let
// the person come back as someone who is not staff.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStaffSessionExpiry } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  SESSION_ADDRESS,
  chooseOption,
  noteCreated,
  routeKitchen,
  statusSaved,
  typeIntoTextarea,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  UNAUTHENTICATED_ANSWER,
  type RecordedRequest,
  type ServerAnswer,
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

const copy = roMessages.staffActions;
const SHEET = '[data-testid="staff-session-sheet"]';
const DIALOG = '[role="alertdialog"]';
const TYPED = "Clientul vrea fronturi din nuc.";
const SIGNED_IN_STAFF: ServerAnswer = {
  body: {
    state: "signed-in",
    email: "mihai.rusu@lemnaria.md",
    capabilities: ["design.read.any", "account.manage.own"],
  },
};

let harness: ScreenHarness;
let session: (request: RecordedRequest) => KitchenAnswer;

beforeEach(() => {
  harness = setUpScreenHarness();
  session = () => SIGNED_IN_STAFF;
});

afterEach(() => {
  harness.tearDown();
});

function serve(routes: Parameters<typeof routeKitchen>[0]): void {
  const kitchen = routeKitchen(routes);
  harness.server.script((request) =>
    request.url.pathname === SESSION_ADDRESS
      ? session(request)
      : kitchen(request),
  );
}

function main(): HTMLElement {
  return requireIn(harness.container(), "main");
}

function sheets(): HTMLElement[] {
  return allIn(harness.container(), SHEET);
}

function recheck(): HTMLElement {
  return byWords(
    requireIn(harness.container(), SHEET),
    "button",
    copy.sessionRecheck,
  );
}

/** The children of the frame's main that hold neither of the two modals. */
function bandsBehindBoth(): Element[] {
  return [...main().children].filter(
    (band) => band.querySelector(`${SHEET}, ${DIALOG}`) === null,
  );
}

describe("the session sheet over the unhide dialog", () => {
  async function openDialogAndExpire(): Promise<void> {
    serve({
      read: () => ({ body: wireKitchen({ kitchen: { isHidden: true } }) }),
      unhide: () => UNAUTHENTICATED_ANSWER,
    });
    await harness.mount();
    click(
      requireIn(
        harness.container(),
        '[data-testid="staff-kitchen-hidden-banner"] > button',
      ),
    );
    await harness.settle();
    click(
      byWords(requireIn(document.body, DIALOG), "button", copy.unhideConfirm),
    );
    await harness.settle();
  }

  it("makes the dialog inert while the sheet is up", async () => {
    await openDialogAndExpire();

    const dialogBand = requireIn(document.body, DIALOG).closest("main > *");
    expect(sheets()).toHaveLength(1);
    expect(dialogBand?.hasAttribute("inert")).toBe(true);
  });

  it("gives the dialog back its focus and its operability, and keeps the page behind it inert, once the person is signed in", async () => {
    await openDialogAndExpire();

    click(recheck());
    await harness.settle();

    const dialog = requireIn(document.body, DIALOG);
    expect(sheets()).toHaveLength(0);
    expect(dialog.closest("main > *")?.hasAttribute("inert")).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (const band of bandsBehindBoth()) {
      expect(band.hasAttribute("inert")).toBe(true);
    }
  });

  it("lets the person confirm the unhide after the sheet has gone, and sends it once", async () => {
    let attempt = 0;
    serve({
      read: () => ({ body: wireKitchen({ kitchen: { isHidden: true } }) }),
      unhide: () => {
        attempt += 1;
        return attempt === 1 ? UNAUTHENTICATED_ANSWER : { status: 204 };
      },
    });
    await harness.mount();
    click(
      requireIn(
        harness.container(),
        '[data-testid="staff-kitchen-hidden-banner"] > button',
      ),
    );
    await harness.settle();
    const confirm = (): HTMLElement =>
      byWords(requireIn(document.body, DIALOG), "button", copy.unhideConfirm);
    click(confirm());
    await harness.settle();
    click(recheck());
    await harness.settle();

    click(confirm());
    await harness.settle();

    expect(writesOf(harness.server)).toHaveLength(2);
    expect(allIn(document.body, DIALOG)).toHaveLength(0);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchen-hidden-banner"]'),
    ).toHaveLength(0);
  });
});

describe("the session sheet raised by several writes", () => {
  async function refuseStatus(): Promise<void> {
    const control = requireIn(
      harness.container(),
      '[data-testid="staff-status-control"]',
    );
    chooseOption(requireIn<HTMLSelectElement>(control, "select"), "closed");
    click(requireIn(control, "button"));
    await harness.settle();
  }

  async function refuseNote(): Promise<void> {
    const notes = requireIn(harness.container(), '[data-testid="staff-notes"]');
    typeIntoTextarea(requireIn<HTMLTextAreaElement>(notes, "textarea"), TYPED);
    click(requireIn(notes, 'button[type="submit"]'));
    await harness.settle();
  }

  it.each([
    ["a status and then a note", [refuseStatus, refuseNote]],
    ["a note and then a status", [refuseNote, refuseStatus]],
  ] as const)(
    "is one sheet, and its body promises the typed text, when %s are refused",
    async (_, refusals) => {
      serve({
        read: () => ({ body: wireKitchen() }),
        status: () => UNAUTHENTICATED_ANSWER,
        note: () => UNAUTHENTICATED_ANSWER,
      });
      await harness.mount();

      for (const refuse of refusals) await refuse();

      expect(sheets()).toHaveLength(1);
      expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
      expect(requireIn(harness.container(), SHEET).textContent).toContain(
        copy.sessionBodyKeepsText,
      );
    },
  );

  it("sends no write of its own, and none of the refused ones again, when the person says they are signed in", async () => {
    let statusAttempts = 0;
    serve({
      read: () => ({ body: wireKitchen() }),
      status: () => {
        statusAttempts += 1;
        return UNAUTHENTICATED_ANSWER;
      },
      note: () => noteCreated(),
    });
    await harness.mount();
    const control = requireIn(
      harness.container(),
      '[data-testid="staff-status-control"]',
    );
    chooseOption(requireIn<HTMLSelectElement>(control, "select"), "closed");
    click(requireIn(control, "button"));
    await harness.settle();

    click(recheck());
    await harness.settle();
    await harness.pass(24 * 60 * 60 * 1000);

    expect(statusAttempts).toBe(1);
    expect(writesOf(harness.server)).toHaveLength(1);
    void statusSaved;
  });
});

describe("the re-check of the session sheet", () => {
  it.each([
    [
      "a client",
      {
        body: {
          state: "signed-in",
          email: "ana@mail.md",
          capabilities: ["design.read.own"],
        },
      },
    ],
    ["a body that is not a session", { body: { state: 7 } }],
    ["a body that is a list", { body: [] }],
  ] as const)(
    "keeps the typed note and resends nothing by itself when the re-check meets %s",
    async (_, answer) => {
      serve({
        read: () => ({ body: wireKitchen() }),
        note: () => UNAUTHENTICATED_ANSWER,
      });
      await harness.mount();
      const notes = requireIn(
        harness.container(),
        '[data-testid="staff-notes"]',
      );
      const field = requireIn<HTMLTextAreaElement>(notes, "textarea");
      typeIntoTextarea(field, TYPED);
      click(requireIn(notes, 'button[type="submit"]'));
      await harness.settle();
      session = () => answer;

      click(recheck());
      await harness.settle();

      expect(field.value).toBe(TYPED);
      expect(writesOf(harness.server)).toHaveLength(1);
    },
  );
});
