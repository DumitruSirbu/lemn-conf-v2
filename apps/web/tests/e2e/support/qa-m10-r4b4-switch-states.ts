import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  DRYING_RACK,
  openAccessory,
  warmAccessoryRoutes,
} from "./accessory-page";
import {
  deleteClassButton,
  HETTICH,
  openClass,
  STANDARD,
  warmHardwareRoutes,
} from "./hardware-page";
import { availabilityAction } from "./item-availability-page";
import { MDF, openMaterial, warmMaterialRoutes } from "./material-page";
import {
  discardDraft,
  priceRateLimitKeysOf,
  test,
} from "./price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./price-draft-lock";
import { wordsOf } from "./publish-page";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  signIn,
  type SignedInAdministrator,
} from "./staff-world";

// An item's availability button (ADR 0184) in every state a control can be put in, in a browser: one that cannot be
// pressed keeps the look of a deletion that cannot be taken whether hovered or focused, and one that can be pressed
// does not take that look in either.

const FILES_TAKE_TURNS_MS = 600_000;

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

interface Look {
  readonly color: string;
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly cursor: string;
}

interface Screen {
  readonly name: string;
  readonly open: (page: Page) => Promise<Locator>;
}

export function describeSwitchStates(viewport: Viewport): void {
  let signedIn: SignedInAdministrator;
  let rateLimitKeys: readonly string[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(FILES_TAKE_TURNS_MS);
    await holdPriceDraft();
    signedIn = await plantSignedInAdministrator();
    rateLimitKeys = priceRateLimitKeysOf(signedIn);
    await warmHardwareRoutes(browser, signedIn.administrator);
    await warmMaterialRoutes(browser, signedIn.administrator);
    await warmAccessoryRoutes(browser, signedIn.administrator);
  });

  test.afterAll(async () => {
    releasePriceDraft();
    const scope = { rateLimitKeys };
    await removeStaffFixturesForTests(signedIn.marker, scope);
    const left = await countStaffFixturesForTests(signedIn.marker, scope);
    expect(left, "rows left behind").toEqual(NOTHING_LEFT);
  });

  test.beforeEach(async ({ context }) => {
    await signIn(context, signedIn.administrator);
    await discardDraft(context);
  });

  test.afterEach(async ({ context }) => {
    await discardDraft(context);
  });

  const words = wordsOf("ro");
  const screens: readonly Screen[] = [
    {
      name: "hardware, the default class",
      open: async (page) => {
        await openClass(page, STANDARD);
        return availabilityAction(page);
      },
    },
    {
      name: "hardware, a class",
      open: async (page) => {
        await openClass(page, HETTICH);
        return availabilityAction(page);
      },
    },
    {
      name: "a material",
      open: async (page) => {
        await openMaterial(page, MDF);
        return availabilityAction(page);
      },
    },
    {
      name: "an accessory",
      open: async (page) => {
        await openAccessory(page, DRYING_RACK);
        return availabilityAction(page);
      },
    },
  ];

  for (const screen of screens) {
    test(`${viewport.label}: ${screen.name}: the availability button keeps its look hovered and focused`, async ({
      page,
    }) => {
      await openClass(page, STANDARD);
      const drawnOff = await lookOf(deleteClassButton(page, words));
      const toggle = await screen.open(page);
      const isOff = (await toggle.getAttribute("aria-disabled")) === "true";
      const failures: string[] = [];

      await toggle.focus();
      failures.push(
        ...differences("focused", await lookOf(toggle), drawnOff, isOff),
      );
      expect(
        await toggle.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        "a focused control shows where focus is, off or not",
      ).not.toBe("none");
      await page.mouse.move(0, 0);
      await toggle.hover();
      failures.push(
        ...differences("hovered", await lookOf(toggle), drawnOff, isOff),
      );
      expect(failures).toEqual([]);
    });
  }

  test(`${viewport.label}: taking aria-disabled off an availability button that was off draws it live, so the comparison tells the two apart`, async ({
    page,
  }) => {
    await openClass(page, STANDARD);
    const drawnOff = await lookOf(deleteClassButton(page, words));
    await openClass(page, STANDARD);
    const toggle = availabilityAction(page);
    expect(await toggle.getAttribute("aria-disabled")).toBe("true");

    await setAttribute(toggle, "aria-disabled", "false");

    const look = await lookOf(toggle);
    expect(look.backgroundColor).not.toBe(drawnOff.backgroundColor);
    expect(look.cursor).toBe("pointer");
  });
}

function differences(
  state: string,
  look: Look,
  drawnOff: Look,
  isOff: boolean,
): string[] {
  const sameAsOff =
    look.color === drawnOff.color &&
    look.backgroundColor === drawnOff.backgroundColor &&
    look.borderColor === drawnOff.borderColor &&
    look.cursor === drawnOff.cursor;
  if (isOff && !sameAsOff) {
    return [
      `${state}: off, yet ${JSON.stringify(look)} is not ${JSON.stringify(drawnOff)}`,
    ];
  }
  const looksOff =
    look.backgroundColor === drawnOff.backgroundColor ||
    look.cursor === drawnOff.cursor;
  if (!isOff && looksOff) {
    return [`${state}: live, yet ${JSON.stringify(look)} borrows the off look`];
  }
  return [];
}

function setAttribute(
  control: Locator,
  name: string,
  value: string,
): Promise<void> {
  return control.evaluate(
    (element, [attribute, next]) => {
      element.setAttribute(attribute ?? "", next ?? "");
    },
    [name, value],
  );
}

function lookOf(control: Locator): Promise<Look> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      cursor: style.cursor,
    };
  });
}
