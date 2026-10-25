// Step 1 when the mint is refused for the day's limit, in a real browser, at 390 x 844.
//
// The refusal is the browser's own interception of `POST /api/designs`, answered with the shape the route gives
// (`rate-limited-response.ts`): no row is made and no database is touched for it. A control test then runs the
// same journey with nothing intercepted, so the state under test is shown to come from the answer and not from
// the journey.
import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { expectEditorTopBarShown } from "./support/editor-top-bar";

const THE_TYPED_ROOM =
  "/ro/configurator/room?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";
const AS_TYPED = { wallA: "3560", wallB: "4250", height: "2700" } as const;
const MINT_ENDPOINT = "**/api/designs";

interface RoomMessages {
  readonly room: {
    readonly compose: {
      readonly limitReached: string;
      readonly saveFailed: string;
    };
  };
}

const messages = JSON.parse(
  readFileSync(new URL("../../src/messages/ro.json", import.meta.url), "utf8"),
) as RoomMessages;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

function notice(page: Page): Locator {
  return page.getByTestId("room-compose-notice");
}

/** Counts what the page sends to the mint and to a save, and answers every mint with `status`. */
async function refuseTheMint(
  page: Page,
  status: number,
  headers: Record<string, string>,
  code: string,
): Promise<{ mints: () => number; saves: () => number }> {
  let mints = 0;
  let saves = 0;
  await page.route(MINT_ENDPOINT, async (route) => {
    if (route.request().method() === "POST") {
      mints += 1;
      await route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify({ code }),
      });
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    if (request.method() === "PUT") saves += 1;
  });
  return { mints: () => mints, saves: () => saves };
}

async function composeTheTypedRoom(page: Page): Promise<void> {
  await page.goto(THE_TYPED_ROOM);
  await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
    "data-room-substate",
    "1D",
  );
  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose")).toBeVisible();
}

test("a mint refused for the day's limit offers no retry, sends no save and keeps the room", async ({
  page,
}) => {
  const sent = await refuseTheMint(
    page,
    429,
    { "retry-after": "3600" },
    "MINT_LIMIT_REACHED",
  );

  await composeTheTypedRoom(page);

  await expect(notice(page)).toHaveAttribute("data-compose-handoff", "limited");
  await expect(notice(page)).toContainText(messages.room.compose.limitReached);
  await expect(page.getByTestId("room-compose-retry")).toHaveCount(0);
  await expect(page.getByTestId("room-compose-cta")).toHaveCount(0);
  await expect(page.getByTestId("room-compose-rows")).toBeVisible();

  expect(sent.mints()).toBe(1);
  expect(sent.saves()).toBe(0);
  await expect(page).toHaveURL(/\/configurator\/room/);

  await page.getByTestId("room-compose-back").click();
  for (const [field, text] of Object.entries(AS_TYPED)) {
    await expect(page.getByTestId(`room-length-${field}`)).toHaveValue(text);
  }
});

test("a mint that is unavailable shows the failure Step 1 already shows, with its retry", async ({
  page,
}) => {
  await refuseTheMint(page, 503, {}, "MINT_UNAVAILABLE");

  await composeTheTypedRoom(page);

  await expect(notice(page)).toHaveAttribute("data-compose-handoff", "failed");
  await expect(notice(page)).toContainText(messages.room.compose.saveFailed);
  await expect(page.getByTestId("room-compose-retry")).toBeVisible();
});

test("a 429 that is not the limit's keeps the failure Step 1 already shows, with its retry", async ({
  page,
}) => {
  await refuseTheMint(page, 429, {}, "FIREWALL");

  await composeTheTypedRoom(page);

  await expect(notice(page)).toHaveAttribute("data-compose-handoff", "failed");
  await expect(page.getByTestId("room-compose-retry")).toBeVisible();
});

test("the same journey with nothing intercepted reaches the editor, so the state above is the answer's", async ({
  page,
}) => {
  await composeTheTypedRoom(page);

  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  if (id !== undefined) mintedDesignIds.push(decodeURIComponent(id));

  await expectEditorTopBarShown(page);
});
