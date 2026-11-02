// @vitest-environment happy-dom
//
// The page while it reads the state again after a refusal as `changed-meanwhile`: it takes no write meanwhile, so the
// next publish names what the read found; it says the data was read again only when it was; and a publish whose own
// read failed leaves the page as published.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";
import type { PublishClient } from "@/price-dashboard/publish-client";

import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  deferred,
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { askToPublish, stateAt, TWO_AMOUNT_ROWS } from "./qa-m10-u5b-support";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DISCARD_ACTION = roCopy("priceDashboard.publish.discardAction");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");
const CHANGED_MEANWHILE = roCopy("priceDashboard.errors.changedMeanwhile");
const NOTICE = '[data-testid="publish-notice"]';
const NEGATIVE_ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: -1,
} as DraftChange;

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

const requireDialog = (): HTMLElement =>
  requireIn(document.body, '[role="alertdialog"]');

const noticeText = (container: HTMLElement): string =>
  requireIn(container, NOTICE).textContent;

function withAvailabilityRevision(
  state: DashboardStateWire,
  revision: string,
): DashboardStateWire {
  return {
    ...state,
    active: {
      ...state.active,
      availability: { ...state.active.availability, revision },
    },
  };
}

describe("a publish refused as changed meanwhile, while the state is read again", () => {
  it("takes no row back meanwhile, so the next publish names the availability revision the read found", async () => {
    const read = deferred<DashboardStateWire | undefined>();
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    const publish = vi
      .fn<PublishClient["publish"]>()
      .mockResolvedValue({ kind: "conflict" });
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish,
        readState: () => read.promise,
      }),
    });
    const { container, client } = mounted;
    await askToPublish(container);

    const arrow = allIn(container, '[data-testid="diff-revert"]')[0];
    expect(arrow?.getAttribute("aria-disabled")).toBe("true");
    if (arrow !== undefined) click(arrow);
    await settle();
    read.resolve(withAvailabilityRevision(stateAt("1"), "moved-on"));
    await settle();
    await askToPublish(container);

    expect(client.revert).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.[0].expectedAvailabilityRevision).toBe(
      "moved-on",
    );
  });
});

describe("what the page says when the state could not be read again", () => {
  it("says nothing was saved after a publish refused as changed meanwhile", async () => {
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () => Promise.resolve({ kind: "conflict" }),
        readState: () => Promise.resolve(undefined),
      }),
    });

    await askToPublish(mounted.container);

    expect(noticeText(mounted.container)).toContain(SAVE_FAILED);
    expect(noticeText(mounted.container)).not.toContain(CHANGED_MEANWHILE);
  });

  it("says nothing was saved after a discard refused as changed meanwhile", async () => {
    const input = inputWithDraft([NEGATIVE_ANCHOR], "7");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        discardDraft: () => Promise.resolve({ kind: "conflict" }),
        readState: () => Promise.resolve(undefined),
      }),
    });
    click(byWords(mounted.container, "button", DISCARD_ACTION));
    await settle();
    click(byWords(requireDialog(), "button", DISCARD_ACTION));
    await settle();

    expect(noticeText(mounted.container)).toContain(SAVE_FAILED);
    expect(noticeText(mounted.container)).not.toContain(CHANGED_MEANWHILE);
  });

  it("says the data was read again when it was", async () => {
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () => Promise.resolve({ kind: "conflict" }),
        readState: () => Promise.resolve(stateAt("2")),
      }),
    });

    await askToPublish(mounted.container);

    expect(noticeText(mounted.container)).toContain(CHANGED_MEANWHILE);
  });
});

describe("a publish whose own read of the state failed", () => {
  it("leaves the page as published: the draft is gone and the version is named", async () => {
    const input = inputWithDraft(TWO_AMOUNT_ROWS, "1");
    const published = input.state.active.sequenceNumber + 1;
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
        readState: () => Promise.resolve(undefined),
      }),
    });

    await askToPublish(mounted.container);

    expect(noticeText(mounted.container)).toContain(String(published));
    expect(
      allIn(mounted.container, '[data-testid="diff-row"]'),
      "no row of the draft is left",
    ).toHaveLength(0);
  });
});
