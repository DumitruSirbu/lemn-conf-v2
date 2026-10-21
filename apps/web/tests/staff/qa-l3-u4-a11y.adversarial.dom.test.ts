// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4, the structure a screen reader walks on the staff kitchen page once the writes are on it: one
// main, headings that do not skip a level in any state (a refusal at the field, the unhide question, the session sheet), a name
// for every control, and every id an `aria-*` attribute points at present exactly once in the document, including the ones
// drawn into the frame's main by a portal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  SESSION_ADDRESS,
  routeKitchen,
  typeIntoTextarea,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import { UNAUTHENTICATED_ANSWER } from "../support/staff-kitchens-wire";

import {
  setUpScreenHarness,
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
const REFERENCING_ATTRIBUTES = [
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
] as const;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function serveHiddenKitchen(
  extra: Parameters<typeof routeKitchen>[0] = {},
): void {
  const kitchen = routeKitchen({
    read: () => ({
      body: wireKitchen({
        kitchen: { isHidden: true },
        notes: [
          {
            id: "n1",
            text: "Am sunat.",
            createdAt: "2026-10-19T11:41:00.000Z",
            author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
          },
        ],
      }),
    }),
    ...extra,
  });
  harness.server.script((request) =>
    request.url.pathname === SESSION_ADDRESS
      ? { body: { state: "anonymous" } }
      : kitchen(request),
  );
}

function headingLevels(): number[] {
  return allIn(document.body, "h1, h2, h3, h4, h5, h6").map((heading) =>
    Number(heading.tagName.slice(1)),
  );
}

function expectNoSkippedLevel(levels: readonly number[]): void {
  expect(levels[0]).toBe(1);
  levels.forEach((level, place) => {
    const before = levels[place - 1];
    if (before !== undefined) expect(level).toBeLessThanOrEqual(before + 1);
  });
}

function unresolvedReferences(): string[] {
  const missing: string[] = [];
  for (const attribute of REFERENCING_ATTRIBUTES) {
    for (const element of allIn(document.body, `[${attribute}]`)) {
      for (const id of (element.getAttribute(attribute) ?? "").split(/\s+/)) {
        if (id === "") continue;
        const found = document.querySelectorAll(`[id="${CSS.escape(id)}"]`);
        if (found.length !== 1) {
          missing.push(`${attribute}="${id}" finds ${String(found.length)}`);
        }
      }
    }
  }
  return missing;
}

/** Only a button or a link is named by what it holds; the options of a select are not its name. */
function namesItselfByContent(control: HTMLElement): boolean {
  return (
    ["BUTTON", "A"].includes(control.tagName) &&
    control.textContent.trim() !== ""
  );
}

function unnamedControls(): string[] {
  return allIn(document.body, "button, a[href], select, textarea, input")
    .filter((control) => {
      const labelled = control.getAttribute("aria-label") ?? "";
      const labelId = control.getAttribute("aria-labelledby");
      const labelFor =
        control.id === ""
          ? []
          : allIn(document.body, `label[for="${control.id}"]`);
      return (
        labelled.trim() === "" &&
        labelId === null &&
        labelFor.length === 0 &&
        !namesItselfByContent(control)
      );
    })
    .map((control) => control.outerHTML.slice(0, 80));
}

describe("the kitchen page with its writes, in each state a screen reader can reach", () => {
  it("has one main and one h1, and no heading skips a level, with nothing else open", async () => {
    serveHiddenKitchen();
    await harness.mount();

    expect(allIn(document.body, "main")).toHaveLength(1);
    expect(allIn(document.body, "h1")).toHaveLength(1);
    expectNoSkippedLevel(headingLevels());
    expect(unresolvedReferences()).toEqual([]);
    expect(unnamedControls()).toEqual([]);
  });

  it("keeps all of it with a refusal at the field, which adds a described-by id that exists", async () => {
    serveHiddenKitchen();
    await harness.mount();
    const notes = requireIn(harness.container(), '[data-testid="staff-notes"]');
    typeIntoTextarea(requireIn<HTMLTextAreaElement>(notes, "textarea"), "a\tb");
    click(requireIn(notes, 'button[type="submit"]'));
    await harness.settle();

    const field = requireIn<HTMLTextAreaElement>(notes, "textarea");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    expect(unresolvedReferences()).toEqual([]);
    expect(unnamedControls()).toEqual([]);
  });

  it("keeps all of it with the unhide question open: the dialog's title, description and share note exist once", async () => {
    serveHiddenKitchen();
    await harness.mount();
    click(
      requireIn(
        harness.container(),
        '[data-testid="staff-kitchen-hidden-banner"] > button',
      ),
    );
    await harness.settle();

    const dialog = requireIn(document.body, '[role="alertdialog"]');
    expect(dialog.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    expect(allIn(document.body, "main")).toHaveLength(1);
    expectNoSkippedLevel(headingLevels());
    expect(unresolvedReferences()).toEqual([]);
    expect(unnamedControls()).toEqual([]);
  });

  it("keeps all of it with the session sheet over the question", async () => {
    serveHiddenKitchen({ unhide: () => UNAUTHENTICATED_ANSWER });
    await harness.mount();
    click(
      requireIn(
        harness.container(),
        '[data-testid="staff-kitchen-hidden-banner"] > button',
      ),
    );
    await harness.settle();
    click(
      byWords(
        requireIn(document.body, '[role="alertdialog"]'),
        "button",
        copy.unhideConfirm,
      ),
    );
    await harness.settle();

    expect(
      allIn(document.body, '[role="dialog"], [role="alertdialog"]'),
    ).toHaveLength(2);
    expect(allIn(document.body, "main")).toHaveLength(1);
    expectNoSkippedLevel(headingLevels());
    expect(unresolvedReferences()).toEqual([]);
    expect(unnamedControls()).toEqual([]);
  });

  it("mounts the region that says the kitchen is visible again before it has anything to say", async () => {
    serveHiddenKitchen();
    await harness.mount();

    const region = requireIn(
      harness.container(),
      '[data-testid="staff-kitchen-unhide-announcement"]',
    );
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
  });
});
