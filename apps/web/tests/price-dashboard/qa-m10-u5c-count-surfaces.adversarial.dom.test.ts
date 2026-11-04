// @vitest-environment happy-dom
//
// One draft, one number: the bar's chip, the menu's badge, the tab, the phone's sentence, the publish button, the
// confirmation and the history's waiting row all say how many prices wait, and the row the publish leaves in the history
// says the same number the person confirmed.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { countPendingPrices } from "@/price-dashboard/pending-price-count";

import {
  allIn,
  byWords,
  click,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import {
  change,
  createAccessoryChange,
  createTierChanges,
  firstNamedBuildId,
  NEW_ACCESSORY,
} from "./publish-structural-rows.support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ANCHOR = change(
  { kind: "cabinet", ruleId: "cabinet.base-cabinet", field: "anchorMinor" },
  400_000,
);
const BULK_OF_TWO: readonly DraftChange[] = [
  "base-cabinet",
  "wall-cabinet",
].map(
  (rule) =>
    ({
      address: {
        kind: "cabinet",
        ruleId: `cabinet.${rule}`,
        field: "perStepNarrowerMinor",
      },
      value: 1_500,
      groupId: "group-1",
      bulk: { percent: 5, scope: "all" },
    }) as DraftChange,
);
const MIXED: readonly DraftChange[] = [
  ANCHOR,
  ...BULK_OF_TWO,
  ...createTierChanges(),
  createAccessoryChange(firstNamedBuildId()),
  change(
    { kind: "accessory", accessoryId: NEW_ACCESSORY, field: "perUnitMinor" },
    9_000,
  ),
];

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

const dialog = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[role="alertdialog"]');
  if (found === null) throw new Error("no dialog is open");
  return found;
};

describe("a draft mixing a single price, a bulk action, a created class and a created accessory", () => {
  it("says the same number on the chip, the badge, the tab, the phone's sentence, the button and the confirmation", async () => {
    const expected = countPendingPrices(MIXED);
    const input = inputWithDraft(MIXED);
    mounted = await mountDesk({ input });
    const { container } = mounted;

    const chip = requireIn(container, '[data-testid="staff-pending-prices"]');
    const badge = allIn<HTMLAnchorElement>(
      requireIn(container, '[data-testid="staff-nav"]'),
      "a",
    ).find((link) => link.href.endsWith("/staff/catalog/publish"));
    const tab = byWords(
      container,
      "a",
      `${roCopy("priceDashboard.publish.tabPending")}${String(expected)}`,
    );
    const button = byWords(
      container,
      "button",
      roCopy("priceDashboard.publish.publishAction", { count: expected }),
    );

    expect(expected).toBe(1 + 2 + 1 + 1);
    expect(chip.textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: expected }),
    );
    expect(badge?.getAttribute("aria-label")).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: expected }),
    );
    expect(tab.textContent).toContain(String(expected));
    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.subtitleMobile", { count: expected }),
    );
    expect(button.getAttribute("aria-disabled")).toBeNull();

    typeInto(
      requireIn<HTMLInputElement>(container, 'input[type="text"]'),
      "Toamna",
    );
    click(button);
    await settle();
    expect(dialog().textContent).toContain(
      roCopy("priceDashboard.publish.confirmBody", { count: expected }).slice(
        0,
        40,
      ),
    );
  });

  it("leaves the version the publish made with the number the person confirmed, in the history's row", async () => {
    const expected = countPendingPrices(MIXED);
    const input = inputWithDraft(MIXED);
    const client = spiedPublishClient(input, {
      readState: () => Promise.resolve(undefined),
      publish: () =>
        Promise.resolve({
          kind: "published",
          published: {
            versionId: "v".repeat(21),
            sequenceNumber: 3,
            availabilityRevision: "9",
          },
        }),
    });
    mounted = await mountDesk({ input, client });
    const { container } = mounted;
    typeInto(
      requireIn<HTMLInputElement>(container, 'input[type="text"]'),
      "Toamna",
    );
    click(requireIn(container, '[class*="primary"]'));
    await settle();
    click(
      byWords(
        dialog(),
        "button",
        roCopy("priceDashboard.publish.confirmAction"),
      ),
    );
    await settle();

    const row = requireIn(
      container,
      '[data-testid="version-row"][data-state="active"]',
    );

    expect(row.textContent).toContain(
      roCopy("priceDashboard.publish.changeCount", { count: expected }),
    );
  });
});
