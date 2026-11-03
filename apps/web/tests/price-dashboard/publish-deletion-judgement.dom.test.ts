// @vitest-environment happy-dom
//
// A draft that deletes a row is judged on the page before a publish is asked for, from the counts of the saved kitchens that
// use the row. Without counts the publish is off and says it cannot check; with them a used row blocks it before anything is
// sent, and a row nobody uses goes through to the confirmation.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishPageInput } from "@/price-dashboard/publish-model";

import {
  byWords,
  click,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DELETED_TIER = "hardware.soft-close";
const DELETED = { kind: "hardware", tierId: DELETED_TIER } as const;
const DELETION = {
  address: { kind: "item-deleted", item: DELETED },
  value: true,
} as DraftChange;
const CANNOT_JUDGE = roCopy("priceDashboard.lifecycle.cannotJudge");

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

function withCounts(designCount?: number): PublishPageInput {
  const input = inputWithDraft([DELETION]);
  return designCount === undefined
    ? input
    : {
        ...input,
        deletionFacts: {
          usage: [{ item: DELETED, designCount }],
          defaults: {},
        },
      };
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

async function askToPublish(desk: MountedDesk): Promise<void> {
  typeInto(
    requireIn<HTMLInputElement>(desk.container, 'input[type="text"]'),
    "Ajustari",
  );
  click(requireIn(desk.container, '[class*="primary"]'));
  await settle();
}

describe("a deletion whose use cannot be counted", () => {
  it("turns the publish off and says it cannot check, and asking sends nothing", async () => {
    mounted = await mountDesk({ input: withCounts() });
    const button = requireIn(mounted.container, '[class*="primary"]');

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(mounted.container.textContent).toContain(CANNOT_JUDGE);

    await askToPublish(mounted);

    expect(dialog()).toBeNull();
    expect(mounted.client.publish).not.toHaveBeenCalled();
  });

  it("is judged again when the draft changes: a draft that deletes nothing publishes without counts", async () => {
    const input = inputWithDraft([
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.base-cabinet",
          field: "anchorMinor",
        },
        value: 400_000,
      } as DraftChange,
    ]);
    mounted = await mountDesk({ input });

    expect(mounted.container.textContent).not.toContain(CANNOT_JUDGE);
    expect(
      requireIn(mounted.container, '[class*="primary"]').getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
  });
});

describe("a deletion with the counts of the saved kitchens", () => {
  it("is blocked by use before anything is sent, naming the row", async () => {
    mounted = await mountDesk({ input: withCounts(4) });
    expect(mounted.container.textContent).not.toContain(CANNOT_JUDGE);

    await askToPublish(mounted);

    expect(dialog()).toBeNull();
    expect(mounted.client.publish).not.toHaveBeenCalled();
    expect(
      requireIn(mounted.container, '[data-testid="publish-notice"]')
        .textContent,
    ).toContain(
      roCopy("priceDashboard.publish.blockedInUse", { name: "Hettich" }),
    );
  });

  it("asks the confirmation when no saved kitchen uses the row", async () => {
    mounted = await mountDesk({ input: withCounts(0) });

    await askToPublish(mounted);

    expect(dialog()).not.toBeNull();
    expect(
      byWords(
        requireDialog(),
        "button",
        roCopy("priceDashboard.publish.confirmAction"),
      ).isConnected,
    ).toBe(true);
  });
});
