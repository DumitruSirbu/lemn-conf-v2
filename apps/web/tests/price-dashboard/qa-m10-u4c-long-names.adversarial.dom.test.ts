// @vitest-environment happy-dom
//
// A cabinet type or an accessory with a name no space can break (the longest the book takes, or a cabinet type only a build
// id names): every screen of the accessories draws it whole, in an element whose rule lets it wrap anywhere, so no name can
// widen a page past the screen. The DOM says where the name is drawn and the stylesheet says what that element may do.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_BOOK_NAME_LENGTH } from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { valuesFor } from "../support/css-declarations";
import { readItemScreenSheet } from "../support/item-screen-stylesheet";
import { allIn } from "../support/render-with-intl";
import {
  accessoryPageOf,
  CREATED,
  CREATED_ACCESSORY,
  LINKED_BUILD_ID,
  mountAccessoryCreate,
  mountAccessoryEdit,
  mountAccessoryList,
  PUBLISHED,
  PUBLISHED_RULE,
  type MountedAccessories,
} from "./accessory-harness";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const css = readItemScreenSheet("accessory.module.css");
const LONG_CABINET_NAME = "Dulap".padEnd(300, "x");
const LONG_ACCESSORY_NAME = "A".repeat(MAX_BOOK_NAME_LENGTH);
const MODULE_CLASS = /^_(.+)_[0-9a-z]+$/;

let mounted: MountedAccessories | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const pageWithLongNames = (options: Parameters<typeof accessoryPageOf>[0]) => {
  const page = accessoryPageOf(options);
  return {
    ...page,
    cabinetNames: {
      ...page.cabinetNames,
      [LINKED_BUILD_ID]: LONG_CABINET_NAME,
    },
  };
};

/** The elements that say `words` and nothing else, with the stylesheet's own names for the classes they carry. */
function classesSaying(container: HTMLElement, words: string): string[][] {
  return allIn(container, "*")
    .filter(
      (element) =>
        element.children.length === 0 && element.textContent.includes(words),
    )
    .map((element) =>
      [...element.classList].map(
        (token) => MODULE_CLASS.exec(token)?.[1] ?? token,
      ),
    );
}

function expectEachToWrapAnywhere(places: string[][], where: string): void {
  expect(places.length, `${where}: the name is drawn`).toBeGreaterThan(0);
  for (const classes of places) {
    const wraps = classes.some(
      (name) => valuesFor(css, name, "overflow-wrap").at(-1) === "anywhere",
    );
    expect(wraps, `${where}: ${classes.join(" ")}`).toBe(true);
  }
}

describe("a cabinet type no space can break", () => {
  it("is drawn whole in the list, in a cell that wraps anywhere", async () => {
    mounted = await mountAccessoryList(
      pageWithLongNames({ linked: [PUBLISHED_RULE] }),
    );

    expectEachToWrapAnywhere(
      classesSaying(mounted.container, LONG_CABINET_NAME),
      "the list",
    );
  });

  it("is drawn whole on the accessory's page, in a value that wraps anywhere", async () => {
    mounted = await mountAccessoryEdit(
      PUBLISHED,
      pageWithLongNames({ linked: [PUBLISHED_RULE] }),
    );

    expectEachToWrapAnywhere(
      classesSaying(mounted.container, LONG_CABINET_NAME),
      "the page",
    );
  });

  it("is offered whole in the creation form's select, which is no wider than the form", async () => {
    mounted = await mountAccessoryCreate(pageWithLongNames({}));

    const options = allIn<HTMLOptionElement>(mounted.container, "option").map(
      (option) => option.textContent,
    );

    expect(options).toContain(LONG_CABINET_NAME);
    expect(valuesFor(css, "select", "width")).toEqual(["100%"]);
    expect(valuesFor(css, "select", "box-sizing")).toEqual(["border-box"]);
  });
});

describe("an accessory named with the longest name the book takes", () => {
  const longCreation = CREATED_ACCESSORY.map((change) => ({
    ...change,
    value: { ...(change.value as object), name: LONG_ACCESSORY_NAME },
  })) as typeof CREATED_ACCESSORY;

  it("is drawn whole in the list, in a name that wraps anywhere", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: longCreation }),
    );

    expectEachToWrapAnywhere(
      classesSaying(mounted.container, LONG_ACCESSORY_NAME),
      "the list",
    );
  });

  it("is drawn whole as the page's title, in a title that wraps anywhere", async () => {
    mounted = await mountAccessoryEdit(
      CREATED,
      accessoryPageOf({ changes: longCreation }),
    );

    expectEachToWrapAnywhere(
      classesSaying(mounted.container, LONG_ACCESSORY_NAME).filter(
        (classes) => !classes.includes("input"),
      ),
      "the page",
    );
  });
});
