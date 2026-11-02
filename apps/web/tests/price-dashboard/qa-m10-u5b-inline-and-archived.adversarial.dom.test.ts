// @vitest-environment happy-dom
//
// Adversarial QA of the "Nou" fields of the pending list and of the rows of an archived version's diff (U5b): fields left
// open while the list moves under them, and no field, arrow or price button anywhere on a diff that takes nothing back.
import { createElement } from "react";
import fc from "fast-check";
import { applyChanges, type DraftChange } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DiffSections } from "@/price-dashboard/publish-rows";
import {
  describeVersionDiff,
  readPendingDraft,
} from "@/price-dashboard/publish-model";

import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  pressKey,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { applicableDrafts } from "./qa-m10-u5b-drafts";
import {
  anchorOf,
  BASE_ANCHOR,
  LEI,
  openFieldOf,
  rowOfRule,
  stateAt,
  TWO_AMOUNT_ROWS,
  WALL_ANCHOR,
} from "./qa-m10-u5b-support";
import { roCopy } from "./romanian-copy";
import { ACTIVE, CABINET_NAMES } from "./publish-structural-rows.support";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

let mounted: MountedDesk | undefined;
let bare: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  bare?.unmount();
  mounted = undefined;
  bare = undefined;
  leaveTheStaffServer();
});

const typedLei = (ruleId: string, rise: number): string =>
  String((anchorOf(ruleId) + rise * LEI) / LEI);

async function mountTwoRows(
  replace: Parameters<typeof spiedPublishClient>[1] = {},
): Promise<MountedDesk> {
  const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
  });
  return mounted;
}

describe("two fields open at once", () => {
  it("send only the one Enter was pressed in, and leave the other open with what was typed in it", async () => {
    const { container, client } = await mountTwoRows();
    const first = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(first, typedLei(BASE_ANCHOR.ruleId, 90));
    const second = openFieldOf(container, WALL_ANCHOR.ruleId);
    typeInto(second, typedLei(WALL_ANCHOR.ruleId, 70));

    await pressKey(first, "Enter");

    expect(client.change).toHaveBeenCalledTimes(1);
    expect(client.change.mock.calls[0]?.[0].change.address).toEqual(
      BASE_ANCHOR,
    );
    const stillOpen = requireIn<HTMLInputElement>(
      rowOfRule(container, WALL_ANCHOR.ruleId),
      "input",
    );
    expect(stillOpen.value).toBe(typedLei(WALL_ANCHOR.ruleId, 70));
  });

  it("keep their text when another row is taken back with its arrow", async () => {
    const { container } = await mountTwoRows();
    const open = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(open, typedLei(BASE_ANCHOR.ruleId, 90));

    click(
      requireIn(
        rowOfRule(container, WALL_ANCHOR.ruleId),
        '[data-testid="diff-revert"]',
      ),
    );
    await settle();

    expect(() => rowOfRule(container, WALL_ANCHOR.ruleId)).toThrow();
    expect(
      requireIn<HTMLInputElement>(
        rowOfRule(container, BASE_ANCHOR.ruleId),
        "input",
      ).value,
    ).toBe(typedLei(BASE_ANCHOR.ruleId, 90));
  });
});

describe("a row that is gone from the list while its field is open", () => {
  it("takes its field with it and leaves the page and the other field standing", async () => {
    const { container } = await mountTwoRows({
      change: () => Promise.resolve({ kind: "conflict" }),
      readState: () => Promise.resolve(stateAt("2", TWO_AMOUNT_ROWS.slice(1))),
    });
    openFieldOf(container, BASE_ANCHOR.ruleId);
    const survivor = openFieldOf(container, WALL_ANCHOR.ruleId);
    typeInto(survivor, typedLei(WALL_ANCHOR.ruleId, 70));

    await pressKey(survivor, "Enter");

    expect(container.querySelector('[data-testid="publish-page"]')).not.toBe(
      null,
    );
    expect(() => rowOfRule(container, BASE_ANCHOR.ruleId)).toThrow();
    expect(
      rowOfRule(container, WALL_ANCHOR.ruleId).querySelector('[role="alert"]')
        ?.textContent,
    ).toBe(roCopy("priceDashboard.errors.changedMeanwhile"));
  });
});

describe("an archived version's diff", () => {
  const COLUMNS = {
    before: roCopy("priceDashboard.publish.columnActive"),
    after: roCopy("priceDashboard.publish.columnNew"),
  };

  function drawn(
    draft: readonly DraftChange[],
    isArchived: boolean,
  ): HTMLElement {
    const applied = applyChanges(ACTIVE, draft);
    if (!applied.ok) throw new Error("the draft does not apply");
    const pending = readPendingDraft({
      active: ACTIVE,
      changes: draft,
      cabinetNames: CABINET_NAMES,
    });
    if (pending.kind !== "ready") throw new Error("the draft is not listed");
    bare = mountInCatalogue(
      createElement(DiffSections, {
        sections: isArchived
          ? describeVersionDiff({
              before: ACTIVE,
              after: applied.book,
              changes: draft,
              cabinetNames: CABINET_NAMES,
            })
          : pending.view.sections,
        columns: COLUMNS,
        onRevert: isArchived ? undefined : () => undefined,
        onSaveAmount: isArchived
          ? undefined
          : () => Promise.resolve({ kind: "saved" as const }),
        isBusy: false,
      }),
      "ro",
    );
    return bare.container;
  }

  const HANDLES = [
    "input",
    'button[class*="priceButton"]',
    '[data-testid="diff-revert"]',
  ];

  it("shows the control the pending list shows, when it is handed the means to write (the sweep below can fail)", () => {
    const container = drawn(TWO_AMOUNT_ROWS, false);

    expect(allIn(container, 'button[class*="priceButton"]')).not.toEqual([]);
    expect(allIn(container, '[data-testid="diff-revert"]')).not.toEqual([]);
  });

  it("draws no field, no price button and no arrow, whatever rows the two books differ by", () => {
    fc.assert(
      fc.property(applicableDrafts, (draft) => {
        const container = drawn(draft, true);

        for (const handle of HANDLES) {
          expect(allIn(container, handle), handle).toEqual([]);
        }
        bare?.unmount();
        bare = undefined;
      }),
      { numRuns: 40 },
    );
  });
});
