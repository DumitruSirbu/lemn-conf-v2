// @vitest-environment happy-dom
//
// An open price field stands above the phone card's stretched link: a viewport that narrows while the field is open must
// not turn a tap in it into a tap on the link.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { pageOf } from "./dashboard-state-fixture";
import {
  BASE_RULE,
  mountEditor,
  openPriceField,
  type MountedEditor,
} from "./qa-m10-u2-harness";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

let mounted: MountedEditor | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

/** The module class names an element carries, as the key the stylesheet declares them by. */
function classKeysOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((name) => /^_?([a-zA-Z]+)_/.exec(name)?.[1] ?? name);
}

describe("the open price field of a row", () => {
  it("sits in the wrapper the stylesheet raises above the stretched link", async () => {
    mounted = await mountEditor(pageOf());

    const input = openPriceField(mounted.container, BASE_RULE);

    expect(
      classKeysOf(input.closest('[class*="openPrice"]') ?? input),
    ).toContain("openPrice");
  });
});
