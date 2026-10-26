// M10 X0, adversarial QA of the ports against the plan's §8.4 (c) table, literally: the operations each store has, the
// members each write request takes and the digest's exact row. The type-level checks run in `pnpm typecheck`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readDashboardAuditEntry } from "@lemnaria/configurator-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  INITIAL_REVISION,
  type CatalogueAvailabilityStore,
  type ClaimDigestDayResult,
  type DigestEligibleKitchen,
  type KitchenChangeStore,
  type KitchenDefaultsStore,
  type KitchenUsageReader,
  type MarkKitchenSeenRequest,
  type PriceBookStore,
  type PriceNoticeStore,
  type PublishPriceBookRequest,
  type SaveKitchenDefaultsRequest,
  type SetItemActiveRequest,
  type WriteDraftRequest,
} from "../src/index.js";

const PORTS_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/m10-ports.ts",
  ),
  "utf8",
);

const PORTS_CODE = PORTS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /\/\/.*$/gm,
  "",
);

/** The text of one exported type alias, up to its closing semicolon. */
function aliasText(name: string): string {
  const match = new RegExp(`export type ${name} =[^;]*;`).exec(PORTS_CODE);
  if (match === null) throw new Error(`no type alias ${name} in m10-ports.ts`);
  return match[0];
}

describe("the stores have the operations of the plan's table, and no other", () => {
  it("PriceBookStore", () => {
    expectTypeOf<keyof PriceBookStore>().toEqualTypeOf<
      | "readActive"
      | "readVersion"
      | "listVersions"
      | "readDraft"
      | "writeDraft"
      | "publish"
    >();
  });

  it("KitchenDefaultsStore, KitchenUsageReader, CatalogueAvailabilityStore, PriceNoticeStore", () => {
    expectTypeOf<keyof KitchenDefaultsStore>().toEqualTypeOf<"read" | "save">();
    expectTypeOf<keyof KitchenUsageReader>().toEqualTypeOf<"count">();
    expectTypeOf<keyof CatalogueAvailabilityStore>().toEqualTypeOf<
      "readCurrent" | "readAt" | "setActive"
    >();
    expectTypeOf<keyof PriceNoticeStore>().toEqualTypeOf<
      "readAcknowledged" | "recordIfAbsent" | "recordAcknowledged"
    >();
  });

  it("KitchenChangeStore holds no `listChanged`: that is folded into the staff kitchens statements", () => {
    expectTypeOf<keyof KitchenChangeStore>().toEqualTypeOf<
      "markSeen" | "claimDigestDay" | "listDigestEligible" | "recordDigested"
    >();
  });
});

describe("the write requests take the members the plan (as amended) names", () => {
  it("a draft write: the expected revision, the changes and the audit", () => {
    expectTypeOf<keyof WriteDraftRequest>().toEqualTypeOf<
      "expectedDraftRevision" | "changes" | "audit"
    >();
  });

  it("a publish: both expectations, the text, the book the server computed, the summary and the audit", () => {
    expectTypeOf<keyof PublishPriceBookRequest>().toEqualTypeOf<
      | "expectedDraftRevision"
      | "expectedActiveSequence"
      | "label"
      | "note"
      | "book"
      | "changeSummary"
      | "audit"
    >();
    expectTypeOf<PublishPriceBookRequest["book"]>().toBeUnknown();
  });

  it("a defaults save: both expected revisions, the defaults and the audit", () => {
    expectTypeOf<keyof SaveKitchenDefaultsRequest>().toEqualTypeOf<
      "expectedRevision" | "expectedAvailabilityRevision" | "defaults" | "audit"
    >();
  });

  it("an availability change: the item, the flag, the expected revision and the audit", () => {
    expectTypeOf<keyof SetItemActiveRequest>().toEqualTypeOf<
      "item" | "active" | "expectedRevision" | "audit"
    >();
  });

  it("a seen mark: the design, the displayed revision and the audit", () => {
    expectTypeOf<keyof MarkKitchenSeenRequest>().toEqualTypeOf<
      "designId" | "displayedRevision" | "audit"
    >();
  });
});

describe("the digest's row is exactly the one X0-5 rules, and holds no contact detail", () => {
  it("has the six members, the customer as a name or a reference", () => {
    expectTypeOf<keyof DigestEligibleKitchen>().toEqualTypeOf<
      | "designId"
      | "kitchenName"
      | "customerName"
      | "reference"
      | "sentAt"
      | "updatedAt"
      | "revision"
    >();
  });

  it("makes the kitchen name optional, because designs.name is a nullable column, and never null", () => {
    expectTypeOf<DigestEligibleKitchen["kitchenName"]>().toEqualTypeOf<
      string | undefined
    >();
  });

  it("names the customer by exactly one of the account's name and the request's reference", () => {
    const base = {
      designId: "d1",
      sentAt: new Date(0),
      updatedAt: new Date(0),
      revision: "1",
    } as const;
    // @ts-expect-error neither a name nor a reference
    const nobody: DigestEligibleKitchen = { ...base };
    // @ts-expect-error both, which a mail could then print twice
    const both: DigestEligibleKitchen = {
      ...base,
      customerName: "A",
      reference: "R",
    };
    const withEmail: DigestEligibleKitchen = {
      ...base,
      customerName: "A",
      // @ts-expect-error an e-mail address has no place in the digest
      email: "a@example.md",
    };

    expect([nobody, both, withEmail]).toHaveLength(3);
  });
});

describe("the results use the plan's own names as their kinds (X0-5)", () => {
  it.each([
    ["WriteDraftResult", "ok"],
    ["PublishPriceBookResult", "ok"],
    ["SaveKitchenDefaultsResult", "ok"],
    ["SetItemActiveResult", "ok"],
  ])(
    "%s answers success as the plan's `%s`, as MarkKitchenSeenResult and RecordAcknowledgedPricesResult do",
    (alias, planKind) => {
      expect(aliasText(alias)).toContain(`kind: "${planKind}"`);
    },
  );

  it("answers a claimed day with the round id, as the plan's `{claimed: roundId}`", () => {
    expectTypeOf<
      Extract<ClaimDigestDayResult, { kind: "claimed" }>
    >().toEqualTypeOf<{ readonly kind: "claimed"; readonly roundId: string }>();
  });
});

describe("no answer is absent", () => {
  it("returns no `undefined` from a port: a missing state is a named object", () => {
    expect(PORTS_CODE).not.toMatch(/Promise<[^;]*\bundefined\b/);
    expect(PORTS_CODE).not.toMatch(/\bnull\b/);
  });

  it("reads a never-written revision as the one value the domain's audit shape also accepts", () => {
    const reading = readDashboardAuditEntry(
      "catalogue-item-activation-changed",
      {
        itemKind: "material",
        itemId: "material.painted-mdf",
        active: true,
        availabilityRevision: INITIAL_REVISION,
      },
    );

    expect(reading.ok).toBe(true);
  });
});
