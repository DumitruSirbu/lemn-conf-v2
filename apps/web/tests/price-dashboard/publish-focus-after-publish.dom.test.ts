// @vitest-environment happy-dom
//
// A confirmed publish takes the pending list, and the publish button with it, out of the page: focus must go to the
// notice that says what happened, not fall to the body. A refused publish leaves the button where it was.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

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
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const CONFIRM = roCopy("priceDashboard.publish.confirmAction");
const PLAIN_DRAFT = inputWithDraft(
  SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
    (change) => change.address.kind !== "provisional",
  ),
);

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

async function confirmPublish(desk: MountedDesk): Promise<HTMLElement> {
  const publishButton = requireIn<HTMLButtonElement>(
    desk.container,
    '[class*="primary"]',
  );
  typeInto(
    requireIn<HTMLInputElement>(desk.container, 'input[type="text"]'),
    "Ajustari",
  );
  click(publishButton);
  const dialog = requireIn(document.body, '[role="alertdialog"]');
  click(byWords(dialog, "button", CONFIRM));
  await settle();
  return publishButton;
}

describe("where focus goes when a confirmed publish ends", () => {
  it("is the published notice, because the pending list and its button are replaced by the history", async () => {
    mounted = await mountDesk({ input: PLAIN_DRAFT });

    await confirmPublish(mounted);

    const notice = requireIn(
      mounted.container,
      '[data-testid="publish-notice"]',
    );
    expect(notice.textContent).toContain(
      roCopy("priceDashboard.publish.publishedBody"),
    );
    expect(document.activeElement).toBe(notice);
  });

  it("stays on the publish button when the publish is refused and the list is still there", async () => {
    const client = spiedPublishClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "failed" }),
    });
    mounted = await mountDesk({ input: PLAIN_DRAFT, client });

    const publishButton = await confirmPublish(mounted);

    expect(
      requireIn(mounted.container, '[data-testid="publish-notice"]'),
    ).not.toBe(document.activeElement);
    expect(document.activeElement).toBe(publishButton);
  });
});
