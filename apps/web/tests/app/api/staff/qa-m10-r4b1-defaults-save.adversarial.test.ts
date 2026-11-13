import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  declaredCabinetDepthsMm,
  DEFAULT_HANDLE,
  freeColourFinish,
  HandleSchema,
  lookUpMaterial,
  materialOffersFinish,
  MAX_IDENTIFIER_LENGTH,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  type Finish,
} from "@lemnaria/configurator-domain";

import {
  readKitchenDefaultsForAdmittedPage,
  readNewKitchenDefaults,
} from "@/lib/server/price-dashboard/new-kitchen-defaults";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { freshAccountWorld, jsonOf } from "../../../support/account-world";
import {
  administrator,
  availabilityHead,
  defaultsRevision,
  disabledNow,
  publishNextVersion,
  switchItem,
  trySaveDefaults,
  writeWithoutJudgement,
} from "../../../support/availability-route-world";
import {
  FIXED_DEFAULTS,
  putDefaults,
  saveBody,
  savedRows,
  storedDefaults,
} from "../../../support/kitchen-defaults-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";

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

/**
 * Counterexamples to `PUT /api/staff/prices/defaults` that the example tests next to it do not reach: races that start in
 * the other route, saves that really run at the same time, a long walk through acceptable wholes against an independent
 * model of what changed, hostile keys below the top level, and a saved row that cannot be read.
 */

const BLACK_HANDLE = { kind: "handle", handle: "black" } as const;
const CHANGED_FIELD_CODES = [
  "material",
  "hardware",
  "depth",
  "finish",
  "handle",
  "topRowHandle",
] as const;
const MEMBER_ORDER = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
] as const;
const MATERIAL_TIERS = ANCHORED_BOOK.material.tiers.map(({ tierId }) => tierId);
const HARDWARE_TIERS = ANCHORED_BOOK.hardware.tiers.map(({ tierId }) => tierId);
const FINISHES: readonly Finish[] = [
  ...MATERIALS.flatMap((material) => paletteEntriesOf(material)).map(
    ({ entryId }) => paletteFinish(entryId),
  ),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#ECEEEB"),
  freeColourFinish("#112233"),
];

interface Whole {
  materialTierId: string;
  hardwareTierId: string;
  cabinetDepthMm: number;
  finish: Finish;
  handle: string;
  topRowHandle: string;
}

let prices: PriceDashboardWorld;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function isOfferedByItsMaterial({ materialTierId, finish }: Whole): boolean {
  const lookup = lookUpMaterial(materialTierId);
  return (
    lookup.kind === "declared" && materialOffersFinish(lookup.material, finish)
  );
}

const acceptableWholes = fc
  .record({
    materialTierId: fc.constantFrom(...MATERIAL_TIERS),
    hardwareTierId: fc.constantFrom(...HARDWARE_TIERS),
    cabinetDepthMm: fc.constantFrom(...declaredCabinetDepthsMm()),
    finish: fc.constantFrom(...FINISHES),
    handle: fc.constantFrom(...HandleSchema.options),
    topRowHandle: fc.constantFrom(...HandleSchema.options),
  })
  .filter(isOfferedByItsMaterial);

function membersThatDiffer(held: Whole, sent: Whole): readonly string[] {
  return MEMBER_ORDER.flatMap((member, index) =>
    JSON.stringify(held[member]) === JSON.stringify(sent[member])
      ? []
      : [CHANGED_FIELD_CODES[index] ?? "unreachable"],
  );
}

function bodyWith(
  defaultsJson: string,
  revisions: { expectedRevision: string; expectedAvailabilityRevision: string },
): string {
  return `{"expectedRevision":"${revisions.expectedRevision}","expectedAvailabilityRevision":"${revisions.expectedAvailabilityRevision}","defaults":${defaultsJson}}`;
}

async function currentRevisions() {
  return {
    expectedRevision: await defaultsRevision(),
    expectedAvailabilityRevision: await availabilityHead(),
  };
}

describe("a save that starts inside another route", () => {
  it("makes a switch-off of the item a save named moments before it answer 409, and leaves the item on", async () => {
    const admin = await administrator();
    const availability = prices.stores.availability;
    const realSetActive = availability.setActive.bind(availability);
    vi.spyOn(availability, "setActive").mockImplementationOnce(
      async (request) => {
        const saved = await putDefaults({
          cookie: admin.cookie,
          json: await saveBody({ handle: "black" }),
        });
        expect(saved.status).toBe(200);
        return realSetActive(request);
      },
    );

    const answer = await switchItem(admin.cookie, BLACK_HANDLE, false);

    expect(answer.status).toBe(409);
    expect(await disabledNow()).not.toContainEqual(BLACK_HANDLE);
    expect(await storedDefaults()).toMatchObject({ handle: "black" });
  });

  it.each([
    ["the switch-off first", true],
    ["the save first", false],
  ])(
    "never leaves a saved handle that is switched off when both run at once, %s",
    async (_order, isSwitchFirst) => {
      const admin = await administrator();
      const switchOff = switchItem(admin.cookie, BLACK_HANDLE, false);
      const save = saveBody({ handle: "black" }).then((json) =>
        putDefaults({ cookie: admin.cookie, json }),
      );

      const answers = await Promise.all(
        isSwitchFirst ? [switchOff, save] : [save, switchOff],
      );

      const isSavedBlack =
        (await storedDefaults())?.handle === BLACK_HANDLE.handle;
      const isBlackOff = (await disabledNow()).some(
        (item) => item.kind === "handle" && item.handle === "black",
      );
      expect(isSavedBlack && isBlackOff, JSON.stringify(answers)).toBe(false);
      for (const answer of answers) {
        expect([200, 409]).toContain(answer.status);
      }
    },
  );

  it("moves a default off the item it released, after which the item can go off and no save can name it again", async () => {
    const admin = await administrator();
    expect(
      (
        await putDefaults({
          cookie: admin.cookie,
          json: await saveBody({ handle: "black" }),
        })
      ).status,
    ).toBe(200);
    expect((await switchItem(admin.cookie, BLACK_HANDLE, false)).status).toBe(
      409,
    );
    expect(
      (
        await putDefaults({
          cookie: admin.cookie,
          json: await saveBody({ handle: "push" }),
        })
      ).status,
    ).toBe(200);
    expect((await switchItem(admin.cookie, BLACK_HANDLE, false)).status).toBe(
      200,
    );

    const again = await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({ handle: "black" }),
    });

    expect(again.status).toBe(409);
    expect(await jsonOf(again)).toEqual({
      status: "item-unavailable",
      item: BLACK_HANDLE,
    });
    expect((await readNewKitchenDefaults()).handle).toBe("push");
    expect(
      (await readKitchenDefaultsForAdmittedPage())?.state.defaults.handle,
    ).toBe("push");
  });
});

describe("saves that run at the same time", () => {
  it("lets exactly one of two saves made against one pair of revisions through, with one audit row", async () => {
    const admin = await administrator();
    const first = await saveBody({ handle: "black" });
    const second = await saveBody({ handle: "push" });
    const revisionBefore = Number(await defaultsRevision());

    const answers = await Promise.all([
      putDefaults({ cookie: admin.cookie, json: first }),
      putDefaults({ cookie: admin.cookie, json: second }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(savedRows()).toHaveLength(1);
    expect(Number(await defaultsRevision())).toBe(revisionBefore + 1);
    const winner = answers[0].status === 200 ? "black" : "push";
    expect(await storedDefaults()).toMatchObject({ handle: winner });
  });

  it("answers a save of what is held, racing a save that changes it, with one pair of revisions that were both true together", async () => {
    const admin = await administrator();
    const holdsNothingNew = await saveBody();
    const changes = await saveBody({ handle: "black" });
    const before = await currentRevisions();

    const [noOp, change] = await Promise.all([
      putDefaults({ cookie: admin.cookie, json: holdsNothingNew }),
      putDefaults({ cookie: admin.cookie, json: changes }),
    ]);

    expect(change.status).toBe(200);
    expect(savedRows()).toHaveLength(1);
    const after = await jsonOf(change);
    const noOpBody = await jsonOf(noOp);
    if (noOp.status === 200) {
      expect([
        {
          revision: before.expectedRevision,
          availabilityRevision: before.expectedAvailabilityRevision,
        },
        after,
      ]).toContainEqual(noOpBody);
    } else {
      expect(noOp.status).toBe(409);
      expect(noOpBody).toEqual({ status: "availability-changed-meanwhile" });
    }
  });
});

describe("a long walk through acceptable wholes", () => {
  it("lists exactly the members that differ, writes nothing for a repeat, and reads back as sent by every reader", async () => {
    const admin = await administrator();
    let held: Whole = { ...FIXED_DEFAULTS } as Whole;

    await fc.assert(
      fc.asyncProperty(acceptableWholes, async (sent) => {
        const label = JSON.stringify({ held, sent });
        const expected = membersThatDiffer(held, sent);
        const rowsBefore = savedRows().length;
        const revisionBefore = await defaultsRevision();
        const headBefore = await availabilityHead();

        const answer = await putDefaults({
          cookie: admin.cookie,
          json: await saveBody(sent),
        });

        expect(answer.status, label).toBe(200);
        if (expected.length === 0) {
          expect(savedRows().length, label).toBe(rowsBefore);
          expect(await defaultsRevision(), label).toBe(revisionBefore);
          expect(await availabilityHead(), label).toBe(headBefore);
        } else {
          expect(savedRows().length, label).toBe(rowsBefore + 1);
          expect(savedRows().at(-1)?.detail, label).toEqual({
            changedFields: expected,
          });
          expect(Number(await defaultsRevision()), label).toBe(
            Number(revisionBefore) + 1,
          );
        }
        expect(
          (await readKitchenDefaultsForAdmittedPage())?.state.defaults,
          label,
        ).toEqual(sent);
        expect(await readNewKitchenDefaults(), label).toEqual(sent);

        const stale = await putDefaults({
          cookie: admin.cookie,
          json: await saveBody(sent, { expectedRevision: "99" }),
        });
        expect(stale.status, `repeat with a stale revision ${label}`).toBe(200);
        expect(savedRows().length, label).toBe(
          expected.length === 0 ? rowsBefore : rowsBefore + 1,
        );
        held = sent;
      }),
      { numRuns: 80 },
    );
  });
});

describe("a free colour written in the other letter case", () => {
  it("is a change of the finish and nothing else, and what is held is what was sent, letter for letter", async () => {
    const admin = await administrator();
    const mdf = "material.painted-mdf";
    await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({
        materialTierId: mdf,
        finish: freeColourFinish("#ECEEEB"),
      }),
    });

    const answer = await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({
        materialTierId: mdf,
        finish: freeColourFinish("#eceeeb"),
      }),
    });

    expect(answer.status).toBe(200);
    expect(savedRows().at(-1)?.detail).toEqual({ changedFields: ["finish"] });
    expect((await storedDefaults())?.finish).toEqual(
      freeColourFinish("#eceeeb"),
    );
  });
});

describe("a save of what is held after the held item went off", () => {
  it("is still a save of nothing and writes nothing, as a no-op is judged by equality alone", async () => {
    const admin = await administrator();
    await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({ handle: "black" }),
    });
    await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({ handle: "push" }),
    });
    await trySaveDefaults(admin, { ...FIXED_DEFAULTS, handle: "black" });
    await writeWithoutJudgement(admin, BLACK_HANDLE, false);
    const rowsBefore = savedRows().length;
    const revisionBefore = await defaultsRevision();
    const headBefore = await availabilityHead();

    const answer = await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({ handle: "black" }),
    });

    expect(answer.status).toBe(200);
    expect(savedRows()).toHaveLength(rowsBefore);
    expect(await defaultsRevision()).toBe(revisionBefore);
    expect(await availabilityHead()).toBe(headBefore);
    expect((await readNewKitchenDefaults()).handle).toBe(DEFAULT_HANDLE);
  });
});

describe("hostile members below the top level", () => {
  const SIX = JSON.stringify(FIXED_DEFAULTS);
  const WITHOUT_FINISH = JSON.stringify({ ...FIXED_DEFAULTS, finish: null });

  async function expectRefusedAndNothingKept(text: string): Promise<void> {
    const admin = await administrator();
    const answer = await putDefaults({ cookie: admin.cookie, json: text });

    expect([400]).toContain(answer.status);
    expect(savedRows()).toEqual([]);
    expect(await storedDefaults()).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  }

  async function bodyOf(defaultsJson: string): Promise<string> {
    return bodyWith(defaultsJson, await currentRevisions());
  }

  it.each([
    ["__proto__ beside the six", '"__proto__":{"polluted":true}'],
    [
      "constructor beside the six",
      '"constructor":{"prototype":{"polluted":true}}',
    ],
    ["toString beside the six", '"toString":"x"'],
    ["hasOwnProperty beside the six", '"hasOwnProperty":1'],
  ])("refuses defaults holding %s", async (_name, member) => {
    const defaultsJson = `${SIX.slice(0, -1)},${member}}`;

    await expectRefusedAndNothingKept(await bodyOf(defaultsJson));
  });

  it.each([
    ["__proto__", '"__proto__":{"polluted":true}'],
    ["constructor", '"constructor":"x"'],
    ["a seventh member", '"extra":1'],
  ])("refuses a finish holding %s", async (_name, member) => {
    const finishJson = `{"kind":"palette-entry","entryId":"pal.alb",${member}}`;
    const defaultsJson = WITHOUT_FINISH.replace("null", finishJson);

    await expectRefusedAndNothingKept(await bodyOf(defaultsJson));
  });

  it("refuses a free colour whose value is a list that the pattern would coerce", async () => {
    const defaultsJson = WITHOUT_FINISH.replace(
      "null",
      '{"kind":"free-colour","value":["#112233"]}',
    );

    await expectRefusedAndNothingKept(await bodyOf(defaultsJson));
  });

  it("refuses the body's own prototype keys as a member beside the three", async () => {
    const text = bodyWith(SIX, await currentRevisions()).replace(
      /}$/,
      ',"__proto__":{"polluted":true}}',
    );

    await expectRefusedAndNothingKept(text);
  });

  it("refuses an id one longer than the bound allows, without reading a store", async () => {
    const huge = "m".repeat(MAX_IDENTIFIER_LENGTH + 1);
    const defaultsJson = JSON.stringify({
      ...FIXED_DEFAULTS,
      materialTierId: huge,
    });

    await expectRefusedAndNothingKept(await bodyOf(defaultsJson));
  });

  it("keeps no member the body repeated: the last one wins, and it is judged as any other", async () => {
    const admin = await administrator();
    const defaultsJson = `${SIX.slice(0, -1)},"handle":"black"}`;

    const answer = await putDefaults({
      cookie: admin.cookie,
      json: await bodyOf(defaultsJson),
    });

    expect(answer.status).toBe(200);
    expect(await storedDefaults()).toEqual({
      ...FIXED_DEFAULTS,
      handle: "black",
    });
    expect(Object.keys((await storedDefaults()) ?? {})).toHaveLength(6);
  });

  it("stores the six members and nothing else, in no object with an own __proto__, for any finish that is accepted", async () => {
    const admin = await administrator();
    const accepted = await putDefaults({
      cookie: admin.cookie,
      json: await saveBody({
        finish: paletteFinish("pal.alb"),
        handle: "black",
      }),
    });
    expect(accepted.status).toBe(200);

    const stored = (await storedDefaults()) as Record<string, unknown>;

    expect(Object.keys(stored).sort()).toEqual([...MEMBER_ORDER].sort());
    expect(Object.hasOwn(stored.finish as object, "__proto__")).toBe(false);
  });
});

describe("a saved row that cannot be read is mended by the revision alone", () => {
  const UNREADABLE_ROWS: readonly [string, unknown][] = [
    ["a handle that is not one", { handle: "gold" }],
    ["a seventh key", { colour: "red" }],
    ["a depth nobody makes", { cabinetDepthMm: 650 }],
    [
      "a colour that is not one",
      { finish: { kind: "free-colour", value: "red" } },
    ],
    ["a null member", { materialTierId: null }],
    ["a string where an object is held", "six"],
    ["a list", []],
    ["a number", 7],
  ];

  /** Puts the row where the store holds it, or, for a row the store would not take, where the store is read. */
  async function holdRow(stored: unknown): Promise<string> {
    const admin = await administrator();
    if (
      typeof stored === "object" &&
      stored !== null &&
      !Array.isArray(stored)
    ) {
      const written = await trySaveDefaults(admin, stored as never);
      expect(written.kind).toBe("ok");
      return admin.cookie;
    }
    const revision = await defaultsRevision();
    vi.spyOn(prices.defaults, "read").mockResolvedValue({
      kind: "saved",
      saved: { revision, defaults: stored, savedAt: new Date(0) },
    });
    return admin.cookie;
  }

  it.each(UNREADABLE_ROWS)(
    "leaves a row holding %s as it is for a save against a wrong defaults revision or a wrong head",
    async (_name, stored) => {
      const cookie = await holdRow(stored);
      const save = vi.spyOn(prices.defaults, "save");
      const revisionBefore = await defaultsRevision();
      const headBefore = await availabilityHead();
      const rowsBefore = savedRows().length;
      const wrongRevisions = ["0", "1", "2", "7"].filter(
        (revision) => revision !== revisionBefore,
      );

      for (const expectedRevision of wrongRevisions) {
        const answer = await putDefaults({
          cookie,
          json: await saveBody({}, { expectedRevision }),
        });
        expect(answer.status, expectedRevision).toBe(409);
        expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
      }
      for (const expectedAvailabilityRevision of [
        "0",
        String(Number(headBefore) + 1),
      ]) {
        const answer = await putDefaults({
          cookie,
          json: await saveBody({}, { expectedAvailabilityRevision }),
        });
        expect(answer.status, expectedAvailabilityRevision).toBe(409);
        expect(await jsonOf(answer)).toEqual({
          status: "availability-changed-meanwhile",
        });
      }

      expect(save).not.toHaveBeenCalled();
      expect(await availabilityHead()).toBe(headBefore);
      expect(savedRows()).toHaveLength(rowsBefore);
    },
  );

  it.each(UNREADABLE_ROWS)(
    "never answers a save over a row holding %s as nothing to save, and mends it with all six fields named",
    async (_name, stored) => {
      const cookie = await holdRow(stored);
      const rowsBefore = savedRows().length;

      const answer = await putDefaults({
        cookie,
        json: await saveBody({}),
      });

      vi.restoreAllMocks();
      expect(answer.status).toBe(200);
      expect(savedRows()).toHaveLength(rowsBefore + 1);
      expect(savedRows().at(-1)?.detail).toEqual({
        changedFields: CHANGED_FIELD_CODES,
      });
      expect(await storedDefaults()).toEqual(FIXED_DEFAULTS);
      expect((await readKitchenDefaultsForAdmittedPage())?.state.saved).toBe(
        true,
      );
    },
  );
});

describe("a page read across a publish", () => {
  it("names the head it read, so a save made from that page is refused and written nowhere", async () => {
    const admin = await administrator();
    const realReadActive = prices.stores.priceBook.readActive.bind(
      prices.stores.priceBook,
    );
    let hasPublished = false;
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementation(
      async () => {
        if (!hasPublished) {
          hasPublished = true;
          await publishNextVersion(admin, ANCHORED_BOOK);
        }
        return realReadActive();
      },
    );
    const headBeforePublish = await availabilityHead();

    const page = await readKitchenDefaultsForAdmittedPage();

    expect(hasPublished).toBe(true);
    expect(page?.state.availabilityRevision).toBe(headBeforePublish);
    expect(await availabilityHead()).not.toBe(headBeforePublish);
    const answer = await putDefaults({
      cookie: admin.cookie,
      json: await saveBody(
        { handle: "black" },
        {
          expectedRevision: page?.state.revision,
          expectedAvailabilityRevision: page?.state.availabilityRevision,
        },
      ),
    });
    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    expect(savedRows()).toEqual([]);
  });
});
