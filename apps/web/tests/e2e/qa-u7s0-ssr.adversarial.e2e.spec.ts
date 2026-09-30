// M7B U7 S0 adversarial QA (ADR 0133; backlog 98 and 83). The implementer's `ssr-first-frame` spec
// proves the chip count per shape and interleaves a U with a straight room. This attacks what that
// leaves open:
//
// - **isolation across users and within a shape.** Two owners, each with their own cookies; two Us
//   of different sizes (four chips each, so a swap between them is invisible to a chip count), an L
//   and a straight room. Every response is checked against its own design's whole server-rendered
//   fingerprint: chips, the price total (a function of every body), `data-updated-at` (seeded
//   distinct per design), `data-cabinet-depth` and the session id. A foreign owner's `/d` rides in
//   the same burst and must answer the unavailable page with no kitchen in it;
// - **the share view's exposure**: no real design id or revision anywhere in the HTML, no cookie set;
// - **the first frame of an L that is not the seeded L**: chips cannot tell the two apart (3 and 3),
//   so every painted frame's price total is sampled from first paint, on `/d` and on `/s`;
// - **after hydration**: a client transition `/s` → `/d` → another `/d` lands on each design, an edit
//   there autosaves to **that** design (PUT 200, the previous one untouched), and a reload's raw HTML
//   already carries the edit.
//
// Rows minted here are deleted in `afterEach` (ADR 0006), and the count deleted is asserted.
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type Design,
  type RoomInput,
} from "@lemnaria/configurator-domain";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import {
  deleteMintedDesigns,
  findMintedDesignIds,
} from "./support/minted-designs";
import { issueShareLink } from "./support/seeded-design";
import { composeKitchen, seedDesign } from "./support/u-design";

const HEIGHT_MM = 2600;
const SHARE_VIEW_SESSION_ID = "shared-view";
const REQUESTS_PER_ROUTE = 8;
const SAVE_TIMEOUT_MS = 15_000;
/** A client transition fetches the next route's RSC payload, which under a parallel run can take
 *  longer than `expect.poll`'s 5 s default. */
const TRANSITION_TIMEOUT_MS = 15_000;

interface KitchenSpec {
  readonly name: string;
  readonly input: RoomInput;
  readonly cameraChips: number;
  /** Seeded distinct per kitchen, so the fingerprint names its design even where price could tie. */
  readonly updatedAt: string;
}

const U_MIDDLE: KitchenSpec = {
  name: "U 4500/3000/3600",
  input: {
    shape: "U",
    wallAMm: 4500,
    wallBMm: 3000,
    wallCMm: 3600,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 4,
  updatedAt: "2026-01-02T00:00:00.000Z",
};
const U_LARGE: KitchenSpec = {
  name: "U 6000/3000/3000",
  input: {
    shape: "U",
    wallAMm: 6000,
    wallBMm: 3000,
    wallCMm: 3000,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 4,
  updatedAt: "2026-01-03T00:00:00.000Z",
};
/** Not the seeded L (3560 x 2920): same chip count, different kitchen. */
const L_OWN: KitchenSpec = {
  name: "L 3700/3400",
  input: {
    shape: "L",
    wallAMm: 3700,
    wallBMm: 3400,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 3,
  updatedAt: "2026-01-04T00:00:00.000Z",
};
const STRAIGHT: KitchenSpec = {
  name: "straight 3700",
  input: { shape: "linear", wallAMm: 3700, heightMm: HEIGHT_MM },
  cameraChips: 2,
  updatedAt: "2026-01-05T00:00:00.000Z",
};

interface Seeded {
  readonly spec: KitchenSpec;
  readonly id: string;
  readonly revision: string;
  readonly designPath: string;
  readonly sharePath: string;
}

interface Fingerprint {
  readonly cameraChips: number;
  readonly sessionId: string;
  readonly price: string;
  readonly updatedAt: string;
  readonly cabinetDepth: string;
}

function designFor(spec: KitchenSpec): Design {
  const validation = validateRoomInput(spec.input, APPROVED_ROOM_POLICY);
  if (!validation.ok) {
    throw new Error(`the approved policy refuses ${spec.name}`);
  }
  return { ...composeKitchen(validation.room), updatedAt: spec.updatedAt };
}

async function seed(
  page: Page,
  minted: string[],
  spec: KitchenSpec,
): Promise<Seeded> {
  const seeded = await seedDesign(page, designFor(spec));
  minted.push(seeded.id);
  const sharePath = await issueShareLink(page, seeded);
  return {
    spec,
    id: seeded.id,
    revision: seeded.revision,
    designPath: `/ro/d/${seeded.id}`,
    sharePath: `/ro${sharePath}`,
  };
}

async function ownerPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const baseURL = testInfo.project.use.baseURL;
  if (baseURL === undefined) throw new Error("the project declares no baseURL");
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  return context.newPage();
}

function attribute(html: string, name: string): string {
  const match = new RegExp(
    `data-testid="selection-debug"[^>]*\\s${name}="([^"]*)"`,
  ).exec(html);
  if (match === null) throw new Error(`the HTML carries no ${name}`);
  return match[1] ?? "";
}

function cameraChipCount(html: string): number {
  const row = new RegExp(
    `role="group"\\s+aria-label="${ro.configure.cameraGroupLabel}"[^>]*>([\\s\\S]*?)</div>`,
  ).exec(html);
  if (row === null) return 0;
  return (row[1] ?? "").split("<button").length - 1;
}

function fingerprintOf(html: string): Fingerprint {
  const price = /data-testid="price-bar-total">([^<]*)</.exec(html);
  return {
    cameraChips: cameraChipCount(html),
    sessionId: attribute(html, "data-design-id"),
    price: price?.[1] ?? "",
    updatedAt: attribute(html, "data-updated-at"),
    cabinetDepth: attribute(html, "data-cabinet-depth"),
  };
}

async function htmlOf(
  requests: APIRequestContext,
  path: string,
): Promise<string> {
  const response = await requests.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

async function deleteAndCount(minted: string[]): Promise<void> {
  const ids = minted.splice(0);
  await deleteMintedDesigns(ids);
  expect(await findMintedDesignIds(ids), "rows left behind").toEqual([]);
}

test.describe("U7 S0 adversarial: isolation across users and within a shape", () => {
  const minted: string[] = [];

  test.afterEach(async () => {
    await deleteAndCount(minted);
  });

  test("a burst of /d and /s across two owners and two Us answers each request with its own design", async ({
    browser,
    request: stranger,
  }, testInfo) => {
    test.setTimeout(120_000);
    const ownerA = await ownerPage(browser, testInfo);
    const ownerB = await ownerPage(browser, testInfo);
    const kitchensA = [
      await seed(ownerA, minted, U_MIDDLE),
      await seed(ownerA, minted, L_OWN),
    ];
    const kitchensB = [
      await seed(ownerB, minted, U_LARGE),
      await seed(ownerB, minted, STRAIGHT),
    ];
    const owned = [
      ...kitchensA.map((kitchen) => ({ kitchen, owner: ownerA.request })),
      ...kitchensB.map((kitchen) => ({ kitchen, owner: ownerB.request })),
    ];

    const baseline = new Map<string, Fingerprint>();
    for (const { kitchen, owner } of owned) {
      const own = fingerprintOf(await htmlOf(owner, kitchen.designPath));
      expect(own.cameraChips, kitchen.spec.name).toBe(kitchen.spec.cameraChips);
      expect(own.sessionId, kitchen.spec.name).toBe(kitchen.id);
      expect(own.updatedAt, kitchen.spec.name).toBe(kitchen.spec.updatedAt);
      expect(own.price, kitchen.spec.name).not.toBe("");
      baseline.set(kitchen.id, own);
    }
    const prices = [...baseline.values()].map((print) => print.price);
    expect(new Set(prices).size, `prices ${prices.join(" | ")}`).toBe(4);

    const burst = owned.flatMap(({ kitchen, owner }) => {
      const foreign =
        owner === ownerA.request ? ownerB.request : ownerA.request;
      return Array.from({ length: REQUESTS_PER_ROUTE }, () => [
        {
          kind: "owner" as const,
          kitchen,
          requests: owner,
          path: kitchen.designPath,
        },
        {
          kind: "share" as const,
          kitchen,
          requests: stranger,
          path: kitchen.sharePath,
        },
        {
          kind: "foreign" as const,
          kitchen,
          requests: foreign,
          path: kitchen.designPath,
        },
      ]).flat();
    });
    const shuffled = burst
      .map((entry, index) => ({ entry, key: (index * 7919) % burst.length }))
      .sort((a, b) => a.key - b.key)
      .map(({ entry }) => entry);

    const answers = await Promise.all(
      shuffled.map(async (entry) => ({
        entry,
        html: await htmlOf(entry.requests, entry.path),
      })),
    );

    const wrong: string[] = [];
    for (const { entry, html } of answers) {
      const own = baseline.get(entry.kitchen.id);
      const label = `${entry.kind} ${entry.kitchen.spec.name}`;
      if (entry.kind === "foreign") {
        if (cameraChipCount(html) !== 0 || html.includes("price-bar-total")) {
          wrong.push(`${label}: a foreign owner was served a kitchen`);
        }
        continue;
      }
      const got = fingerprintOf(html);
      const expected = {
        ...own,
        sessionId:
          entry.kind === "owner" ? entry.kitchen.id : SHARE_VIEW_SESSION_ID,
      };
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        wrong.push(`${label}: ${JSON.stringify(got)}`);
      }
    }
    expect(answers).toHaveLength(owned.length * REQUESTS_PER_ROUTE * 3);
    expect(wrong).toEqual([]);
  });

  test("the share view's HTML carries no real design id, no revision, and sets no visitor or design cookie", async ({
    page,
    request: stranger,
  }) => {
    const kitchen = await seed(page, minted, U_MIDDLE);

    const response = await stranger.get(kitchen.sharePath);
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(attribute(html, "data-design-id")).toBe(SHARE_VIEW_SESSION_ID);
    expect(html.includes(kitchen.id), "the design id").toBe(false);
    // A revision is a small integer, so it is looked for as a value under a `revision` key (plain
    // or RSC-escaped JSON), not as a bare substring: the only one allowed is the view's sentinel.
    const revisions = [...html.matchAll(/\\?"revision\\?":\\?"([^"\\]*)/g)].map(
      (match) => match[1],
    );
    expect(
      revisions.filter((revision) => revision !== "shared"),
      "a real revision",
    ).toEqual([]);
    const ownersHtml = await htmlOf(page.request, kitchen.designPath);
    expect(
      [...ownersHtml.matchAll(/\\?"revision\\?":\\?"([^"\\]*)/g)].map(
        (match) => match[1],
      ),
      "the owner's page carries its revision, so the pattern above can see one",
    ).toContain(kitchen.revision);
    // next-intl's own `NEXT_LOCALE` is the one cookie any page may set; no visitor or design cookie.
    const setCookies = (response.headers()["set-cookie"] ?? "")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("NEXT_LOCALE="));
    expect(setCookies).toEqual([]);
  });
});

/** React's hydration complaints in **both** builds. Development names them ("Hydration failed …");
 *  a production build throws the minified codes instead (418 text/content, 419 and 423 recoverable
 *  hydration errors, 425 text), which a `/hydrat/` pattern alone never sees — measured on this
 *  branch: a provoked text mismatch under `next start` reports only "Minified React error #418". */
const HYDRATION_COMPLAINT =
  /hydrat|did not match|didn't match|React error #(418|419|423|425)\b/i;

function collectHydrationComplaints(page: Page): string[] {
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      HYDRATION_COMPLAINT.test(message.text())
    ) {
      complaints.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (HYDRATION_COMPLAINT.test(error.message)) complaints.push(error.message);
  });
  return complaints;
}

interface SamplerOptions {
  readonly groupLabel: string;
}

/** From the document's first moment, on every frame: the chip count and the price total. */
function sampleEveryFrame({ groupLabel }: SamplerOptions): void {
  const samples: { chips: number; price: string }[] = [];
  Reflect.set(window, "__qaFrames", samples);
  const sample = (): void => {
    const row = document.querySelector(
      `[role="group"][aria-label="${groupLabel}"]`,
    );
    const price = document.querySelector('[data-testid="price-bar-total"]');
    if (row !== null && price !== null) {
      samples.push({
        chips: row.querySelectorAll("button").length,
        price: price.textContent,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

test.describe("U7 S0 adversarial: no painted frame shows another kitchen", () => {
  const minted: string[] = [];

  test.afterEach(async () => {
    await deleteAndCount(minted);
  });

  for (const route of ["designPath", "sharePath"] as const) {
    test(`a reload of ${route === "designPath" ? "/d" : "/s"} for an L that is not the seeded L paints only its own price, with no hydration complaint`, async ({
      page,
    }) => {
      const kitchen = await seed(page, minted, L_OWN);
      const serverPrice = fingerprintOf(
        await htmlOf(page.request, kitchen[route]),
      ).price;
      const complaints = collectHydrationComplaints(page);
      await page.addInitScript(sampleEveryFrame, {
        groupLabel: ro.configure.cameraGroupLabel,
      });

      await page.goto(kitchen[route]);
      await page.reload();
      await page.waitForSelector("canvas", { state: "attached" });
      await expect(page.getByTestId("price-bar-total")).toHaveText(serverPrice);

      const frames = await page.evaluate(
        () =>
          Reflect.get(window, "__qaFrames") as {
            chips: number;
            price: string;
          }[],
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(
        frames.filter(
          (frame) => frame.price !== serverPrice || frame.chips !== 3,
        ),
      ).toEqual([]);
      expect(complaints).toEqual([]);
    });
  }
});

async function pushClientSide(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    const next = Reflect.get(window, "next") as {
      router: { push: (href: string) => void };
    };
    next.router.push(target);
  }, path);
}

async function sessionIdOnPage(page: Page): Promise<string> {
  return (
    (await page
      .getByTestId("selection-debug")
      .getAttribute("data-design-id")) ?? ""
  );
}

test.describe("U7 S0 adversarial: after hydration, the session store is the loaded design", () => {
  const minted: string[] = [];

  test.afterEach(async () => {
    await deleteAndCount(minted);
  });

  test("/s → /d → another /d by client transition lands on each, and an edit saves to the last one only", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const first = await seed(page, minted, U_MIDDLE);
    const second = await seed(page, minted, STRAIGHT);
    const firstHtml = await htmlOf(page.request, first.designPath);
    const secondHtml = await htmlOf(page.request, second.designPath);
    const navigationsBefore: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigationsBefore.push(frame.url());
    });

    await page.goto(first.sharePath);
    await expect(page.getByTestId("selection-debug")).toHaveAttribute(
      "data-design-id",
      SHARE_VIEW_SESSION_ID,
    );
    // The server's HTML already says `shared-view`; the canvas mounts only on the client, so it is
    // what says the router is live and a push will not land on a page still hydrating.
    await page.waitForSelector("canvas", { state: "attached" });
    const documentMarker = await page.evaluate(() => {
      Reflect.set(window, "__qaSameDocument", true);
      return true;
    });

    await pushClientSide(page, first.designPath);
    await expect
      .poll(() => sessionIdOnPage(page), { timeout: TRANSITION_TIMEOUT_MS })
      .toBe(first.id);
    await expect(page.getByTestId("price-bar-total")).toHaveText(
      fingerprintOf(firstHtml).price,
    );

    await pushClientSide(page, second.designPath);
    await expect
      .poll(() => sessionIdOnPage(page), { timeout: TRANSITION_TIMEOUT_MS })
      .toBe(second.id);
    await expect(page.getByTestId("price-bar-total")).toHaveText(
      fingerprintOf(secondHtml).price,
    );
    await expect(
      page
        .getByRole("group", { name: ro.configure.cameraGroupLabel })
        .getByRole("button"),
    ).toHaveCount(STRAIGHT.cameraChips);
    expect(documentMarker).toBe(true);
    expect(
      await page.evaluate(
        () => Reflect.get(window, "__qaSameDocument") === true,
      ),
      "the transitions were client-side, not document loads",
    ).toBe(true);

    await expect(page.getByTestId("global-settings-trigger")).toBeEnabled();
    const depthBefore = fingerprintOf(secondHtml).cabinetDepth;
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/api/designs/"),
      { timeout: SAVE_TIMEOUT_MS },
    );
    await page.getByTestId("global-settings-trigger").tap();
    await expect(page.getByTestId("global-settings-surface")).toBeVisible();
    await page
      .getByTestId("global-settings-depth-option")
      .locator("input:not(:checked)")
      .first()
      .tap();
    await page.getByTestId("global-settings-apply").tap();
    const put = await saved;

    expect(put.status()).toBe(200);
    expect(put.url()).toContain(`/api/designs/${second.id}`);
    const secondAfter = fingerprintOf(
      await htmlOf(page.request, second.designPath),
    );
    const firstAfter = fingerprintOf(
      await htmlOf(page.request, first.designPath),
    );
    expect(secondAfter.cabinetDepth).not.toBe(depthBefore);
    expect(secondAfter.updatedAt).not.toBe(STRAIGHT.updatedAt);
    expect(firstAfter).toEqual(fingerprintOf(firstHtml));

    await page.reload();
    await expect(page.getByTestId("selection-debug")).toHaveAttribute(
      "data-cabinet-depth",
      secondAfter.cabinetDepth,
    );
  });
});
