// Wave 8L review fix F3: a limited send tells the time it can be sent again, and says "tomorrow" when that time falls on
// a later day than now on the customer's clock. The browser's clock is fixed with `page.clock.setFixedTime` (the date
// only; timers run) and its zone is Chisinau's, so each case is a time of day that does not depend on when the run is.
// The answer is made by `page.route`; the server is not reached and nothing is counted.
//
// The boundaries are the ones the rule has: a wait that ends today and one that ends tomorrow; a wait ending on the
// last minute of the day and one second after it (the minute is told rounded up, so that second is tomorrow's 00:00);
// 86 400 seconds, the longest a contact wait can be; and 86 401, which is not believed and becomes a minute.
import { expect, test } from "@playwright/test";

import {
  ANSWERS,
  answerContactWith,
  callbackPath,
  expectFormDrawn,
  fillTheWholeForm,
  MESSAGES,
  OUTCOME,
  pressTheCallToAction,
} from "./support/contact-page";

test.use({ timezoneId: "Europe/Chisinau" });

/** Chisinau is at UTC+3 until 25 October 2026. */
function at(time: string): Date {
  return new Date(`2026-10-12T${time}+03:00`);
}

interface Case {
  readonly name: string;
  readonly now: string;
  readonly retryAfter: string;
  readonly told: string;
  readonly isTomorrow: boolean;
}

const CASES: readonly Case[] = [
  {
    name: "half an hour at noon is today",
    now: "12:00:00",
    retryAfter: "1800",
    told: "12:30",
    isTomorrow: false,
  },
  {
    name: "ten minutes and ten seconds is told rounded up, today",
    now: "12:00:10",
    retryAfter: "600",
    told: "12:11",
    isTomorrow: false,
  },
  {
    name: "a whole day is tomorrow, at the same time",
    now: "12:00:00",
    retryAfter: "86400",
    told: "12:00",
    isTomorrow: true,
  },
  {
    name: "ten minutes before midnight, ten minutes is tomorrow's 00:05",
    now: "23:55:00",
    retryAfter: "600",
    told: "00:05",
    isTomorrow: true,
  },
  {
    name: "ending exactly on the day's last minute is still today",
    now: "23:58:30",
    retryAfter: "30",
    told: "23:59",
    isTomorrow: false,
  },
  {
    name: "one second past the day's last minute is tomorrow's 00:00",
    now: "23:58:30",
    retryAfter: "31",
    told: "00:00",
    isTomorrow: true,
  },
  {
    name: "the last second of the day, from midnight, is tomorrow's 00:00",
    now: "00:00:00",
    retryAfter: "86399",
    told: "00:00",
    isTomorrow: true,
  },
  {
    name: "one second more than a day is not believed and becomes a minute, today",
    now: "12:00:00",
    retryAfter: "86401",
    told: "12:01",
    isTomorrow: false,
  },
  {
    name: "no Retry-After at all is a minute, today",
    now: "12:00:00",
    retryAfter: "",
    told: "12:01",
    isTomorrow: false,
  },
];

for (const locale of ["ro", "ru"] as const) {
  const outcomes = MESSAGES[locale].contact.outcomes;

  test.describe(`${locale}: when a limited send can be sent again`, () => {
    for (const testCase of CASES) {
      test(testCase.name, async ({ page }) => {
        await page.clock.setFixedTime(at(testCase.now));
        await page.goto(callbackPath(locale));
        await expectFormDrawn(page);
        await fillTheWholeForm(page, {
          name: "Ana",
          phone: "069123456",
          locality: "Chisinau",
        });
        await answerContactWith(
          page,
          testCase.retryAfter === ""
            ? ANSWERS.limitedWithNoWait
            : ANSWERS.limited(testCase.retryAfter),
        );

        await pressTheCallToAction(page);

        const outcome = page.getByTestId(OUTCOME);
        await expect(outcome).toHaveAttribute("data-outcome", "limited");
        const template = testCase.isTomorrow
          ? outcomes.limitedTomorrow
          : outcomes.limited;
        const other = testCase.isTomorrow
          ? outcomes.limited
          : outcomes.limitedTomorrow;
        await expect(outcome).toHaveText(
          template.replace("{time}", testCase.told),
        );
        // The sentence names the day exactly when the day is not today: the other leaf's wording is not in it.
        expect(await outcome.innerText()).not.toBe(
          other.replace("{time}", testCase.told),
        );
        expect(await outcome.innerText()).not.toMatch(/[{}]|\{time\}/);
      });
    }
  });
}

test("the two leaves differ in the day they name and in nothing else: the same sentence once its day is taken out", () => {
  for (const locale of ["ro", "ru"] as const) {
    const { limited, limitedTomorrow } = MESSAGES[locale].contact.outcomes;

    expect(limitedTomorrow).not.toBe(limited);
    expect(limitedTomorrow).toContain("{time}");
    expect(limited).toContain("{time}");
  }
});
