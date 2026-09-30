// M7B U6 adversarial QA (docs/WORKFLOW.md step 3): the U's real product flow, the way a customer
// meets the switch — including the room the implementer's `u-flow.ts` steps around on purpose. Shared
// by the mobile and desktop specs so the two viewports run one journey:
//
// *În formă de U* -> *Continuă* -> 1B -> a room too small for its kitchen (ADR 0108 H3, RQ8) -> 1C with
// the room-level reason, no number, the straight-kitchen suggestion (W23, owner 2026-09-30) and no way
// on -> wall A fixed -> 1D -> 1F -> the editor -> reload -> a share link opened by a stranger.
import { readFileSync } from "node:fs";

import { expect, type Browser, type Page } from "@playwright/test";

import { issueShareLink, openSharedDesign } from "./seeded-design";
import { lengthField, roomScreen, type LengthField } from "./step-one-by-touch";
import {
  cameraPresetButtons,
  chooseUAndContinue,
  composeAndReload,
  ROOM,
  U_CAMERA_PRESETS,
} from "./u-steps";

/** The owner's H3 floor pair: wall A at its 2700 minimum, both side walls at 1000 — every field
 *  valid, and the kitchen refused. 3000 on wall A is the smallest fix with the side walls unmoved. */
const TOO_SMALL = {
  wallA: "2700",
  wallB: "1000",
  wallC: "1000",
  height: "2600",
} as const satisfies Record<LengthField, string>;
const FIXED_WALL_A = "3000";
const FIXED_U_ROOM = `${ROOM}?shape=U&wallA=3&wallB=1&wallC=1&height=2.6`;
const TOO_SMALL_U_ROOM = `${ROOM}?shape=U&wallA=2.7&wallB=1&wallC=1&height=2.6`;

interface RoomIssueLeaves {
  readonly room: {
    readonly issue: {
      readonly roomTooSmall: string;
      readonly orChooseLinear: string;
    };
  };
}

/** Read from `ro.json` by hand because `ro` (`romanian-content.e2e.ts`) resolves the content the
 *  screens read, and these two 1C leaves are not among them. */
const ROMANIAN = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ro.json", import.meta.url),
    "utf8",
  ),
) as RoomIssueLeaves;

async function typeTooSmallRoom(page: Page): Promise<void> {
  for (const field of Object.keys(TOO_SMALL) as LengthField[]) {
    const input = lengthField(page, field);
    await input.click();
    await input.pressSequentially(TOO_SMALL[field]);
  }
  await expect(page).toHaveURL(TOO_SMALL_U_ROOM);
}

async function expectTooSmallAtOneC(page: Page): Promise<void> {
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1C");
  await expect(page.getByTestId("room-room-reason")).toHaveText(
    ROMANIAN.room.issue.roomTooSmall,
  );
  await expect(page.getByTestId("room-linear-suggestion")).toHaveText(
    ROMANIAN.room.issue.orChooseLinear,
  );
  await expect(
    page.locator("[data-testid^='room-length-reason-']"),
  ).toHaveCount(0);
  await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
  await expect(page.getByTestId("room-one-c-status")).not.toHaveText(/\d/);
  await expect(page.getByTestId("room-continue")).toBeDisabled();
}

async function fixWallA(page: Page): Promise<void> {
  const wallA = lengthField(page, "wallA");
  await wallA.fill("");
  await wallA.pressSequentially(FIXED_WALL_A);
  await expect(page).toHaveURL(FIXED_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expect(page.getByTestId("room-room-reason")).toHaveCount(0);
  await expect(page.getByTestId("room-continue")).toBeEnabled();
}

async function expectStrangerSeesTheU(
  browser: Browser,
  sharePath: string,
): Promise<void> {
  const strangerContext = await browser.newContext();
  try {
    const strangerPage = await strangerContext.newPage();
    await openSharedDesign(strangerPage, sharePath, { locale: "ro" });
    await expect(strangerPage.getByTestId("top-bar-back")).toHaveCount(0);
    await expect(cameraPresetButtons(strangerPage)).toHaveCount(
      U_CAMERA_PRESETS,
    );
  } finally {
    await strangerContext.close();
  }
}

/**
 * The whole journey. `mintedIds` is the caller's own array — the caller's `afterAll` deletes it
 * (ADR 0006), so this mints a row but never owns its cleanup.
 */
export async function runTooSmallUJourney(
  page: Page,
  browser: Browser,
  mintedIds: string[],
): Promise<void> {
  await chooseUAndContinue(page);
  await typeTooSmallRoom(page);
  await expectTooSmallAtOneC(page);

  await page.reload();
  await expectTooSmallAtOneC(page);

  await fixWallA(page);
  const id = await composeAndReload(page, mintedIds);

  const sharePath = await issueShareLink(page, { id, revision: "" });
  await expectStrangerSeesTheU(browser, sharePath);
}
