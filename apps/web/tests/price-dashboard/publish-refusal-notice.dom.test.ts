// @vitest-environment happy-dom
//
// A publish the catalogue refuses (`409 candidate-refused`) names why: the rows the reasons are about, so the person can take
// one back or correct it, and the rest counted. Nothing is published, the draft and its rows stay, and the next write clears
// the notice.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { CandidateRefusalWire } from "@/price-dashboard/price-dashboard-wire-contract";
import { MAX_REFUSAL_LINES } from "@/price-dashboard/publish-refusals";
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
  type SpiedPublishClient,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  createAccessoryChange,
  NEW_ACCESSORY,
  NEW_ACCESSORY_NAME,
} from "./publish-structural-rows.support";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
const RULE = BOOK.cabinetRules[0];
if (RULE === undefined) throw new Error("the sample book has no rule");
const CABINET_NAME = SAMPLE_PUBLISH_PAGE.cabinetNames[RULE.buildId] ?? "";
const WIDTH_MM = 600;
const HEIGHT_MM = 720;
const PLAIN_CHANGES: readonly DraftChange[] =
  SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
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
});

const NOT_POSITIVE: CandidateRefusalWire = {
  source: "catalogue",
  code: "PRICE_NOT_POSITIVE",
  ruleId: RULE.ruleId,
  buildId: RULE.buildId,
  widthMm: WIDTH_MM,
  heightMm: HEIGHT_MM,
  field: "anchorMinor",
};

async function publishRefusedFor(
  refusals: readonly CandidateRefusalWire[],
  replace: Partial<SpiedPublishClient> = {},
): Promise<MountedDesk> {
  const input = inputWithDraft(PLAIN_CHANGES);
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, {
      publish: () => Promise.resolve({ kind: "candidate-refused", refusals }),
      ...replace,
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
  return mounted;
}

const noticeOf = (container: HTMLElement): HTMLElement =>
  requireIn(container, '[data-testid="publish-notice"]');

const linesIn = (container: HTMLElement): string[] =>
  Array.from(
    noticeOf(container).querySelectorAll('[data-testid="publish-refusals"] li'),
  ).map((item) => item.textContent);

describe("a publish the catalogue refuses", () => {
  it("keeps the title and the general sentence, and adds a line for the cabinet and the size it is about", async () => {
    const { container } = await publishRefusedFor([NOT_POSITIVE]);

    expect(noticeOf(container).textContent).toContain(
      roCopy("priceDashboard.publish.candidateRefusedTitle"),
    );
    expect(noticeOf(container).textContent).toContain(
      roCopy("priceDashboard.publish.candidateRefusedBody"),
    );
    expect(linesIn(container)).toEqual([
      roCopy("priceDashboard.publish.refusalPriceNotPositive", {
        name: CABINET_NAME,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
      }),
    ]);
  });

  it("tells each kind of reason in its own sentence", async () => {
    const { container } = await publishRefusedFor([
      { ...NOT_POSITIVE, code: "PRICE_TOO_LARGE" },
      { source: "catalogue", code: "PERCENT_OUT_OF_RANGE", item: "depth" },
      { source: "catalogue", code: "NO_RULE_FOR_BODY", buildId: RULE.buildId },
      { source: "changes", index: 0, code: "TOO_LARGE" },
      { source: "pricing", code: "INVALID_PRICE_BOOK" },
    ]);

    const lines = linesIn(container);

    expect(lines).toHaveLength(5);
    expect(new Set(lines).size, "five reasons, five different lines").toBe(5);
    expect(lines).toContain(
      roCopy("priceDashboard.publish.refusalPriceTooLarge", {
        name: CABINET_NAME,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
      }),
    );
    expect(lines).toContain(
      roCopy("priceDashboard.publish.refusalCabinet", { name: CABINET_NAME }),
    );
    expect(lines).toContain(roCopy("priceDashboard.publish.refusalUnnamed"));
  });

  it("counts the reasons past the cap instead of listing them", async () => {
    const many: CandidateRefusalWire[] = Array.from(
      { length: MAX_REFUSAL_LINES + 3 },
      () => NOT_POSITIVE,
    );
    const { container } = await publishRefusedFor(many);

    const lines = linesIn(container);

    expect(lines).toHaveLength(MAX_REFUSAL_LINES + 1);
    expect(lines.at(-1)).toBe(
      roCopy("priceDashboard.publish.refusalsMore", { count: 3 }),
    );
  });

  it("names an accessory the draft created by its authored name, which only the book the draft makes holds", async () => {
    const input = inputWithDraft([createAccessoryChange(RULE.buildId)]);
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () =>
          Promise.resolve({
            kind: "candidate-refused",
            refusals: [
              {
                source: "catalogue",
                code: "LINK_TARGET_UNKNOWN",
                accessoryId: NEW_ACCESSORY,
                linkedBuildId: RULE.buildId,
              },
            ],
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

    expect(linesIn(container)).toEqual([
      roCopy("priceDashboard.publish.refusalLink", {
        name: NEW_ACCESSORY_NAME,
      }),
    ]);
  });

  it("draws no list for a refusal that names no reason", async () => {
    const { container } = await publishRefusedFor([]);

    expect(noticeOf(container).textContent).toContain(
      roCopy("priceDashboard.publish.candidateRefusedTitle"),
    );
    expect(
      noticeOf(container).querySelector('[data-testid="publish-refusals"]'),
    ).toBeNull();
  });

  it("publishes nothing: the rows and the button stay, and a later write clears the notice", async () => {
    const { container, client } = await publishRefusedFor([NOT_POSITIVE]);

    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(requireIn(container, '[data-testid="diff-table"]').isConnected).toBe(
      true,
    );
    expect(
      requireIn(container, '[class*="primary"]').getAttribute("aria-disabled"),
    ).toBeNull();
    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(
      container.querySelector('[data-testid="publish-notice"]'),
    ).toBeNull();
  });
});
