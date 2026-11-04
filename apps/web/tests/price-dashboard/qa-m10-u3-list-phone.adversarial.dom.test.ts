// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, the way the list opens a cabinet, on a phone (D2M; A-1 of the wave: "the whole card opens
// the cabinet and the price is changed on the cabinet's own page"). The coordinator's ruling: on a phone the price button
// is removed from the tree, with plain price text left, and not merely made unclickable. `pointer-events: none` leaves a
// button in the tab order that Enter and Space still press, and a pressed one opens the inline field under the card's
// stretched link, which no thumb can then reach. No layout runs in this process, so the phone's tree is the markup minus
// what the stylesheets hide at the phone's width (`display: none` under the phone media query); a fix that renders the
// text and not the button by script is read the same way, because the viewport is set to the phone's before the mount.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CabinetListEditor } from "@/price-dashboard/cabinet-list-editor";
import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { declarationsFor } from "../support/css-declarations";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import { BASE_CABINET_RULE, pageOf } from "./dashboard-state-fixture";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const PHONE: readonly string[] = ["", "@media (max-width: 899.98px)"];
const DESKTOP: readonly string[] = ["", "@media (min-width: 900px)"];
const PHONE_WIDTH_PX = 390;
const DESKTOP_WIDTH_PX = 1440;
const STYLESHEETS = ["cabinet-list.module.css", "price-edit.module.css"].map(
  (name) =>
    readFileSync(
      join(import.meta.dirname, "../../src/price-dashboard", name),
      "utf8",
    ),
);

interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** happy-dom's own handle on the window it stands in for; the DOM lib's `Window` does not name it. */
function setViewport(viewport: Viewport): void {
  (
    window as unknown as {
      happyDOM: { setViewport: (viewport: Viewport) => void };
    }
  ).happyDOM.setViewport(viewport);
}

let screen: MountedScreen | undefined;
let originalViewport: Viewport;

beforeEach(() => {
  stubTheStaffServer();
  originalViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  setViewport(originalViewport);
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountList(widthPx: number): Promise<HTMLElement> {
  setViewport({ width: widthPx, height: 844 });
  const page = pageOf();
  const server = inMemoryPriceDraftClient(page.state);
  screen = mountInCatalogue(
    createElement(CabinetListEditor, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      page,
      client: server.client,
    }),
    "ro",
  );
  await flushPromises(5);
  return screen.container;
}

function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = allIn(container, '[data-testid="cabinet-row"]').find(
    (row) => row.dataset.ruleId === ruleId,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

/** The module class names an element carries, as the key the stylesheet declares them by. */
function classKeysOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((name) => /^_?([a-zA-Z]+)_/.exec(name)?.[1] ?? name);
}

/**
 * Whether the stylesheets leave the element out of the tree at a width: the last `display` a plain `.class` rule gives it
 * or an ancestor, among the rules that always apply and those of the media query the width is in, is `none`.
 */
function isHiddenAtWidth(element: Element, medias: readonly string[]): boolean {
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    if (node.hasAttribute("hidden")) return true;
    const displays = classKeysOf(node).map((key) =>
      STYLESHEETS.flatMap((css) =>
        declarationsFor(css, key, "display").filter(
          (declaration) =>
            declaration.selector === `.${key}` &&
            medias.includes(declaration.media),
        ),
      ).at(-1),
    );
    if (displays.some((declaration) => declaration?.value === "none")) {
      return true;
    }
  }
  return false;
}

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

describe("the card on a phone (390 px)", () => {
  it("has no price button in its tree: `pointer-events: none` leaves it in the tab order, where Enter opens the inline field under the stretched link", async () => {
    const container = await mountList(PHONE_WIDTH_PX);
    const row = rowOf(container, BASE_CABINET_RULE);

    const buttons = allIn(row, "button").filter(
      (button) => !isHiddenAtWidth(button, PHONE),
    );

    expect(
      buttons.map((button) => button.getAttribute("aria-label")),
      "a button is left in the phone's tree",
    ).toEqual([]);
  });

  it("leaves the price as plain text, outside any button", async () => {
    const container = await mountList(PHONE_WIDTH_PX);
    const row = rowOf(container, BASE_CABINET_RULE);
    const price = requireIn(row, '[data-testid="cabinet-price"]');
    const figure = formatLei(396_000, "lei");

    const plain = allIn(price, "*").filter(
      (element) =>
        element.textContent.trim() === figure &&
        element.closest("button") === null &&
        !isHiddenAtWidth(element, PHONE),
    );

    expect(plain, "the price is only inside the button").not.toHaveLength(0);
  });

  it("leaves the cabinet's link as the one thing a Tab reaches in the card", async () => {
    const container = await mountList(PHONE_WIDTH_PX);
    const row = rowOf(container, BASE_CABINET_RULE);

    const reachable = allIn(row, FOCUSABLE).filter(
      (element) => !isHiddenAtWidth(element, PHONE),
    );

    expect(
      reachable.map((element) => element.getAttribute("data-testid")),
    ).toEqual(["cabinet-link"]);
  });

  it("stretches the name's link over the card from the card itself: nothing between the link and the card is positioned, so the link cannot cover less than the card", () => {
    for (const className of ["rowName", "chips", "note", "defaultLine"]) {
      for (const css of STYLESHEETS) {
        expect(
          declarationsFor(css, className, "position"),
          `.${className} would become the stretched link's containing block`,
        ).toEqual([]);
      }
    }
  });
});

describe("the table on a desktop (1440 px)", () => {
  it("keeps the price a button that opens its field, and hides nothing of the row at that width", async () => {
    const container = await mountList(DESKTOP_WIDTH_PX);
    const row = rowOf(container, BASE_CABINET_RULE);

    const buttons = allIn(row, "button");

    expect(buttons).toHaveLength(1);
    expect(isHiddenAtWidth(requireIn(row, "button"), DESKTOP)).toBe(false);
    expect(
      allIn(row, FOCUSABLE).map(
        (element) => element.getAttribute("data-testid") ?? element.tagName,
      ),
    ).toEqual(["cabinet-link", "BUTTON"]);
  });
});
