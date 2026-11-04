// @vitest-environment happy-dom
//
// A session that ends while the person is acting: after a publish went through, on a take-back of a ready price, and on the
// read that follows a conflict. What was already done is told as done, what was not is told as not done, and the staff
// frame's sheet is raised once, keeping what was typed.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import {
  getStaffSessionExpiry,
  raiseStaffSessionExpired,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

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
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: 400_000,
} as DraftChange;
const PUBLISHED = {
  kind: "published",
  published: {
    versionId: "v".repeat(21),
    sequenceNumber: 3,
    availabilityRevision: "9",
  },
} as const;
const NOTICE = '[data-testid="publish-notice"]';

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
  resetStaffSessionExpiryForTests();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const dialog = (): HTMLElement =>
  requireIn(document.body, '[role="alertdialog"]');

async function publishWith(replace: Partial<PublishClient>) {
  const input = inputWithDraft([ANCHOR]);
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
  });
  const { container } = mounted;
  typeInto(
    requireIn<HTMLInputElement>(container, 'input[type="text"]'),
    "Toamna",
  );
  click(requireIn(container, '[class*="primary"]'));
  await settle();
  click(
    byWords(dialog(), "button", roCopy("priceDashboard.publish.confirmAction")),
  );
  await settle();
  return mounted;
}

describe("a session that ends right after a publish went through", () => {
  it("still tells the version is published and lists it, while the sheet asks for the sign-in again", async () => {
    const { container } = await publishWith({
      publish: () => Promise.resolve(PUBLISHED),
      readState: () => {
        raiseStaffSessionExpired({ keepsTypedText: true });
        return Promise.resolve(undefined);
      },
    });

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(requireIn(container, NOTICE).textContent).toContain(
      roCopy("priceDashboard.publish.publishedBody"),
    );
    expect(requireIn(container, NOTICE).textContent).not.toContain(
      roCopy("priceDashboard.publish.failedTitle"),
    );
    expect(
      allIn(container, '[data-testid="version-row"][data-state="active"]'),
    ).toHaveLength(1);
  });
});

describe("a take-back of a ready price the session's end refused", () => {
  it("keeps the price on the page, raises the sheet and says the take-back was not saved", async () => {
    const input = inputWithDraft([ANCHOR]);
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        revert: () => Promise.resolve({ kind: "session-ended" }),
      }),
    });
    const { container } = mounted;

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(allIn(container, '[data-testid="diff-row"]')).toHaveLength(1);
    expect(requireIn(container, NOTICE).textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });
});

describe("a publish refused as changed meanwhile whose re-read ends the session", () => {
  it("raises the sheet, keeps the typed name and tells the data could not be read again", async () => {
    const { container } = await publishWith({
      publish: () => Promise.resolve({ kind: "conflict" }),
      readState: () => {
        raiseStaffSessionExpired({ keepsTypedText: true });
        return Promise.resolve(undefined);
      },
    });

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(
      requireIn<HTMLInputElement>(container, 'input[type="text"]').value,
    ).toBe("Toamna");
    expect(requireIn(container, NOTICE).textContent).not.toContain(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
  });
});
