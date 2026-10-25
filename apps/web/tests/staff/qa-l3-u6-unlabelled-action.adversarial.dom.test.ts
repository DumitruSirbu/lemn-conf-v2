// @vitest-environment happy-dom
//
// A domain that is one action ahead of the page (wave L3-U6): the closed list of actions is the domain's, the words are the
// catalogue's, and a build can carry the first without the second. The domain is doubled here with a seventh action that
// the catalogue has no words for; the page must stay up, tell the row as an action it does not know with the code as text,
// keep the six it does know in their own words, and still let the person filter by the new one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { allIn, requireIn, type TestLocale } from "../support/render-with-intl";
import { wireAuditEvent, wireAuditPage } from "../support/staff-audit-wire";

import {
  ROWS,
  setUpAuditHarness,
  type AuditHarness,
} from "./qa-l3-u6-harness.adversarial";

const NEW_ACTION = "note-exported";

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  const actions = [...actual.STAFF_AUDIT_ACTIONS, "note-exported"];
  return {
    ...actual,
    STAFF_AUDIT_ACTIONS: actions,
    isStaffAuditAction: (value: unknown) => actions.includes(value as string),
    readStaffAuditEntry: (action: unknown, detail: unknown) =>
      action === "note-exported"
        ? { ok: true, entry: { action, detail: null } }
        : actual.readStaffAuditEntry(action, detail),
  };
});

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const ISOLATE_OPEN = String.fromCodePoint(0x2068);
const ISOLATE_CLOSE = String.fromCodePoint(0x2069);

let harness: AuditHarness;

beforeEach(() => {
  harness = setUpAuditHarness();
});

afterEach(() => {
  harness.tearDown();
});

describe.each(LOCALES)(
  "an action the catalogue has no words for, in %s",
  (locale) => {
    const words = CATALOGUES[locale].staffAudit;

    beforeEach(async () => {
      harness.answers((request) => {
        const asked = request.url.searchParams.get("action");
        return {
          body: wireAuditPage(
            asked === NEW_ACTION
              ? [recognisedRow(1, NEW_ACTION)]
              : [
                  recognisedRow(1, NEW_ACTION),
                  recognisedRow(2, "kitchen-opened"),
                  recognisedRow(3, "audit-viewed", {
                    page: 1,
                    rowCount: 2,
                    hasActorFilter: false,
                    hasActionFilter: false,
                    hasDateFilter: false,
                  }),
                ],
          ),
        };
      });
      await harness.mount({ locale, width: "desktop" });
    });

    function recognisedRow(
      serial: number,
      action: string,
      detail: unknown = null,
    ) {
      return wireAuditEvent(serial, {
        entry: { kind: "recognised", action, detail },
      });
    }

    it("tells the row as an action it does not know, with the code as text, and the other rows in their own words", () => {
      const [unlabelled, opened, viewed] = allIn(harness.container(), ROWS);
      const cell = (row: HTMLElement | undefined) =>
        allIn(row ?? document.body, "td")[2];

      expect(cell(unlabelled)?.textContent).toBe(
        `${words.actionUnknown}${ISOLATE_OPEN}${NEW_ACTION}${ISOLATE_CLOSE}`,
      );
      expect(cell(opened)?.textContent).toBe(words.actionKitchenOpened);
      expect(cell(viewed)?.textContent).toBe(words.actionAuditViewed);
    });

    it("offers the action in the menu in some words, after the six, and asks for it by its code", async () => {
      const select = harness.actionSelect();
      const options = allIn<HTMLOptionElement>(select, "option");

      expect(options).toHaveLength(8);
      expect(options[0]?.textContent).toBe(words.filterActionAll);
      expect(options[1]?.textContent).toBe(words.actionKitchenOpened);
      const added = options.at(-1);
      expect(added?.value).toBe(NEW_ACTION);
      expect(added?.textContent).toMatch(/\S/u);
      expect(added?.textContent).not.toMatch(/undefined|null/u);

      await harness.choose(select, NEW_ACTION);

      expect(harness.queries().at(-1)).toEqual({
        page: "1",
        action: NEW_ACTION,
      });
      expect(allIn(harness.container(), ROWS)).toHaveLength(1);
      expect(requireIn(harness.container(), "h1").textContent).toBe(
        words.title,
      );
    });
  },
);
