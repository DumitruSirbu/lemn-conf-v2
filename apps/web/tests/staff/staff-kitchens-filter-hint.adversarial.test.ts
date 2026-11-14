// @vitest-environment happy-dom
//
// M12 W4.2, adversarial: the status filter's hint under each tab and in both languages, the select's pointer to it, the
// markup that keeps the hint under the select, and what the stylesheet's wide-screen rules may not do below 900 px.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import type { StaffShellContext } from "@/staff/staff-shell";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { declarationsFor } from "../support/css-declarations";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { installStaffKitchensServer } from "../support/staff-kitchens-wire";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
  installStaffKitchensServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function mount(locale: TestLocale): Promise<HTMLElement> {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  screen = mountInCatalogue(
    createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
    locale,
  );
  await settle();
  return screen.container;
}

async function chooseSegment(
  container: HTMLElement,
  segment: "drafts" | "sent" | "all",
  locale: TestLocale,
): Promise<void> {
  const words = CATALOGUES[locale].staffKitchens;
  const label = {
    drafts: words.segmentDrafts,
    sent: words.segmentSent,
    all: words.segmentAll,
  }[segment];
  const radio = allIn<HTMLInputElement>(container, 'input[type="radio"]').find(
    (candidate) => candidate.closest("label")?.textContent === label,
  );
  if (radio === undefined) throw new Error(`no segment says "${label}"`);
  click(radio);
  await settle();
}

describe.each(["ro", "ru"] as const)("%s: the status hint", (locale) => {
  const hintWords = CATALOGUES[locale].staffKitchens.statusOnlyForSent;

  it("follows the tab Ciorne, Trimise, Toate, Trimise, Ciorne with no leftover: shown and pointed to when disabled, gone and unpointed when enabled", async () => {
    const container = await mount(locale);
    const select = requireIn<HTMLSelectElement>(container, "select");
    const hints = (): HTMLElement[] =>
      allIn(container, "span").filter((span) => span.textContent === hintWords);

    for (const [segment, isEnabled] of [
      ["sent", true],
      ["drafts", false],
      ["sent", true],
      ["all", false],
      ["sent", true],
      ["drafts", false],
      ["all", false],
    ] as const) {
      await chooseSegment(container, segment, locale);

      expect(select.disabled, segment).toBe(!isEnabled);
      if (isEnabled) {
        expect(hints(), segment).toHaveLength(0);
        expect(select.hasAttribute("aria-describedby"), segment).toBe(false);
      } else {
        expect(hints(), segment).toHaveLength(1);
        const [hint] = hints();
        expect(hint?.id, segment).not.toBe("");
        expect(select.getAttribute("aria-describedby"), segment).toBe(hint?.id);
        expect(
          container.querySelectorAll(`#${CSS.escape(hint?.id ?? "")}`),
        ).toHaveLength(1);
        expect(hint?.previousElementSibling, segment).toBe(select);
        expect(hint?.parentElement, segment).toBe(select.parentElement);
      }
    }
  });

  it("keeps the label, the select and the hint in one field, so a hint that appears cannot move the field's siblings out of it", async () => {
    const container = await mount(locale);
    const select = requireIn<HTMLSelectElement>(container, "select");
    const field = select.parentElement;
    const childrenBefore = field?.children.length;

    await chooseSegment(container, "drafts", locale);

    expect(select.parentElement).toBe(field);
    expect(field?.children).toHaveLength((childrenBefore ?? 0) + 1);
    expect([...(field?.children ?? [])].map((child) => child.tagName)).toEqual([
      "LABEL",
      "SELECT",
      "SPAN",
    ]);
    expect(field?.querySelector("label")?.htmlFor).toBe(select.id);
  });

  it("is not the 'changed' switch's neighbour: the switch's field holds no hint and no select", async () => {
    const container = await mount(locale);
    await chooseSegment(container, "drafts", locale);

    const switchField = requireIn(container, '[role="switch"]').closest(
      '[class*="changedField"]',
    );
    expect(switchField?.querySelector("select")).toBeNull();
    expect(switchField?.textContent).not.toContain(hintWords);
  });
});

describe("the stylesheet's wide-screen rules stay out of the phone layout", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff-kitchens.module.css"),
    "utf8",
  );

  it.each([
    ["changedField", "min-height"],
    ["changedField", "margin-top"],
    ["statusField", "position"],
    ["fieldHint", "position"],
    ["fieldHint", "top"],
    ["fieldHint", "white-space"],
    ["searchField", "flex"],
    ["statusField", "flex"],
    ["changedField", "flex"],
    ["filters", "row-gap"],
    ["filters", "margin-bottom"],
    ["changedField", "margin"],
    ["filters", "align-items"],
    ["filters", "flex-flow"],
  ])("declares %s %s only inside the 900 px query", (name, property) => {
    const outsideAnyQuery = declarationsFor(css, name, property).filter(
      ({ media }) => !/min-width:\s*900px/.test(media),
    );

    expect(outsideAnyQuery).toEqual([]);
  });

  // Replaces the "offset pinned" case, which pinned a fixed margin-top on the switch that broke when the row wrapped
  // (M12 W4.2 rework). The switch now has no offset: it is centred in a 48 px box and the row aligns bottoms.
  it("gives the switch no fixed offset, and keeps the 6 px gap that the hint's 'top' adds to", () => {
    const hintTop = declarationsFor(css, "fieldHint", "top").map(
      ({ value }) => value,
    );
    const statusGap = declarationsFor(css, "statusField", "gap").map(
      ({ value }) => value,
    );

    expect(declarationsFor(css, "changedField", "margin-top")).toEqual([]);
    expect(declarationsFor(css, "changedField", "margin")).toEqual([]);
    expect(statusGap).toEqual(["6px"]);
    expect(hintTop).toEqual(["calc(100% + 6px)"]);
  });
});
