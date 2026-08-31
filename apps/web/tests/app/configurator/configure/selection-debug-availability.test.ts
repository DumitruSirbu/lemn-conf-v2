// Finding WEB-004: `SelectionDebug` is e2e instrumentation and used to render in every build,
// publishing selection ids, opening dimensions, save status, design id, probe state and rejection
// code into DOM attributes on the production attack surface. It is now opted in by an explicit test
// build flag, and these pin the two halves of that: the predicate says off unless asked, and the
// component renders nothing at all when it is off.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  isSelectionDebugEnabled,
  SELECTION_DEBUG_FLAG,
  SELECTION_DEBUG_FLAG_ENABLED,
} from "@/app/configurator/configure/selection-debug-availability";
import { SelectionDebug } from "@/app/configurator/configure/selection-debug";

describe("isSelectionDebugEnabled", () => {
  it("withholds the readout from a build that did not ask for it", () => {
    expect(isSelectionDebugEnabled(undefined)).toBe(false);
  });

  it("renders the readout once the flag is set", () => {
    expect(isSelectionDebugEnabled(SELECTION_DEBUG_FLAG_ENABLED)).toBe(true);
  });

  it("treats every value but the opt-in as off, so a stray string cannot expose it", () => {
    const notOptedIn = ["", " ", "0", "false", "off", "true", "yes", "2", "01"];
    for (const value of notOptedIn) {
      expect(
        isSelectionDebugEnabled(value),
        `${JSON.stringify(value)} was read as an opt-in`,
      ).toBe(false);
    }
    expect(notOptedIn).toHaveLength(9);
  });

  it("is named for the browser bundle, because that is where the readout runs", () => {
    // Next inlines only `NEXT_PUBLIC_`-prefixed variables into client code. Without the prefix the
    // flag would read `undefined` in the browser and the e2e suite would silently lose its hook —
    // a green suite asserting on an element that is never there.
    expect(SELECTION_DEBUG_FLAG).toMatch(/^NEXT_PUBLIC_/);
  });
});

describe("SelectionDebug", () => {
  it("puts no DOM oracle on the page in a build that did not opt in", () => {
    // The production shape: the flag unset, which is what every deployed build has. Asserted on
    // rendered markup rather than on the predicate, because "the element does not exist" is the
    // claim the finding makes and a `hidden` attribute would satisfy the predicate test alone.
    vi.stubEnv("NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG", "");

    const markup = renderToStaticMarkup(createElement(SelectionDebug));

    expect(markup).toBe("");
    expect(markup).not.toContain('data-testid="selection-debug"');
    vi.unstubAllEnvs();
  });

  it("does not treat development as an opt-in, because development is not the e2e suite", () => {
    // The finding is explicit that `NODE_ENV === "development"` must not imply E2E observability.
    // `next dev` by hand therefore gets the production-shaped page; Playwright sets the flag on the
    // server it starts.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG", "");

    expect(renderToStaticMarkup(createElement(SelectionDebug))).toBe("");
    vi.unstubAllEnvs();
  });
});
