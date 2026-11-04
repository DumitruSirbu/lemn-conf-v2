import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_IDENTIFIER_LENGTH,
  paletteFinish,
  type ItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  activationRows,
  administrator,
  allRows,
  availabilityHead,
  disabledNow,
  saveDefaults,
  switchItem,
} from "../../../support/availability-route-world";
import { setAvailability } from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
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
 * `POST /api/staff/prices/availability` against bodies and stored rows made to confuse it: every one is a refusal or a
 * `503` that writes nothing, and none is a `5xx` the caller can use to tell what is stored.
 */

const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };

let prices: PriceDashboardWorld;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function postText(cookie: string, text: string) {
  return setAvailability({ cookie, json: text });
}

async function expectRefusedAsUnreadable(text: string): Promise<void> {
  const { cookie } = await administrator();
  const headBefore = await availabilityHead();

  const answer = await postText(cookie, text);

  expect(answer.status, text).toBe(400);
  expect(await jsonOf(answer), text).toEqual({ status: "invalid-request" });
  expect(priceStoreAsks.count, text).toBe(0);
  expect(await availabilityHead(), text).toBe(headBefore);
  expect(
    allRows().filter(({ action }) => action !== "price-published"),
  ).toEqual([]);
}

function bodyWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    expectedRevision: "0",
    item: PAINTED,
    active: false,
    ...overrides,
  });
}

describe("a revision that is not one the head can hold", () => {
  it.each([
    ["empty", ""],
    ["a leading space", " 0"],
    ["a trailing newline", "0\n"],
    ["a leading zero", "00"],
    ["negative", "-1"],
    ["fractional", "1.0"],
    ["an exponent", "1e2"],
    ["a sign", "+1"],
    ["hexadecimal", "0x10"],
    ["Arabic-Indic digits", "٣"],
    ["full-width digits", "１"],
    ["wider than a bigint", "9223372036854775808"],
    ["twenty digits", "10000000000000000000"],
    ["very long", "9".repeat(5_000)],
  ])("is refused when it is %s", async (_description, expectedRevision) => {
    await expectRefusedAsUnreadable(bodyWith({ expectedRevision }));
  });

  it("is a revision that moved, not a refusal, at the widest a bigint holds", async () => {
    const { cookie } = await administrator();

    const answer = await postText(
      cookie,
      bodyWith({ expectedRevision: "9223372036854775807" }),
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });
});

describe("an item that is not one", () => {
  const KINDS_WITH_THEIR_ID_MEMBER = [
    ["material", "tierId"],
    ["hardware", "tierId"],
    ["finish", "finishId"],
    ["handle", "handle"],
    ["accessory", "accessoryId"],
  ] as const;

  it.each([
    "Material",
    "MATERIAL",
    "material ",
    " material",
    "cabinet",
    "constructor",
    "hasOwnProperty",
    "toString",
    "valueOf",
    "__proto__",
    "",
  ])("is refused when its kind is %j", async (kind) => {
    await expectRefusedAsUnreadable(
      bodyWith({ item: { kind, tierId: "material.painted-mdf" } }),
    );
  });

  it.each(
    KINDS_WITH_THEIR_ID_MEMBER.flatMap(([kind, own]) =>
      KINDS_WITH_THEIR_ID_MEMBER.filter(([, other]) => other !== own).map(
        ([, other]) => [kind, other] as const,
      ),
    ),
  )("is refused when a %s names its id as %s", async (kind, member) => {
    await expectRefusedAsUnreadable(
      bodyWith({ item: { kind, [member]: "black" } }),
    );
  });

  it.each(KINDS_WITH_THEIR_ID_MEMBER)(
    "is refused when a %s carries a member beyond its id, however it is named",
    async (kind, member) => {
      const { cookie } = await administrator();
      const headBefore = await availabilityHead();

      for (const extra of ["extra", "kind", "__proto__", "constructor"]) {
        const item = JSON.parse(
          `{"kind":"${kind}","${member}":"black","${extra}":"x"}`,
        ) as unknown;
        const answer = await postText(cookie, bodyWith({ item }));
        expect(answer.status, extra).toBe(400);
      }
      expect(priceStoreAsks.count).toBe(0);
      expect(await availabilityHead()).toBe(headBefore);
    },
  );

  it.each([
    ["a null", null],
    ["a number", 7],
    ["text", "material.painted-mdf"],
    ["a list of the kind and the id", ["material", "material.painted-mdf"]],
    ["a boolean", true],
  ])("is refused when it is %s", async (_description, item) => {
    await expectRefusedAsUnreadable(bodyWith({ item }));
  });

  it.each([
    ["a handle with a trailing space", "black "],
    ["a handle in capitals", "BLACK"],
    ["a handle the product does not have", "gold"],
    ["a handle inherited from every object", "constructor"],
  ])("is refused as %s", async (_description, handle) => {
    await expectRefusedAsUnreadable(
      bodyWith({ item: { kind: "handle", handle } }),
    );
  });

  it("is refused one character past the bound on an id, and is the book's to judge at the bound", async () => {
    const { cookie } = await administrator();
    const headBefore = await availabilityHead();
    const atBound = "m".repeat(MAX_IDENTIFIER_LENGTH);
    const pastBound = "m".repeat(MAX_IDENTIFIER_LENGTH + 1);

    const accepted = await switchItem(
      cookie,
      { kind: "material", tierId: atBound },
      false,
    );
    const refused = await switchItem(
      cookie,
      { kind: "material", tierId: pastBound },
      false,
    );

    expect(accepted.status).toBe(409);
    expect(await jsonOf(accepted)).toEqual({
      status: "item-not-in-active-book",
    });
    expect(refused.status).toBe(400);
    expect(await availabilityHead()).toBe(headBefore);
  });

  it.each([
    ["control characters", "material.\u0000\u0007\u001b"],
    ["a bidi override", "material.‮evil"],
    ["an emoji", "material.\u{1F600}"],
    ["decomposed text", "material.páinted-mdf"],
    ["a name every object has", "constructor"],
    ["the prototype", "__proto__"],
    ["a path", "../../etc/passwd"],
    ["SQL", "'; drop table catalogue_availability_changes; --"],
    ["a different case of a real id", "MATERIAL.PAINTED-MDF"],
  ])(
    "is judged by the book, and not stated, when its id holds %s: nothing is written",
    async (_description, tierId) => {
      const { cookie } = await administrator();
      const headBefore = await availabilityHead();

      const off = await switchItem(cookie, { kind: "material", tierId }, false);
      const on = await switchItem(cookie, { kind: "material", tierId }, true);

      expect([off.status, on.status]).toEqual([409, 409]);
      expect(await jsonOf(off)).toEqual({ status: "item-not-in-active-book" });
      expect(await availabilityHead()).toBe(headBefore);
      expect(activationRows()).toEqual([]);
    },
  );
});

describe("a flag and a body that are not what they declare", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["null", null],
    ["the text true", "true"],
    ["an empty list", []],
    ["an empty object", {}],
  ])("refuses an `active` of %s", async (_description, active) => {
    await expectRefusedAsUnreadable(bodyWith({ active }));
  });

  it.each(["null", "true", "7", '"text"', "[]", "[[]]", "", " ", "\u0000"])(
    "refuses the body %j",
    async (text) => {
      await expectRefusedAsUnreadable(text);
    },
  );

  it("refuses an own `__proto__` member beside the three, as a fourth", async () => {
    await expectRefusedAsUnreadable(
      `{"expectedRevision":"0","item":{"kind":"material","tierId":"material.painted-mdf"},"active":false,"__proto__":{"role":"administrator"}}`,
    );
  });

  it("reads the last of a member that is repeated, as JSON does, and still judges it", async () => {
    const { cookie } = await administrator();
    const head = await availabilityHead();

    const answer = await postText(
      cookie,
      `{"expectedRevision":"x","expectedRevision":"${head}","item":{"kind":"material","tierId":"x"},"item":{"kind":"material","tierId":"material.painted-mdf"},"active":true,"active":false}`,
    );

    expect(answer.status).toBe(200);
    expect(await disabledNow()).toEqual([PAINTED]);
  });

  it("exports no method but POST", async () => {
    const route = await import("@/app/api/staff/prices/availability/route");

    const handlers = Object.keys(route).filter((name) =>
      ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(name),
    );

    expect(handlers).toEqual([]);
    expect(Object.keys(route)).toContain("POST");
  });
});

describe("any JSON at all", () => {
  it("is never a 5xx, never leaks a cause, and writes only when it answers 200", async () => {
    const { cookie } = await administrator();

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.json(),
          fc.jsonValue().map((value) => JSON.stringify(value)),
          fc
            .record({
              expectedRevision: fc.oneof(fc.string(), fc.constant("0")),
              item: fc.oneof(
                fc.jsonValue(),
                fc.record(
                  {
                    kind: fc.oneof(
                      fc.string(),
                      fc.constantFrom(
                        "material",
                        "hardware",
                        "finish",
                        "handle",
                        "accessory",
                      ),
                    ),
                    tierId: fc.string({ maxLength: 70 }),
                    handle: fc.string({ maxLength: 8 }),
                  },
                  { requiredKeys: ["kind"] },
                ),
              ),
              active: fc.oneof(fc.boolean(), fc.jsonValue()),
            })
            .map((value) => JSON.stringify(value)),
        ),
        async (text) => {
          const headBefore = await availabilityHead();
          const rowsBefore = allRows().length;

          const answer = await postText(cookie, text);

          expect([200, 400, 409]).toContain(answer.status);
          if (answer.status !== 200) {
            expect(await availabilityHead(), text).toBe(headBefore);
            expect(allRows().length, text).toBe(rowsBefore);
          }
        },
      ),
      { numRuns: 150 },
    );
  }, 60_000);
});

describe("saved defaults that name each of the six settings", () => {
  const HANDLE_ITEM = (handle: string): ItemRef =>
    ({ kind: "handle", handle }) as ItemRef;

  // The one handle and the one colour here that no kitchen falls back to, so only the saved row protects them.
  const A_COLOUR_NO_MATERIAL_FALLS_BACK_TO = "pal.antracit";

  it.each<[string, NewKitchenSettings, ItemRef]>([
    ["materialTierId", { materialTierId: "material.veneer" }, VENEER],
    [
      "hardwareTierId",
      { hardwareTierId: "hardware.soft-close" },
      { kind: "hardware", tierId: "hardware.soft-close" },
    ],
    ["handle", { handle: "black" }, HANDLE_ITEM("black")],
    ["topRowHandle", { topRowHandle: "black" }, HANDLE_ITEM("black")],
    [
      "finish",
      { finish: paletteFinish(A_COLOUR_NO_MATERIAL_FALLS_BACK_TO) },
      { kind: "finish", finishId: A_COLOUR_NO_MATERIAL_FALLS_BACK_TO },
    ],
  ])(
    "protects the item the %s names, naming it in the answer, and writes nothing",
    async (_key, defaults, item) => {
      const admin = await administrator();
      await saveDefaults(admin, defaults);
      const headBefore = await availabilityHead();

      const answer = await switchItem(admin.cookie, item, false);

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: "item-is-default", item });
      expect(await availabilityHead()).toBe(headBefore);
      expect(activationRows()).toEqual([]);
    },
  );

  it("lets any other item go while a saved default names an item the book does not state", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { materialTierId: "material.unheard-of" });

    const answer = await switchItem(admin.cookie, PAINTED, false);

    expect(answer.status).toBe(200);
  });
});

describe("a saved row that is hostile", () => {
  function savedRow(defaults: unknown) {
    return {
      kind: "saved",
      saved: { revision: "1", defaults, savedAt: new Date(0) },
    } as const;
  }

  it.each([
    [
      "an own __proto__ member",
      JSON.parse('{"__proto__":{"handle":"steel"}}') as unknown,
    ],
    [
      "a constructor member",
      JSON.parse('{"constructor":{"prototype":{"x":1}}}') as unknown,
    ],
    ["a very long material id", { materialTierId: "m".repeat(100_000) }],
    ["an enormous list", Array.from({ length: 50_000 }, () => ({}))],
    [
      "a deeply nested value",
      {
        finish: JSON.parse(
          `${"[".repeat(2_000)}${"]".repeat(2_000)}`,
        ) as unknown,
      },
    ],
    ["a function", () => ({})],
  ])(
    "is a 503 that writes nothing and pollutes nothing, for a row holding %s",
    async (_description, defaults) => {
      const { cookie } = await administrator();
      vi.spyOn(prices.defaults, "read").mockResolvedValue(
        savedRow(defaults) as never,
      );
      const headBefore = await availabilityHead();

      const answer = await switchItem(cookie, VENEER, false);

      expect(answer.status).toBe(503);
      expect(await availabilityHead()).toBe(headBefore);
      expect(activationRows()).toEqual([]);
      const anyObject: Record<string, unknown> = {};
      expect(anyObject.handle).toBeUndefined();
      expect(anyObject.x).toBeUndefined();
    },
  );
});
