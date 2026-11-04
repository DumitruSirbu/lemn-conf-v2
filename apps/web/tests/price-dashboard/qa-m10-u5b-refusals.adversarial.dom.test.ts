// @vitest-environment happy-dom
//
// Adversarial QA of the reasons a refused publish names. The wire's `refusals` is a closed list, but no parser stands
// between a client and the notice, so the notice is the last place a reason it was not written for can be survived. The
// contract: "a screen that meets one it does not know shows its generic failure".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";

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

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
const RULE = BOOK.cabinetRules[0];
if (RULE === undefined) throw new Error("the sample book has no rule");
const PLAIN_CHANGES = SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
  (change) => change.address.kind !== "provisional",
);

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
  vi.restoreAllMocks();
});

async function publishRefusedFor(refusals: unknown): Promise<HTMLElement> {
  const input = inputWithDraft(PLAIN_CHANGES);
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, {
      publish: () =>
        Promise.resolve({
          kind: "candidate-refused",
          refusals: refusals as readonly CandidateRefusalWire[],
        }),
    }),
  });
  const { container } = mounted;
  typeInto(
    requireIn<HTMLInputElement>(container, 'input[type="text"]'),
    "Ajustari",
  );
  click(requireIn(container, '[class*="primary"]'));
  click(
    byWords(
      document.body,
      "button",
      roCopy("priceDashboard.publish.confirmAction"),
    ),
  );
  await settle();
  return container;
}

describe("a reason the notice was not written for", () => {
  it("leaves the page standing and the general sentence told, whatever its source", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await publishRefusedFor([
      { source: "a-source-nobody-wrote", code: "SOMETHING" },
    ]);

    expect(
      container.querySelector('[data-testid="publish-page"]'),
      "the whole page went with one unknown reason",
    ).not.toBeNull();
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(roCopy("priceDashboard.publish.candidateRefusedTitle"));
  });
});
