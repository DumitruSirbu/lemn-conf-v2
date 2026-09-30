// M7B U7 S0 (ADR 0133, backlog 98): **the first server-rendered frame of `/d/{id}` and `/s/{token}` is
// the loaded design.**
//
// Raw HTML through `request.get`, so no JavaScript runs: what is asserted is what the server sent, not
// what React made of it afterwards. An L, a straight room and a U each answer with their own camera
// chips (3, 2 and 4) on both routes, and twenty interleaved requests for a U and a straight room each
// answer with their own — a process-wide store written per request is what would swap them.
//
// **Must not run concurrently with any other persistence live run**: this mints real rows (ADR 0006's
// per-row cleanup applies, and `afterEach` deletes them, including when a test fails).
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
  type Page,
} from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import { deleteMintedDesigns } from "./support/minted-designs";
import { issueShareLink } from "./support/seeded-design";
import { composeKitchen, seedDesign } from "./support/u-design";

const HEIGHT_MM = 2600;
const L_ROOM: RoomInput = {
  shape: "L",
  wallAMm: 3700,
  wallBMm: 3400,
  heightMm: HEIGHT_MM,
  cornerDirection: "left",
};
const STRAIGHT_ROOM: RoomInput = {
  shape: "linear",
  wallAMm: 3700,
  heightMm: HEIGHT_MM,
};
const U_ROOM: RoomInput = {
  shape: "U",
  wallAMm: 4500,
  wallBMm: 3000,
  wallCMm: 3600,
  heightMm: HEIGHT_MM,
  cornerDirection: "left",
};

const CONCURRENT_REQUESTS = 20;

/** What a share view calls the session it hydrates (`SHARED_VIEW_DESIGN_ID`), published by
 *  `SelectionDebug` as `data-design-id` — deliberately never a real design id. */
const SHARE_VIEW_SESSION_ID = "shared-view";

interface SeededKitchen {
  readonly name: string;
  readonly cameraChips: number;
  readonly designId: string;
  readonly designPath: string;
  readonly sharePath: string;
}

function designFor(input: RoomInput): Design {
  const validation = validateRoomInput(input, APPROVED_ROOM_POLICY);
  if (!validation.ok) {
    throw new Error(`the approved policy refuses ${JSON.stringify(input)}`);
  }
  return composeKitchen(validation.room);
}

/** Mints `input`'s kitchen, and a share link for it, from inside `page` — the write-token and visitor
 *  cookies are the browser's own, which is what `/d/{id}`'s owner gate reads. */
async function seedKitchen(
  page: Page,
  mintedIds: string[],
  spec: { name: string; input: RoomInput; cameraChips: number },
): Promise<SeededKitchen> {
  const seeded = await seedDesign(page, designFor(spec.input));
  mintedIds.push(seeded.id);
  const sharePath = await issueShareLink(page, seeded);
  return {
    name: spec.name,
    cameraChips: spec.cameraChips,
    designId: seeded.id,
    designPath: `/ro/d/${seeded.id}`,
    sharePath: `/ro${sharePath}`,
  };
}

function cameraChipCount(html: string): number {
  const label = ro.configure.cameraGroupLabel;
  const row = new RegExp(
    `role="group"\\s+aria-label="${label}"[^>]*>([\\s\\S]*?)</div>`,
  ).exec(html);
  if (row === null) throw new Error("the HTML carries no camera row");
  return (row[1] ?? "").split("<button").length - 1;
}

function totalInHtml(html: string): string {
  const total = /data-testid="price-bar-total">([^<]*)</.exec(html);
  if (total === null) throw new Error("the HTML carries no price total");
  return total[1] ?? "";
}

function sessionIdInHtml(html: string): string {
  const id =
    /data-testid="selection-debug"[^>]*\sdata-design-id="([^"]*)"/.exec(html);
  if (id === null) throw new Error("the HTML carries no session id");
  return id[1] ?? "";
}

async function rawHtml(
  requests: APIRequestContext,
  path: string,
): Promise<string> {
  const response = await requests.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

/** The price is the design's own figure, so the server's must be the one the browser settles on
 *  (`toHaveText` compares with whitespace normalised, non-breaking spaces included). */
async function expectBrowserShowsTheSamePrice(
  page: Page,
  path: string,
  serverHtml: string,
): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("price-bar-total")).toHaveText(
    totalInHtml(serverHtml),
  );
}

test.describe("the first server-rendered frame is the loaded design (U7 S0)", () => {
  const mintedIds: string[] = [];

  test.afterEach(async () => {
    await deleteMintedDesigns(mintedIds.splice(0));
  });

  test("an L, a straight room and a U each send their own camera chips, on /d and on /s", async ({
    page,
    request: stranger,
  }) => {
    const kitchens = [
      await seedKitchen(page, mintedIds, {
        name: "L 3700/3400",
        input: L_ROOM,
        cameraChips: 3,
      }),
      await seedKitchen(page, mintedIds, {
        name: "straight 3700",
        input: STRAIGHT_ROOM,
        cameraChips: 2,
      }),
      await seedKitchen(page, mintedIds, {
        name: "U 4500/3000/3600",
        input: U_ROOM,
        cameraChips: 4,
      }),
    ];

    // `stranger` is the `request` fixture: its own cookie jar, so it holds only the link.
    for (const kitchen of kitchens) {
      const ownersHtml = await rawHtml(page.request, kitchen.designPath);
      const sharedHtml = await rawHtml(stranger, kitchen.sharePath);

      expect(cameraChipCount(ownersHtml), `/d for ${kitchen.name}`).toBe(
        kitchen.cameraChips,
      );
      expect(cameraChipCount(sharedHtml), `/s for ${kitchen.name}`).toBe(
        kitchen.cameraChips,
      );
      expect(sessionIdInHtml(ownersHtml), `/d for ${kitchen.name}`).toBe(
        kitchen.designId,
      );
      expect(sessionIdInHtml(sharedHtml), `/s for ${kitchen.name}`).toBe(
        SHARE_VIEW_SESSION_ID,
      );
      await expectBrowserShowsTheSamePrice(
        page,
        kitchen.designPath,
        ownersHtml,
      );
      await expectBrowserShowsTheSamePrice(page, kitchen.sharePath, sharedHtml);
    }
  });

  test("twenty interleaved concurrent requests for a U and a straight room each answer their own", async ({
    page,
    request: stranger,
  }) => {
    const straight = await seedKitchen(page, mintedIds, {
      name: "straight 3700",
      input: STRAIGHT_ROOM,
      cameraChips: 2,
    });
    const u = await seedKitchen(page, mintedIds, {
      name: "U 4500/3000/3600",
      input: U_ROOM,
      cameraChips: 4,
    });
    const interleaved = Array.from(
      { length: CONCURRENT_REQUESTS },
      (_, index) => (index % 2 === 0 ? u : straight),
    );

    const answers = await Promise.all(
      interleaved.flatMap((kitchen) => [
        rawHtml(page.request, kitchen.designPath).then(cameraChipCount),
        rawHtml(stranger, kitchen.sharePath).then(cameraChipCount),
      ]),
    );

    expect(answers).toEqual(
      interleaved.flatMap((kitchen) => [
        kitchen.cameraChips,
        kitchen.cameraChips,
      ]),
    );
  });

  for (const spec of [
    { name: "a U", input: U_ROOM, cameraChips: 4 },
    { name: "a straight room", input: STRAIGHT_ROOM, cameraChips: 2 },
  ]) {
    test(`a reload of /d/{id} for ${spec.name} paints no frame at the wrong chip count, and hydrates without a mismatch`, async ({
      page,
    }) => {
      const kitchen = await seedKitchen(page, mintedIds, spec);
      const hydrationComplaints = collectHydrationComplaints(page);
      await page.addInitScript(sampleCameraChipsEveryFrame, {
        groupLabel: ro.configure.cameraGroupLabel,
      });

      await page.goto(kitchen.designPath);
      await page.reload();
      await page.waitForSelector("canvas", { state: "attached" });
      await afterTwoFrames(page);

      const frames = await page.evaluate(readSampledChipCounts);
      expect(
        frames.length,
        "the sampler saw no frame with a camera row",
      ).toBeGreaterThan(0);
      expect(frames.filter((count) => count !== kitchen.cameraChips)).toEqual(
        [],
      );
      expect(hydrationComplaints).toEqual([]);
    });
  }
});

interface SamplerOptions {
  readonly groupLabel: string;
}

/** Runs in the page from the document's first moment (serialised, so it may not capture anything): on every animation frame, records how many
 *  camera chips the row shows, once there is a row to count. */
function sampleCameraChipsEveryFrame({ groupLabel }: SamplerOptions): void {
  const samples: number[] = [];
  Reflect.set(window, "__cameraChipSamples", samples);
  const sample = (): void => {
    const row = document.querySelector(
      `[role="group"][aria-label="${groupLabel}"]`,
    );
    if (row !== null) samples.push(row.querySelectorAll("button").length);
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

function readSampledChipCounts(): number[] {
  return Reflect.get(window, "__cameraChipSamples") as number[];
}

async function afterTwoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** React reports a server/client difference as a console error in development, and the Next overlay
 *  as a page error; either one names hydration. */
function collectHydrationComplaints(page: Page): string[] {
  const complaints: string[] = [];
  const isAboutHydration = (text: string): boolean =>
    /hydrat|did not match|didn't match/i.test(text);
  page.on("console", (message) => {
    if (message.type() === "error" && isAboutHydration(message.text())) {
      complaints.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (isAboutHydration(error.message)) complaints.push(error.message);
  });
  return complaints;
}
