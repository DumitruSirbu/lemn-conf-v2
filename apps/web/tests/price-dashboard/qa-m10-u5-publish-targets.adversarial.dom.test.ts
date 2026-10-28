// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U5, what a thumb can hit and what a reader is told. `publish-stylesheet.test.ts` lists nine
// classes by hand; a control added later, or one the list forgot, is not looked at. Here the screens are mounted and every
// interactive element found on them (pending list, history, a version, both dialogs, the frame's chip) is traced to the
// stylesheet that styles it and must declare a touch target tall, and the name each one is announced by is read the way a
// browser reads it, hidden descendants left out, and must hold no decorative glyph.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyChanges, type DraftChange } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PublishScreen } from "@/price-dashboard/publish-page";
import { sampleVersionIdOf } from "@/price-dashboard/publish-sample-client";
import {
  SAMPLE_PUBLISH_PAGE,
  sampleVersionDetail,
} from "@/price-dashboard/publish-sample";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import roMessages from "../../src/messages/ro.json";
import { declarationsFor } from "../support/css-declarations";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const SHEETS = [
  "price-dashboard/publish.module.css",
  "account/account.module.css",
].map((path) => readFileSync(join(SOURCE_ROOT, path), "utf8"));
const TOUCH_TARGET_PX = 44;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
/** The wave's own screens and the questions it asks; the staff frame around them belongs to wave U1. */
const OWN_SURFACE =
  '[data-testid="publish-page"], [data-testid="version-detail"], [role="alertdialog"]';
const INTERACTIVE =
  'a[href], button, input, select, textarea, [role="switch"], [tabindex]:not([tabindex="-1"])';
/** Arrows, geometric shapes, dingbats and the technical block: the glyph families a stylesheet or a label may borrow. */
const DECORATIVE_GLYPH =
  /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]/u;

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

/** The shared dialog's own buttons are the account area's, styled by `composes` that a test run does not resolve. */
const isSharedDialogAction = (element: Element): boolean =>
  /_dialog[A-Z]/.test(element.getAttribute("class") ?? "");

function ownControlsIn(root: ParentNode): Element[] {
  return allIn(root, INTERACTIVE).filter(
    (element) => element.closest(OWN_SURFACE) !== null,
  );
}

function mount(
  element: ReturnType<typeof createElement>,
  locale: TestLocale = "ro",
): HTMLElement {
  screen = mountInCatalogue(element, locale);
  return screen.container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(5);
  });
}

const context = contextOf(
  "administrator",
  MENU,
  SAMPLE_PUBLISH_PAGE.state.draft.changes.length,
);
const PLAIN_DRAFT = SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
  (change) => change.address.kind !== "provisional",
);

function pendingScreen(
  changes: readonly DraftChange[],
  view: "pending" | "history" = "pending",
) {
  return createElement(PublishScreen, {
    locale: "ro",
    context,
    input: {
      ...SAMPLE_PUBLISH_PAGE,
      state: {
        ...SAMPLE_PUBLISH_PAGE.state,
        draft: { draftRevision: "1", changes },
      },
    },
    initialView: view,
  });
}

function detailScreen(sequenceNumber: number) {
  const input = sampleVersionDetail(sampleVersionIdOf(sequenceNumber));
  if (input === undefined) throw new Error("no such sample version");
  return createElement(VersionDetailScreen, { locale: "ro", context, input });
}

/** Every screen state with controls on it, each mounted in turn by the test that sweeps them. */
const STATES: readonly { name: string; open: () => Promise<HTMLElement> }[] = [
  {
    name: "the pending list",
    open: () =>
      Promise.resolve(
        mount(pendingScreen(SAMPLE_PUBLISH_PAGE.state.draft.changes)),
      ),
  },
  {
    name: "the history",
    open: () => Promise.resolve(mount(pendingScreen([], "history"))),
  },
  {
    name: "an archived version",
    open: () => Promise.resolve(mount(detailScreen(3))),
  },
  {
    name: "the publish question",
    open: async () => {
      const container = mount(pendingScreen(PLAIN_DRAFT));
      typeInto(
        requireIn<HTMLInputElement>(container, 'input[type="text"]'),
        "Ajustari",
      );
      click(requireIn(container, '[class*="primary"]'));
      await settle();
      return document.body;
    },
  },
  {
    name: "the provisional question",
    open: async () => {
      const container = mount(
        pendingScreen(SAMPLE_PUBLISH_PAGE.state.draft.changes),
      );
      typeInto(
        requireIn<HTMLInputElement>(container, 'input[type="text"]'),
        "Ajustari",
      );
      click(requireIn(container, '[class*="primary"]'));
      await settle();
      return document.body;
    },
  },
  {
    name: "the restore question",
    open: async () => {
      const container = mount(detailScreen(3));
      click(
        byWords(
          container,
          "button",
          roMessages.priceDashboard.history.restoreAction.replace(
            "{versionId}",
            "3",
          ),
        ),
      );
      await settle();
      return document.body;
    },
  },
];

/** The class names an element carries that some stylesheet declares, without the build's hash. */
function declaredClassesOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((token) => /^_(.+)_[0-9a-f]{6}$/.exec(token)?.[1])
    .filter((name): name is string => name !== undefined);
}

function heightsDeclaredOn(className: string): number[] {
  return SHEETS.flatMap((css) =>
    ["min-height", "height"].flatMap((property) =>
      declarationsFor(css, className, property)
        .filter((declaration) => declaration.media === "")
        .map((declaration) =>
          declaration.value === "var(--touch-target)"
            ? TOUCH_TARGET_PX
            : Number.parseFloat(declaration.value),
        ),
    ),
  );
}

/** A checkbox is hit through its label, which is the target a thumb finds. */
function targetOf(element: Element): Element {
  return element instanceof HTMLInputElement && element.type === "checkbox"
    ? (element.closest("label") ?? element)
    : element;
}

describe("every control on the publish and history screens", () => {
  it.each(STATES)(
    "is at least a touch target tall in $name, by a declaration of the stylesheet that styles it",
    async ({ open }) => {
      const root = await open();

      const controls = ownControlsIn(root).filter(
        (element) =>
          !element.closest("[hidden]") && !isSharedDialogAction(element),
      );
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const target = targetOf(control);
        const heights = declaredClassesOf(target).flatMap(heightsDeclaredOn);
        const label = `${control.tagName} ${control.getAttribute("class") ?? ""} "${control.textContent.slice(0, 30)}"`;
        expect(
          heights.length,
          `${label} declares no height at all`,
        ).toBeGreaterThan(0);
        expect(Math.max(...heights), label).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX,
        );
      }
    },
  );
});

function nameOf(element: Element, doc: Document): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) return label;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    return labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .map((referenced) => (referenced === null ? "" : visibleText(referenced)))
      .join(" ");
  }
  const labelFor =
    element.id === "" ? null : doc.querySelector(`label[for="${element.id}"]`);
  return labelFor === null ? visibleText(element) : visibleText(labelFor);
}

function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .map((child) => {
      if (child.nodeType === 3) return child.textContent;
      return child instanceof Element &&
        child.getAttribute("aria-hidden") !== "true"
        ? visibleText(child)
        : "";
    })
    .join("");
}

describe("the names the controls are announced by", () => {
  it.each(STATES)(
    "name something and hold no decorative glyph in $name",
    async ({ open }) => {
      const root = await open();

      for (const control of ownControlsIn(root)) {
        const name = nameOf(control, document).trim();
        const label = `${control.tagName} ${control.getAttribute("class") ?? ""}`;
        expect(name, `${label} has no accessible name`).not.toBe("");
        expect(name, label).not.toMatch(DECORATIVE_GLYPH);
      }
    },
  );

  it("names each arrow after the row it takes back, and never by a glyph the stylesheet draws", () => {
    const container = mount(
      pendingScreen(SAMPLE_PUBLISH_PAGE.state.draft.changes),
    );

    const arrows = allIn(container, '[data-testid="diff-revert"]');
    expect(arrows.length).toBeGreaterThan(3);
    const names = arrows.map((arrow) => arrow.getAttribute("aria-label"));
    expect(new Set(names).size, "two arrows share a name").toBe(arrows.length);
    for (const arrow of arrows) {
      expect(arrow.textContent).toBe("");
    }
    const sheet = SHEETS[0] ?? "";
    expect(sheet).toMatch(
      /\.revert::before\s*\{[^}]*content:\s*"\\21BA"\s*\/\s*""/,
    );
  });
});

describe("the draft the screens are drawn from", () => {
  it("is a draft that makes a book, so every state above shows the rows of a real candidate", () => {
    expect(
      applyChanges(
        SAMPLE_PUBLISH_PAGE.state.active.book,
        SAMPLE_PUBLISH_PAGE.state.draft.changes,
      ).ok,
    ).toBe(true);
  });
});

describe("the order the stylesheet draws the screens in", () => {
  it("never reorders what the page holds: no `order`, no reversed flow, no named grid areas, so the keyboard and a reader meet the controls in the order the eye does", () => {
    const sheet = SHEETS[0] ?? "";

    expect(sheet).not.toMatch(/(^|[\s;{])order\s*:/m);
    expect(sheet).not.toMatch(/(row|column)-reverse/);
    expect(sheet).not.toMatch(/grid-template-areas|grid-area\s*:/);
  });

  it("places an arrow beside its row's name and in no other row of the card", () => {
    const sheet = SHEETS[0] ?? "";

    expect(
      declarationsFor(sheet, "revert", "grid-row").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "1"],
      ["@media (min-width: 900px)", "auto"],
    ]);
  });
});
