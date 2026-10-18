// M8C wave P9, ADR 0168 exception 4 — the owner's loop end to end: generate a kitchen, save it as a preset, generate in
// a room within the window, see the list (1E), open Preview, press Select, and land in the editor on a design whose
// `presetId` is the preset's. Shared by the mobile and desktop specs so the two viewports run one journey.
//
// **The preset repository is faked at the browser, by Playwright route interception, and the server's is never asked.**
// The `presets` table is insert-and-select only for the application role (no `DELETE`), so a preset an e2e really
// saved would stay on the Step 1 of every later run and every other spec (ADR 0151, plan M8C risk 9). Three routes are
// answered here: the preset save (`POST /api/designs/{id}/preset`), the listing (`GET /api/presets`) and the image
// (`GET /api/presets/{id}/image`). Everything else is the real server: the mint, the saves, the credentials and the
// design reads are real, and the listing's one item is built from the design the server actually stored.
import {
  isDesignId,
  presetNameFactsOf,
  presetRoomOf,
  type Design,
} from "@lemnaria/configurator-domain";
import { expect, type Page, type Route } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { chooseAnotherMaterialAndSave } from "./design-return";

const ROOM = "/ro/configurator/room";
const SAVE_WALL_A_MM = 3700;
const OTHER_WALL_A_MM = 4000;
const HEIGHT_MM = 2600;
const HEIGHT_METRES = "2.6";
const SAVE_ROOM = `${ROOM}?shape=linear&wallA=3.7&height=${HEIGHT_METRES}`;
const OTHER_ROOM = `${ROOM}?shape=linear&wallA=4&height=${HEIGHT_METRES}`;
/** The window the listing serves, ADR 0112 decision 5: the stored room and the asked one differ by this much or less. */
const WINDOW_MM = 600;

/** 21 characters of `[A-Za-z0-9_-]`: the shape the browser requires of a preset's id, or it drops the item. */
const FAKE_PRESET_ID = "e2eFakePreset00000001";
const TYPED_NAME = "P9 owner loop kitchen";

const PRESET_POST_PATH = /^\/api\/designs\/([^/]+)\/preset$/;
const PRESET_LIST_PATH = "/api/presets";
const PRESET_IMAGE_PATH = `${PRESET_LIST_PATH}/${FAKE_PRESET_ID}/image`;
const DESIGN_PATH = /^\/ro\/d\/([^/]+)$/;
/** `waitForURL` matches the whole address, not its path. */
const DESIGN_URL = /\/ro\/d\/[^/]+$/;
const REVISION_SHAPE = /^[1-9][0-9]{0,18}$/;
const SAVED_STATUS = 201;
const OK_STATUS = 200;

interface SavedBody {
  readonly revision: string;
  readonly name?: string;
  readonly imageType: string;
  readonly image: string;
}

interface StoredRead {
  readonly design: Design;
  readonly revision: string;
}

/** What the fake repository holds and what it was asked, kept apart from the page so the assertions read them after. */
interface FakePresetRepository {
  readonly saves: { readonly designId: string; readonly body: SavedBody }[];
  readonly listingQueries: URLSearchParams[];
  readonly imageReads: number[];
  /** Every request that is not a read and that went to a preset route, as "METHOD path": the repository's writes. */
  readonly writes: string[];
  published: unknown[];
  /** The thumbnail as the save sent it: what the real route would have kept and served back. */
  image: { type: string; bytes: Buffer } | undefined;
}

export async function runPresetOwnerLoop(
  page: Page,
  mintedIds: string[],
): Promise<void> {
  expect(FAKE_PRESET_ID).toHaveLength(21);
  expect(isDesignId(FAKE_PRESET_ID)).toBe(true);
  const repository = await fakeRepositoryOn(page);

  const savedDesignId = await generateKitchenIn(page, SAVE_ROOM);
  mintedIds.push(savedDesignId);
  // An adjustment first: the owner saves what they have shaped, and the dialog must wait for that write to settle.
  expect(await chooseAnotherMaterialAndSave(page, savedDesignId)).toBe(
    OK_STATUS,
  );
  await saveAsPreset(page, repository);
  const stored = await readStoredDesign(page, savedDesignId);
  expect(stored.design.presetId).toBeNull();
  expect(repository.saves).toHaveLength(1);
  expect(repository.saves[0]?.designId).toBe(savedDesignId);
  expect(repository.saves[0]?.body.revision).toBe(stored.revision);
  repository.published = [summaryOf(stored.design)];

  const copyId = await chooseThePresetIn(page, repository);
  mintedIds.push(copyId);
  expect(copyId).not.toBe(savedDesignId);

  const copy = await readStoredDesign(page, copyId);
  expect(copy.design.presetId).toBe(FAKE_PRESET_ID);
  expect(copy.design.room.widthMm).toBe(OTHER_WALL_A_MM);
  expect(copy.design.room.heightMm).toBe(HEIGHT_MM);
  expect(copy.design.placements.length).toBeGreaterThan(0);
  expect(copy.design.settings).toEqual(stored.design.settings);

  await editTheCopyAndKeepThePreset(page, copyId, copy);

  const original = await readStoredDesign(page, savedDesignId);
  expect(original.design.presetId).toBeNull();
  expect(original.design.room.widthMm).toBe(SAVE_WALL_A_MM);
  expect(original.revision).toBe(stored.revision);
  expect(repository.saves).toHaveLength(1);
  // The only write to a preset route in the whole loop is the one save: Select copies, and the edit is the copy's.
  expect(repository.writes).toEqual([
    `POST /api/designs/${savedDesignId}/preset`,
  ]);
}

/** One more edit, on the copy: it is stored as a new revision of the copy, still carrying the preset's id, and the
 *  design the preset came from does not move. */
async function editTheCopyAndKeepThePreset(
  page: Page,
  copyId: string,
  copy: StoredRead,
): Promise<void> {
  expect(await chooseAnotherMaterialAndSave(page, copyId)).toBe(OK_STATUS);
  const edited = await readStoredDesign(page, copyId);
  expect(BigInt(edited.revision)).toBeGreaterThan(BigInt(copy.revision));
  expect(edited.design.presetId).toBe(FAKE_PRESET_ID);
  expect(edited.design.settings).not.toEqual(copy.design.settings);
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 1 and the editor
// ---------------------------------------------------------------------------------------------------------------------

/** 1D -> (nothing published) -> 1F -> the editor, and the new design's id. */
async function generateKitchenIn(page: Page, roomUrl: string): Promise<string> {
  await page.goto(roomUrl);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await page.getByTestId("room-continue").click();
  await page.waitForURL(DESIGN_URL);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  return designIdOf(page);
}

async function saveAsPreset(
  page: Page,
  repository: FakePresetRepository,
): Promise<void> {
  const open = page.getByTestId("save-as-preset");
  await expect(open).toBeVisible();
  await open.click();

  await expect(page.getByTestId("save-as-preset-dialog")).toBeVisible();
  await page.getByTestId("save-as-preset-name").fill(TYPED_NAME);
  const confirm = page.getByTestId("save-as-preset-confirm");
  // Enabled only once the stored revision is the one on screen (ADR 0158): the dialog waits for the save to settle.
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByTestId("save-as-preset-status")).toHaveText(
    ro.presetSave.saved,
  );
  // The notice is read for about a second, then the dialog closes as Close does and focus returns to the button.
  await expect(page.getByTestId("save-as-preset-dialog")).toBeHidden();
  await expect(open).toBeFocused();
  expect(repository.saves).toHaveLength(1);
  expect(repository.saves[0]?.body.name).toBe(TYPED_NAME);
}

/** A room within the window: the list (1E) with the one preset, its Preview, and Select. Answers the copy's id. */
async function chooseThePresetIn(
  page: Page,
  repository: FakePresetRepository,
): Promise<string> {
  expect(Math.abs(OTHER_WALL_A_MM - SAVE_WALL_A_MM)).toBeLessThanOrEqual(
    WINDOW_MM,
  );
  await page.goto(OTHER_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await page.getByTestId("room-continue").click();

  await expect(page.getByTestId("room-presets")).toBeVisible();
  const asked = repository.listingQueries.at(-1);
  expect(asked?.get("shape")).toBe("linear");
  expect(asked?.get("a")).toBe(String(OTHER_WALL_A_MM));

  const cards = page.getByTestId("room-preset-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-preset-id", FAKE_PRESET_ID);
  await expect(cards.first()).toContainText(TYPED_NAME);
  await expect(page.getByTestId("room-presets-skip")).toBeVisible();
  // The card's one control is Preview: it selects nothing (the owner's ruling of 2026-10-17).
  await expect(page.getByTestId("room-preset-preview")).toHaveCount(1);
  await expect(page).toHaveURL(OTHER_ROOM);

  await page.getByTestId("room-preset-preview").click();
  const dialog = page.getByTestId("preset-carousel-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("preset-carousel-position")).toHaveText(
    "1 / 1",
  );
  await expect(page.getByTestId("preset-carousel-name")).toHaveText(TYPED_NAME);
  await expect(page.getByTestId("preset-carousel-previous")).toHaveCount(0);
  await expect(page.getByTestId("preset-carousel-next")).toHaveCount(0);
  await expect(dialog.locator("img").first()).toBeVisible();
  expect(repository.imageReads.length).toBeGreaterThan(0);

  await page.getByTestId("preset-carousel-select").click();
  await page.waitForURL(DESIGN_URL);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  return designIdOf(page);
}

// ---------------------------------------------------------------------------------------------------------------------
// The fake repository
// ---------------------------------------------------------------------------------------------------------------------

async function fakeRepositoryOn(page: Page): Promise<FakePresetRepository> {
  const repository: FakePresetRepository = {
    saves: [],
    listingQueries: [],
    imageReads: [],
    writes: [],
    published: [],
    image: undefined,
  };
  await page.route(isPresetSave, (route) => answerSave(route, repository));
  await page.route(isPresetListing, (route) =>
    answerListing(route, repository),
  );
  await page.route(isPresetImage, (route) => answerImage(route, repository));
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    const isPresetRoute =
      pathname.startsWith(PRESET_LIST_PATH) || PRESET_POST_PATH.test(pathname);
    if (isPresetRoute && request.method() !== "GET") {
      repository.writes.push(`${request.method()} ${pathname}`);
    }
  });
  return repository;
}

function isPresetSave(url: URL): boolean {
  return PRESET_POST_PATH.test(url.pathname);
}

function isPresetListing(url: URL): boolean {
  return url.pathname === PRESET_LIST_PATH;
}

function isPresetImage(url: URL): boolean {
  return url.pathname === PRESET_IMAGE_PATH;
}

/** The route's own answer for a stored kitchen (`presetSavedResponse`): `201 { id }`. The request is read, not trusted:
 *  a body the real route would refuse fails the spec here instead of passing through a fake that accepts anything. */
async function answerSave(
  route: Route,
  repository: FakePresetRepository,
): Promise<void> {
  const request = route.request();
  if (request.method() !== "POST") return route.fallback();
  const designId = PRESET_POST_PATH.exec(new URL(request.url()).pathname)?.[1];
  const body = request.postDataJSON() as SavedBody;
  expect(designId).toBeDefined();
  expect(body.revision).toMatch(REVISION_SHAPE);
  expect(["image/webp", "image/png", "image/jpeg"]).toContain(body.imageType);
  expect(body.image.length).toBeGreaterThan(0);
  expect(body.image).not.toContain("data:");
  repository.saves.push({ designId: designId ?? "", body });
  repository.image = {
    type: body.imageType,
    bytes: Buffer.from(body.image, "base64"),
  };
  await route.fulfill({
    status: SAVED_STATUS,
    contentType: "application/json",
    body: JSON.stringify({ id: FAKE_PRESET_ID }),
  });
}

/** `GET /api/presets?shape=&a=...`: the published list, or the empty list the route answers with nothing published.
 *  The query is recorded, so the spec can say which room Step 1 asked about. */
async function answerListing(
  route: Route,
  repository: FakePresetRepository,
): Promise<void> {
  const request = route.request();
  if (request.method() !== "GET") return route.fallback();
  repository.listingQueries.push(new URL(request.url()).searchParams);
  await route.fulfill({
    status: OK_STATUS,
    contentType: "application/json",
    body: JSON.stringify({ presets: repository.published }),
  });
}

async function answerImage(
  route: Route,
  repository: FakePresetRepository,
): Promise<void> {
  repository.imageReads.push(repository.imageReads.length + 1);
  const { image } = repository;
  if (image === undefined) return route.fulfill({ status: 404 });
  await route.fulfill({
    status: OK_STATUS,
    contentType: image.type,
    body: image.bytes,
  });
}

/** One item of the listing, built as `presetSummaryOf` builds it from a stored row: the room, the name's facts, the
 *  image's address, and the design with no `presetId`. */
function summaryOf(design: Design): unknown {
  const { shape, walls, heightMm } = presetRoomOf(design);
  return {
    id: FAKE_PRESET_ID,
    shape,
    walls,
    heightMm,
    typedName: TYPED_NAME,
    nameFacts: presetNameFactsOf(design),
    imageUrl: PRESET_IMAGE_PATH,
    design: { ...design, presetId: null },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------------

/** `GET /api/designs/{id}` from the page, so the visitor cookie of this browser is the one that asks. */
async function readStoredDesign(page: Page, id: string): Promise<StoredRead> {
  const response = await page.request.get(`/api/designs/${id}`);
  expect(response.status()).toBe(OK_STATUS);
  const payload = (await response.json()) as {
    design: Design;
    revision: string;
    canWrite: boolean;
  };
  return { design: payload.design, revision: payload.revision };
}

function roomScreen(page: Page) {
  return page.locator("main[data-room-substate]");
}

function designIdOf(page: Page): string {
  const id = DESIGN_PATH.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error(`no design id in ${page.url()}`);
  return decodeURIComponent(id);
}
