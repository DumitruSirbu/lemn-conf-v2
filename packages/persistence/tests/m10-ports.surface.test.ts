// M10 X0, adversarial QA of the ports against the plan's §8.4 (c) table, literally: the operations each store has, the
// members each write request takes and the digest's exact row. The type-level checks run in `pnpm typecheck`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readDashboardAuditEntry,
  type ItemRef,
} from "@lemnaria/configurator-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  INITIAL_REVISION,
  type ActivationAuditRecord,
  type CatalogueAvailabilityStore,
  type ClaimDigestDayResult,
  type DashboardAuditRecord,
  type DigestEligibleKitchen,
  type KitchenChangeStore,
  type KitchenDefaultsStore,
  type KitchenUsageReader,
  type MarkKitchenSeenRequest,
  type PriceBookStore,
  type PriceNoticeStore,
  type PublishPriceBookRequest,
  type PublishPriceBookResult,
  type SaveKitchenDefaultsRequest,
  type SaveKitchenDefaultsResult,
  type SetItemActiveRequest,
  type SetItemActiveResult,
  type WriteDraftRequest,
  type WriteDraftResult,
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

  it("a publish: three expectations, the created items, the text, the book the server computed, the summary and the audit", () => {
    expectTypeOf<keyof PublishPriceBookRequest>().toEqualTypeOf<
      | "expectedDraftRevision"
      | "expectedActiveSequence"
      | "expectedAvailabilityRevision"
      | "createdItems"
      | "label"
      | "note"
      | "book"
      | "changeSummary"
      | "audit"
    >();
    expectTypeOf<PublishPriceBookRequest["book"]>().toBeUnknown();
    expectTypeOf<PublishPriceBookRequest["createdItems"]>().toEqualTypeOf<
      readonly ItemRef[]
    >();
    expectTypeOf<
      PublishPriceBookRequest["expectedAvailabilityRevision"]
    >().toBeString();
    expectTypeOf<
      PublishPriceBookRequest["audit"]
    >().toEqualTypeOf<DashboardAuditRecord>();
  });

  it("a defaults save: both expected revisions, the defaults and the audit", () => {
    expectTypeOf<keyof SaveKitchenDefaultsRequest>().toEqualTypeOf<
      "expectedRevision" | "expectedAvailabilityRevision" | "defaults" | "audit"
    >();
  });

  it("an availability change: the item, the flag, the expected revision and an audit without the revision it will create (M4)", () => {
    expectTypeOf<keyof SetItemActiveRequest>().toEqualTypeOf<
      "item" | "active" | "expectedRevision" | "audit"
    >();
    expectTypeOf<
      SetItemActiveRequest["audit"]
    >().toEqualTypeOf<ActivationAuditRecord>();
    expectTypeOf<
      keyof ActivationAuditRecord["entry"]["detail"]
    >().toEqualTypeOf<"itemKind" | "itemId" | "active">();
    expectTypeOf<keyof ActivationAuditRecord>().toEqualTypeOf<
      "session" | "entry"
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

describe("the results are the shapes the amended plan names (M1, m2, m3, M4)", () => {
  it("a publish answers ok with the version and the head after it, or one of the two compare-and-set refusals", () => {
    expectTypeOf<PublishPriceBookResult["kind"]>().toEqualTypeOf<
      "ok" | "changed-meanwhile" | "availability-changed-meanwhile"
    >();
    expectTypeOf<
      Extract<PublishPriceBookResult, { kind: "ok" }>
    >().toEqualTypeOf<{
      readonly kind: "ok";
      readonly versionId: string;
      readonly sequenceNumber: number;
      readonly availabilityRevision: string;
    }>();
  });

  it("a defaults save returns both revisions, and only the two compare-and-set refusals: item-unavailable is the domain's", () => {
    expectTypeOf<SaveKitchenDefaultsResult["kind"]>().toEqualTypeOf<
      "ok" | "changed-meanwhile" | "availability-changed-meanwhile"
    >();
    expectTypeOf<
      Extract<SaveKitchenDefaultsResult, { kind: "ok" }>
    >().toEqualTypeOf<{
      readonly kind: "ok";
      readonly revision: string;
      readonly availabilityRevision: string;
    }>();
    expect(PORTS_CODE).not.toMatch(/kind: "item-unavailable"/);
  });

  it("a draft write answers ok with the revision it created, or changed-meanwhile; an availability write the same with its revision", () => {
    expectTypeOf<WriteDraftResult["kind"]>().toEqualTypeOf<
      "ok" | "changed-meanwhile"
    >();
    expectTypeOf<Extract<WriteDraftResult, { kind: "ok" }>>().toEqualTypeOf<{
      readonly kind: "ok";
      readonly draftRevision: string;
    }>();
    expectTypeOf<SetItemActiveResult["kind"]>().toEqualTypeOf<
      "ok" | "changed-meanwhile"
    >();
    expectTypeOf<Extract<SetItemActiveResult, { kind: "ok" }>>().toEqualTypeOf<{
      readonly kind: "ok";
      readonly revision: string;
    }>();
  });

  it("a publish's audit is the ordinary record; only the availability write takes the unstamped one", () => {
    expectTypeOf<
      WriteDraftRequest["audit"]
    >().toEqualTypeOf<DashboardAuditRecord>();
    expectTypeOf<
      SaveKitchenDefaultsRequest["audit"]
    >().toEqualTypeOf<DashboardAuditRecord>();
    expectTypeOf<ActivationAuditRecord>().not.toEqualTypeOf<DashboardAuditRecord>();
  });
});

describe("no answer is absent", () => {
  it("returns no `undefined` from a port: a missing state is a named object", () => {
    expect(PORTS_CODE).not.toMatch(/Promise<[^;]*\bundefined\b/);
    expect(PORTS_CODE).not.toMatch(/\bnull\b/);
  });

  it("reads a never-written revision as the one value the domain's audit shape also accepts", () => {
    const reading = readDashboardAuditEntry("catalogue-item-active-changed", {
      itemKind: "material",
      itemId: "material.painted-mdf",
      active: true,
      availabilityRevision: INITIAL_REVISION,
    });

    expect(reading.ok).toBe(true);
  });
});
