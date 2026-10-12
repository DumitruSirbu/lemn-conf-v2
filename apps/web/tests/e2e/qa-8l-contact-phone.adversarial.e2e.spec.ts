// Wave 8L's phone acceptance, as far as a headless browser can make it (the plan's point 4, *Phone acceptance*): at
// 390 x 844 and with the viewport cut to 390 x 500 to stand in for the on-screen keyboard, in Romanian and Russian, by
// touch, the focused field and its error lie above the pinned region and the call to action and the consent line stay
// reachable; the longest Russian text does not overflow the page; the honeypot is out of the tab order and the tree.
// The screens (4A, 4B, 4C, the no-design form) are captured where `QA_EVIDENCE_DIR` says. Nothing here counts a request:
// every answer is made by `page.route` and the server is not reached. What a headless browser cannot prove, and is
// left to 8T's phone gate: the real on-screen keyboard, and real autofill.
import { expect, type Locator, type Page } from "@playwright/test";

import {
  ANSWERS,
  answerContactWith,
  BOTTOM,
  callbackPath,
  CONSENT,
  contactDocumentPath,
  CTA,
  expectFormDrawn,
  fillTheTextFields,
  fillTheWholeForm,
  field,
  MESSAGES,
  OUTCOME,
  pressTheCallToAction,
  recordContactRequests,
  SENDING_LINE,
  typeInto,
  chooseChannel,
} from "./support/contact-page";
import { captureEvidence, historyLength } from "./support/qa-8d-review";
import { test } from "./support/seeded-design";

const LOCALES = ["ro", "ru"] as const;
type Locale = (typeof LOCALES)[number];
const PHONE_WIDTH = { width: 390, height: 844 } as const;
const KEYBOARD_UP = { width: 390, height: 500 } as const;
const HALF_THE_VIEWPORT = PHONE_WIDTH.height / 2;

/** A name of exactly the limit, in Cyrillic: the widest letters a Russian customer types, with no spaces to wrap at. */
const LONGEST_RUSSIAN_NAME = "Щ".repeat(100);
const LONGEST_RUSSIAN_LOCALITY = "Ж".repeat(100);

async function regionTop(page: Page): Promise<number> {
  const box = await page.getByTestId(BOTTOM).boundingBox();
  if (box === null) throw new Error("the pinned region has no box");
  return box.y;
}

async function blockOf(
  input: Locator,
): Promise<{ top: number; bottom: number }> {
  return input.evaluate((element) => {
    const rect = (
      element.closest("[data-field-block]") ?? element
    ).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}

async function expectFieldClearOfTheRegion(
  page: Page,
  input: Locator,
): Promise<void> {
  const block = await blockOf(input);
  const top = await regionTop(page);
  expect(
    block.bottom,
    "the field and its error end above the region",
  ).toBeLessThanOrEqual(top);
  expect(block.top, "the field starts on the screen").toBeGreaterThanOrEqual(0);
}

async function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("name") ?? null,
  );
}

async function openForm(page: Page, locale: Locale, id: string): Promise<void> {
  await page.setViewportSize(PHONE_WIDTH);
  await page.goto(contactDocumentPath(locale, id));
  await expectFormDrawn(page);
}

for (const locale of LOCALES) {
  const words = MESSAGES[locale].contact;

  test.describe(`${locale}: the form on a phone`, () => {
    test("4A, then a refused press: nothing is sent, focus goes field by field in order, each clear of the pinned region", async ({
      page,
      seededDesign,
    }) => {
      const sent = recordContactRequests(page);
      await openForm(page, locale, seededDesign.id);
      await captureEvidence(page, `8l-4A-${locale}`);

      await pressTheCallToAction(page);
      expect(await focusedName(page)).toBe("name");
      await expectFieldClearOfTheRegion(page, field(page, "name"));
      await expect(page.getByTestId(CONSENT).getByRole("alert")).toHaveText(
        new RegExp(words.fieldErrors.CONSENT_NOT_GIVEN),
      );
      await captureEvidence(page, `8l-4B-${locale}-refused-press`);

      await typeInto(page, "name", "Ana");
      await pressTheCallToAction(page);
      expect(await focusedName(page)).toBe("phone");
      await expectFieldClearOfTheRegion(page, field(page, "phone"));

      await typeInto(page, "phone", "06912");
      await field(page, "locality").tap();
      await expect(
        page.locator("form").getByRole("alert").filter({
          hasText: words.fieldErrors.PHONE_MOLDOVAN_INCOMPLETE,
        }),
      ).toHaveCount(1);
      await captureEvidence(page, `8l-4B-${locale}-phone-incomplete`);

      await typeInto(page, "phone", "069123456");
      await pressTheCallToAction(page);
      expect(await focusedName(page)).toBe("consent");
      expect(sent).toEqual([]);
    });

    test("with the viewport cut to 390 x 500 each field a finger lands on, and its error, lies above the pinned region, and the call to action and the consent stay on the screen", async ({
      page,
      seededDesign,
    }) => {
      await openForm(page, locale, seededDesign.id);
      await page.setViewportSize(KEYBOARD_UP);
      await chooseChannel(page, "email");

      for (const name of ["name", "phone", "locality", "email"] as const) {
        const input = field(page, name);
        await input.tap();
        expect(await focusedName(page)).toBe(name);
        await expectFieldClearOfTheRegion(page, input);
        // An invalid value typed: the field is still the focused one and still clear of the region.
        await input.fill(
          name === "email" ? "no-at-sign" : name === "phone" ? "1" : "x",
        );
        expect(await focusedName(page)).toBe(name);
        await expectFieldClearOfTheRegion(page, input);
      }

      for (const reachable of [CTA, CONSENT]) {
        const box = await page.getByTestId(reachable).boundingBox();
        expect(box, `${reachable} has a box`).not.toBeNull();
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
          KEYBOARD_UP.height,
        );
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
      }
      await captureEvidence(page, `8l-4B-${locale}-keyboard-cut`);
    });

    test("the longest text the fields take, and the longest sentence each answer has, do not make the page wider than the phone or the pinned region taller than half of it", async ({
      page,
      seededDesign,
    }) => {
      const sent = recordContactRequests(page);
      await openForm(page, locale, seededDesign.id);
      await fillTheTextFields(page, {
        name: LONGEST_RUSSIAN_NAME,
        phone: "069123456",
        locality: LONGEST_RUSSIAN_LOCALITY,
      });
      await page.locator('input[name="consent"]').tap();
      const answers = [
        ANSWERS.conflict,
        ANSWERS.unavailable,
        ANSWERS.limited("86400"),
        ANSWERS.designNotCurrent,
        ANSWERS.doesNotFit,
      ] as const;
      let next = 0;
      await answerContactWith(page, (route) => {
        const answer = answers[Math.min(next, answers.length - 1)];
        next += 1;
        if (answer === undefined) throw new Error("no answer");
        return answer(route);
      });

      const measure = async (label: string): Promise<void> => {
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `${label}: the page's width`,
        ).toBeLessThanOrEqual(overflow.clientWidth);
        const region = await page.getByTestId(BOTTOM).boundingBox();
        expect(
          region?.height ?? Infinity,
          `${label}: the pinned region`,
        ).toBeLessThanOrEqual(HALF_THE_VIEWPORT);
        expect((region?.y ?? 0) + (region?.height ?? 0)).toBeLessThanOrEqual(
          PHONE_WIDTH.height,
        );
      };

      await measure("before any answer");
      await pressTheCallToAction(page);
      await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
        "data-outcome",
        "conflict",
      );
      await measure("a conflict");
      await captureEvidence(page, `8l-outcome-${locale}-conflict`);
      await pressTheCallToAction(page);
      await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
        "data-outcome",
        "failed",
      );
      await measure("the failed sentence");
      await pressTheCallToAction(page);
      await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
        "data-outcome",
        "limited",
      );
      await measure("a limited send");
      expect(sent).toHaveLength(3);
      expect(sent[0]?.body.locale).toBe(locale);
      expect(sent[0]?.body.contact).toMatchObject({
        name: LONGEST_RUSSIAN_NAME,
        locality: LONGEST_RUSSIAN_LOCALITY,
      });
      await captureEvidence(page, `8l-outcome-${locale}-limited`);
    });

    test("4C: while the answer is held the fields are dimmed and inert with their text readable, and the sending line stands in the region", async ({
      page,
      seededDesign,
    }) => {
      await openForm(page, locale, seededDesign.id);
      await fillTheWholeForm(page, {
        name: LONGEST_RUSSIAN_NAME,
        phone: "069123456",
        locality: "Chisinau",
      });
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await answerContactWith(page, async (route) => {
        await held;
        await ANSWERS.sent("LM-4C")(route);
      });

      await pressTheCallToAction(page);

      await expect(page.getByTestId(SENDING_LINE)).toHaveText(
        words.sendingLine,
      );
      await expect(page.getByTestId(CTA)).toHaveText(words.sending);
      await expect(page.locator("[inert]")).toHaveCount(2);
      expect(await field(page, "name").inputValue()).toBe(LONGEST_RUSSIAN_NAME);
      const region = await page.getByTestId(BOTTOM).boundingBox();
      expect(region?.height ?? Infinity).toBeLessThanOrEqual(HALF_THE_VIEWPORT);
      await captureEvidence(page, `8l-4C-${locale}`);
      release();
      await expect(page.getByTestId("contact-sent")).toBeVisible();
    });

    test("the form with no design: the heading and the sending line are the no-design ones, there is no card, and the bar leads to the start", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE_WIDTH);
      await page.goto(callbackPath(locale));
      await expectFormDrawn(page);

      await expect(page.getByTestId("contact-design-card")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveText(
        locale === "ro" ? "Cum te putem contacta?" : "Как с тобой связаться?",
      );
      await expect(page.getByTestId("contact-back")).not.toHaveAttribute(
        "href",
        /\/review/,
      );
      await captureEvidence(page, `8l-no-design-${locale}`);
    });
  });
}

test.describe("the honeypot", () => {
  test("is not in the tab order, not in the accessibility tree, not display none, and a box of one clipped pixel", async ({
    page,
    seededDesign,
  }) => {
    await openForm(page, "ro", seededDesign.id);
    await chooseChannel(page, "email");

    const tabbed: string[] = [];
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      (document.activeElement as HTMLElement | null)?.blur();
    });
    // Round the whole page and back to where it began: the first press may start from the chip the test tapped.
    let timesAtTheEnd = 0;
    for (let presses = 0; presses < 40 && timesAtTheEnd < 2; presses += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        return active === document.body
          ? "body"
          : `${active?.tagName ?? ""}:${active?.getAttribute("name") ?? ""}`;
      });
      tabbed.push(where);
      if (where === "body") timesAtTheEnd += 1;
    }
    expect(tabbed.length, tabbed.join(" ")).toBeGreaterThan(5);
    expect(tabbed.join(" ")).not.toContain("reference_note");

    const honeypot = field(page, "reference_note");
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
    await expect(honeypot).toHaveAttribute("autocomplete", "off");
    await expect(honeypot.locator("xpath=..")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const snapshot = await page.locator("form").ariaSnapshot();
    expect(snapshot).not.toContain("reference");
    // name, phone, locality and e-mail: the honeypot is the fifth text input and is not among them.
    await expect(page.locator("form").getByRole("textbox")).toHaveCount(4);
    const traits = await honeypot.evaluate((element) => {
      const style = getComputedStyle(element.parentElement ?? element);
      const rect = (element.parentElement ?? element).getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        width: rect.width,
        height: rect.height,
        clip: style.clipPath,
      };
    });
    expect(traits.display).not.toBe("none");
    expect(traits.visibility).not.toBe("hidden");
    expect(traits.width).toBeLessThanOrEqual(1);
    expect(traits.height).toBeLessThanOrEqual(1);
    expect(traits.clip).not.toBe("none");
    // None of the names a browser's autofill reads as a contact field.
    const name = await honeypot.getAttribute("name");
    expect(name).not.toMatch(/name|phone|tel|mail|city|address|locality/i);
  });
});

test.describe("the language menu on the contact page", () => {
  test("a switch to Russian is one more history entry at the same page, drawn in Russian, in a form that sends Russian", async ({
    page,
    seededDesign,
  }) => {
    const sent = recordContactRequests(page);
    await openForm(page, "ro", seededDesign.id);
    const lengthBefore = await historyLength(page);

    await page.getByTestId("top-bar-locale").tap();
    await page.getByTestId("top-bar-locale-option-ru").tap();
    await page.waitForURL(contactDocumentPath("ru", seededDesign.id));
    await expectFormDrawn(page);

    expect(await historyLength(page)).toBe(lengthBefore + 1);
    await expect(page.locator("h1")).toHaveText(MESSAGES.ru.contact.heading);
    await expect(page.getByTestId(CTA)).toHaveText(
      MESSAGES.ru.contact.callToAction,
    );
    await fillTheWholeForm(page, {
      name: "Ana",
      phone: "069123456",
      locality: "Chisinau",
    });
    await answerContactWith(page, ANSWERS.sent("LM-RU"));
    await pressTheCallToAction(page);
    await expect(page.getByTestId("contact-sent")).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body.locale).toBe("ru");
  });
});
