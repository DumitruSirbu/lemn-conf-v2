// Adversarial QA of M10 wave U2, the bulk dialog's preview against the route it previews. `bulk-preview.test.ts` checks
// the preview against `planBulkChange` called directly; the in-memory client of the DOM tests re-implements the route's
// filtering. Neither is the route. Here the real `POST /api/staff/prices/bulk` (the real planner, the real draft
// judgement, the persistence package's fake stores) answers the same scenario the dialog previews, and the two are
// compared: the verdict, the counts the dialog names and the answer's counts, the example's price after, and the
// refusal the dialog words against the code the server gave.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRICE_GROUP_CODES,
  SAMPLE_PRICE_BOOK,
  type BulkTarget,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { previewBulk, type BulkPreview } from "@/price-dashboard/bulk-preview";
import {
  defaultSizePriceMinor,
  deriveCabinetList,
} from "@/price-dashboard/cabinet-list-facts";
import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
  readState,
} from "../../../support/price-dashboard-requests";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import { cabinetNamesOf } from "../../../price-dashboard/dashboard-state-fixture";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const BASE_ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;

beforeEach(() => {
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface Ruling {
  readonly status: number;
  readonly code?: string;
  readonly ruleCount?: number;
  readonly amountCount?: number;
  readonly stored: readonly DraftChange[];
}

interface Scenario {
  /** Prices the draft already holds before the bulk action, written through the route. */
  readonly pending?:
    | readonly {
        readonly address: DraftChange["address"];
        readonly value: number;
      }[]
    | undefined;
  readonly target: BulkTarget;
  readonly percent: number;
}

/** What the dialog would say and what the route does, for one scenario in a fresh world. */
async function bothAnswer(scenario: Scenario): Promise<{
  preview: BulkPreview;
  state: DashboardStateWire;
  ruling: Ruling;
}> {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  for (const change of scenario.pending ?? []) {
    const written = await changeDraft({
      cookie: session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change,
      },
    });
    expect(written.status, "the scenario's own pending price").toBe(200);
  }
  const state = (await jsonOf(
    await readState({ cookie: session.cookie }),
  )) as DashboardStateWire;
  const derived = deriveCabinetList({
    state,
    cabinetNames: cabinetNamesOf(state.active.book),
  });
  if (derived.kind !== "ready") throw new Error("the list is unreadable");
  const preview = previewBulk({
    candidate: derived.candidate,
    rows: derived.input.rules,
    target: scenario.target,
    percent: scenario.percent,
  });

  const answer = await bulkDraft({
    cookie: session.cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      target: scenario.target,
      percent: scenario.percent,
    },
  });
  const body = (await jsonOf(answer)) as {
    issues?: { code: string }[];
    ruleCount?: number;
    amountCount?: number;
    draft?: { changes: DraftChange[] };
  };
  const after = (await jsonOf(
    await readState({ cookie: session.cookie }),
  )) as DashboardStateWire;
  return {
    preview,
    state,
    ruling: {
      status: answer.status,
      ...(body.issues?.[0] === undefined ? {} : { code: body.issues[0].code }),
      ...(body.ruleCount === undefined ? {} : { ruleCount: body.ruleCount }),
      ...(body.amountCount === undefined
        ? {}
        : { amountCount: body.amountCount }),
      stored: after.draft.changes,
    },
  };
}

/** The code the route gives for each refusal the dialog words. */
const CODE_OF_PREVIEW: Readonly<Record<string, readonly string[]>> = {
  "nothing-changes": ["PERCENT_OUT_OF_RANGE"],
  "no-cabinets": ["NO_CABINETS_SELECTED"],
  "price-not-positive": ["PRICE_WOULD_BE_NEGATIVE"],
  "price-too-large": ["PERCENT_OUT_OF_RANGE"],
};

/** What differs between the dialog's verdict and the route's, as sentences; empty when they agree. */
function verdictMismatches({
  preview,
  ruling,
}: {
  preview: BulkPreview;
  ruling: Ruling;
}): string[] {
  if (preview.kind === "ready") {
    return ruling.status === 200
      ? []
      : [
          `the dialog is ready, the route answers ${String(ruling.status)} ${ruling.code ?? ""}`,
        ];
  }
  if (preview.kind === "cannot-apply") {
    return ruling.status === 200
      ? ["the dialog cannot apply it, the route writes it"]
      : [];
  }
  const expectedCodes = CODE_OF_PREVIEW[preview.kind] ?? [];
  return ruling.status === 400 && expectedCodes.includes(ruling.code ?? "")
    ? []
    : [
        `the dialog says ${preview.kind}, the route answers ${String(ruling.status)} ${ruling.code ?? ""}`,
      ];
}

/** What differs between the counts the dialog names and the counts the route writes; empty when they agree. */
function countMismatches({
  preview,
  ruling,
}: {
  preview: BulkPreview;
  ruling: Ruling;
}): string[] {
  if (preview.kind !== "ready" || ruling.status !== 200) return [];
  const named = `${String(preview.cabinetCount)} cabinets, ${String(preview.priceCount)} prices`;
  const written = `${String(ruling.ruleCount)} cabinets, ${String(ruling.amountCount)} prices`;
  return named === written
    ? []
    : [`the dialog names ${named}; the route writes ${written}`];
}

const GROUP_TARGETS: BulkTarget[] = PRICE_GROUP_CODES.map((groupCode) => ({
  scope: "group",
  groupCode,
}));
const TARGETS: BulkTarget[] = [
  { scope: "all" },
  ...GROUP_TARGETS,
  { scope: "selection", ruleIds: ["cabinet.base-cabinet"] },
  {
    scope: "selection",
    ruleIds: ["cabinet.base-cabinet", "cabinet.base-hob-2drawer"],
  },
  { scope: "selection", ruleIds: [] },
];
const PERCENTS = [
  -90, -89, -50, -10, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7, 10, 33, 100, 299, 300,
];

describe("the preview of the dialog and the route's own answer, over every scope and a sweep of percentages, on the book as it is", () => {
  it.each(TARGETS.map((target) => [JSON.stringify(target), target] as const))(
    "agree on the verdict, whether it is ready or why not, for %s",
    async (_name, target) => {
      const disagreements: string[] = [];
      for (const percent of PERCENTS) {
        const both = await bothAnswer({ target, percent });
        disagreements.push(
          ...verdictMismatches(both).map(
            (line) => `${String(percent)} %: ${line}`,
          ),
        );
      }

      expect(disagreements).toEqual([]);
    },
    120_000,
  );

  it("name the counts the route then writes into the draft, over every scope and percentage (the pending count the frame shows grows by the second)", async () => {
    const disagreements: string[] = [];
    for (const target of TARGETS) {
      for (const percent of PERCENTS) {
        const both = await bothAnswer({ target, percent });
        disagreements.push(
          ...countMismatches(both).map(
            (line) =>
              `${JSON.stringify(target)} at ${String(percent)} %: ${line}`,
          ),
        );
      }
    }

    expect(disagreements).toEqual([]);
  }, 300_000);

  it("shows, as the example's price after, the price the stored changes give that cabinet", async () => {
    for (const percent of [-90, -10, 5, 33, 300]) {
      const both = await bothAnswer({ target: { scope: "all" }, percent });
      if (both.preview.kind !== "ready") continue;
      const { example } = both.preview;
      const book = both.state.active.book;
      const rule = book.cabinetRules.find(
        (held) =>
          cabinetNamesOf(book)[held.buildId] === example.name &&
          !held.ruleId.includes("corner"),
      );
      if (rule === undefined) throw new Error("no rule for the example");
      const { applyChanges } = await import("@lemnaria/configurator-domain");
      const applied = applyChanges(book, both.ruling.stored);
      if (!applied.ok) throw new Error("the stored draft does not apply");

      expect(defaultSizePriceMinor(applied.book, rule.ruleId)).toBe(
        example.afterMinor,
      );
      expect(defaultSizePriceMinor(book, rule.ruleId)).toBe(
        example.beforeMinor,
      );
    }
  });
});

describe("the same, with prices the draft already holds, which the bulk action scales and not the active book's", () => {
  const PENDING: readonly (readonly [string, Scenario["pending"]])[] = [
    [
      "a pending anchor of 10 lei, whose narrower widths price at zero or less",
      [{ address: BASE_ANCHOR, value: 1_000 }],
    ],
    [
      "a pending anchor of 0, which the field takes",
      [{ address: BASE_ANCHOR, value: 0 }],
    ],
    [
      "a pending anchor just under what the book can hold",
      [{ address: BASE_ANCHOR, value: 225_000_000_000 }],
    ],
    [
      "a pending anchor of a cabinet outside the scope",
      [
        {
          address: {
            kind: "cabinet",
            ruleId: "cabinet.wall-cabinet",
            field: "anchorMinor",
          },
          value: 297_000_00,
        },
      ],
    ],
    [
      "a pending anchor at 20 lei, where a 1 % action rounds back to the same ten lei",
      [{ address: BASE_ANCHOR, value: 2_000 }],
    ],
  ];

  it.each(PENDING)(
    "agree on the verdict for %s",
    async (_name, pending) => {
      const disagreements: string[] = [];
      for (const target of TARGETS.slice(0, 7)) {
        for (const percent of [-90, -10, -1, 1, 5, 10, 300]) {
          const both = await bothAnswer({ pending, target, percent });
          disagreements.push(
            ...verdictMismatches(both).map(
              (line) =>
                `${JSON.stringify(target)} at ${String(percent)} %: ${line}`,
            ),
          );
        }
      }

      expect(disagreements).toEqual([]);
    },
    120_000,
  );

  it("name the counts the route writes, with each of those prices pending", async () => {
    const disagreements: string[] = [];
    for (const [name, pending] of PENDING) {
      for (const target of TARGETS.slice(0, 7)) {
        for (const percent of [-90, -10, -1, 1, 5, 10, 300]) {
          const both = await bothAnswer({ pending, target, percent });
          disagreements.push(
            ...countMismatches(both).map(
              (line) =>
                `${name}; ${JSON.stringify(target)} at ${String(percent)} %: ${line}`,
            ),
          );
        }
      }
    }

    expect(disagreements).toEqual([]);
  }, 300_000);

  it("scales the second bulk action over the first's prices: the preview and the route agree on a run of three", async () => {
    // Three actions in a row in one world: each is previewed from the state the screen would then hold.
    freshAccountWorld();
    freshStaffWorld();
    await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
    const { session } = await signedInAs(
      { role: "administrator" },
      "administrator@example.test",
    );
    for (const percent of [7, -3, 10]) {
      const state = (await jsonOf(
        await readState({ cookie: session.cookie }),
      )) as DashboardStateWire;
      const derived = deriveCabinetList({
        state,
        cabinetNames: cabinetNamesOf(state.active.book),
      });
      if (derived.kind !== "ready") throw new Error("unreadable");
      const preview = previewBulk({
        candidate: derived.candidate,
        rows: derived.input.rules,
        target: { scope: "all" },
        percent,
      });

      const answer = await bulkDraft({
        cookie: session.cookie,
        json: {
          expectedDraftRevision: state.draft.draftRevision,
          target: { scope: "all" },
          percent,
        },
      });

      const body = (await jsonOf(answer)) as {
        ruleCount: number;
        amountCount: number;
      };
      expect(preview.kind).toBe("ready");
      if (preview.kind !== "ready") continue;
      expect({
        cabinets: preview.cabinetCount,
        prices: preview.priceCount,
      }).toEqual({ cabinets: body.ruleCount, prices: body.amountCount });
    }
  });
});
