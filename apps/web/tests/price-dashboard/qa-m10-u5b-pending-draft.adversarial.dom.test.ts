// @vitest-environment happy-dom
//
// Adversarial QA of the pending page: drafts the page must stay usable under, and answers that arrive out of the order
// they were asked in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyChanges, type DraftChange } from "@lemnaria/configurator-domain";

import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

import { allIn, typeInto } from "../support/render-with-intl";
import {
  deferred,
  inputWithDraft,
  mountDesk,
  pressKey,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  askToPublish,
  BASE_ANCHOR,
  openFieldOf,
  stateAt,
  TWO_AMOUNT_ROWS,
} from "./qa-m10-u5b-support";
import {
  ACTIVE,
  change,
  createTierChanges,
  NEW_TIER,
} from "./publish-structural-rows.support";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DISCARD_ACTION = roCopy("priceDashboard.publish.discardAction");
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

describe("a draft that creates a class and deletes it again", () => {
  const CREATED_AND_DELETED: readonly DraftChange[] = [
    ...createTierChanges(),
    change(
      { kind: "item-deleted", item: { kind: "hardware", tierId: NEW_TIER } },
      true,
    ),
  ];

  it("is a draft the domain accepts", () => {
    expect(applyChanges(ACTIVE, CREATED_AND_DELETED).ok).toBe(true);
  });

  it("is not left counted as pending with no row to take back and no way to give it up", async () => {
    mounted = await mountDesk({ input: inputWithDraft(CREATED_AND_DELETED) });
    const { container } = mounted;

    const countedAsPending =
      container.querySelector(PENDING_CHIP)?.textContent ?? "";
    const hasArrow = allIn(container, '[data-testid="diff-revert"]').length > 0;
    const hasDiscard = allIn(container, "button").some(
      (button) => button.textContent === DISCARD_ACTION,
    );
    const hasEmptyPage =
      container.querySelector('[data-testid="publish-empty"]') !== null;

    expect(
      hasArrow || hasDiscard || hasEmptyPage,
      `the page counts "${countedAsPending}" pending and offers neither an arrow, nor the discard, nor the empty page`,
    ).toBe(true);
  });
});

describe("two reads of the state that answer out of the order they were asked in", () => {
  it("leave the newer one standing, so the next write names the newest revision the page was told", async () => {
    const reads = [
      deferred<DashboardStateWire | undefined>(),
      deferred<DashboardStateWire | undefined>(),
    ];
    let asked = 0;
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () => Promise.resolve({ kind: "conflict" }),
        change: () => Promise.resolve({ kind: "conflict" }),
        readState: () => {
          const answer = reads[asked];
          asked += 1;
          return answer?.promise ?? Promise.resolve(undefined);
        },
      }),
    });
    const { container, client } = mounted;
    await askToPublish(container);
    expect(asked, "the publish's conflict read the state").toBe(1);

    const field = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(field, "1230");
    await pressKey(field, "Enter");
    expect(asked, "the write's conflict read it again").toBe(2);

    reads[1]?.resolve(stateAt("8"));
    await settle();
    reads[0]?.resolve(stateAt("7"));
    await settle();
    await pressKey(field, "Enter");

    const lastWrite = client.change.mock.calls.at(-1)?.[0];
    expect(client.change.mock.calls.length).toBeGreaterThan(1);
    expect(lastWrite?.expectedDraftRevision).toBe("8");
  });
});

describe("a publish whose fresh read names a later version than the one just published", () => {
  it("does not say that version's name for this version's number", async () => {
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    const published = input.state.active.sequenceNumber + 1;
    const later = stateAt("9");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () =>
          Promise.resolve({
            kind: "published",
            published: {
              versionId: "mine",
              sequenceNumber: published,
              availabilityRevision: "a",
            },
          }),
        readState: () =>
          Promise.resolve({
            ...later,
            active: {
              ...later.active,
              versionId: "version-of-somebody-else",
              sequenceNumber: published + 1,
              label: "Cineva altcineva",
            },
          }),
      }),
    });
    const { container } = mounted;

    await askToPublish(container);
    await settle();

    const notice =
      container.querySelector('[data-testid="publish-notice"]')?.textContent ??
      "";
    expect(notice).toContain(String(published));
    expect(
      notice,
      "the notice names version " +
        String(published) +
        " by the label of the next one",
    ).not.toContain("Cineva altcineva");
  });
});
