import { expect, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import {
  openFridgeColumnView,
  pressPanelControl,
  requireInFridgeColumn,
  waitForFirstSave,
} from "./support/panel";
import {
  openDesignAndAwaitAccessProbe,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **ADR 0099 in a browser: a colour is chosen at two levels and the cabinet's wins.**
 *
 * The owner's warning is the whole subject — *"do not remove or overwrite a cabinet's own colour
 * selection when the global default changes"* — and it is asserted on the **document across a
 * reload**, which is the only place the difference is visible. A cabinet following the kitchen and a
 * cabinet overriding it with the same colour paint identically in the scene; what tells them apart
 * is whether the stored placement carries a `finish` key, which is what `data-overriding-finishes`
 * publishes.
 *
 * **The cabinet-level override is written through the authenticated API, not by picking in the
 * canvas**, wherever the test is about the document. That is `global-settings-apply.e2e.spec.ts`'s
 * own device for a withdrawn tier, and it is what makes "one cabinet overrides" a fact rather than a
 * tap that has to land. Only the two legs that are *about* §9's control tap the scene, and those use
 * the pinned constants in `support/panel.ts`.
 *
 * **Written but not executed by this wave.** The worktree carries no `.env`, so the mint route these
 * specs go through cannot answer here. Every claim below is also held one layer down without a
 * browser — `tests/settings/global-colour-group.test.ts`,
 * `tests/panel/follow-the-kitchen-colour.test.ts` and
 * `packages/configurator-domain/tests/resolved-finish.test.ts` — so what is owed here is the
 * browser's confirmation rather than the assertion itself. The first run should expect the two
 * canvas legs to need their target narrowed if the fridge column's first placement turns out not to
 * wear a finish.
 *
 * Rows minted here are deleted afterwards — ADR 0006.
 */

const SCENE_SETTLE_MS = 2000;

interface StoredColour {
  /** `three-adapter`'s own finish signature, or empty where the design names no global colour. */
  readonly globalFinish: string;
  /** How many placements carry a `finish` key of their own. */
  readonly overridingFinishes: number;
  readonly materialTierId: string;
  readonly updatedAt: string;
}

/** `openSeededDesign` waits for the trigger to be enabled, not for the rest of the scene to have
 *  settled — a read taken the instant it returns can still race the document (review round 2,
 *  R2.1). Every open in this file goes through here rather than through `openSeededDesign` bare. */
async function openAndSettle(
  page: Page,
  seededDesign: SeededDesign,
): Promise<void> {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function storedColour(page: Page): Promise<StoredColour> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    globalFinish: element.getAttribute("data-global-finish") ?? "",
    overridingFinishes: Number(
      element.getAttribute("data-overriding-finishes") ?? "0",
    ),
    materialTierId: element.getAttribute("data-material-tier") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/**
 * Writes a colour onto the seeded design's **first** placement through the same route the client
 * uses — so the document under test is one the server actually accepted.
 *
 * The override is written server-side rather than tapped, for this file's stated reason: the
 * invariant is about what a *later* global change does to it, and a tap that missed would make the
 * assertion pass by having nothing to protect. Run on whatever origin `page` is already on — the
 * `seededDesign` fixture's own mint already left it same-origin with `/api/designs`.
 */
async function wearColour(
  page: Page,
  seededDesign: SeededDesign,
  entryId: string,
): Promise<void> {
  const status = await page.evaluate(
    async ({ id, chosenEntryId }) => {
      const loaded = await fetch(`/api/designs/${id}`);
      const { design, revision } = (await loaded.json()) as {
        design: {
          placements: { body: Record<string, unknown> }[];
          [key: string]: unknown;
        };
        revision: string;
      };
      const written = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify({
          ...design,
          placements: design.placements.map((placement, at) =>
            at === 0
              ? {
                  ...placement,
                  body: {
                    ...placement.body,
                    finish: { kind: "palette-entry", entryId: chosenEntryId },
                  },
                }
              : placement,
          ),
        }),
      });
      return written.status;
    },
    { id: seededDesign.id, chosenEntryId: entryId },
  );
  expect(status).toBe(200);
}

/** Opens a shared link without asserting write access, the one thing `openSeededDesign` will not
 *  do — it throws on exactly the read-only answer this file's one read-only test wants. Built on
 *  the shared navigation-and-probe helper (review round 1, R1.3), which every `/d/{id}` caller in
 *  this suite now shares. */
async function openWithoutAssertingWriteAccess(
  page: Page,
  id: string,
): Promise<void> {
  await openDesignAndAwaitAccessProbe(page, `/d/${id}`, id);
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function openSheet(page: Page): Promise<void> {
  await expect(page.getByTestId("global-settings-trigger")).toBeEnabled();
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
}

/** The colour group's swatch for one declared decor, addressed by the id the cabinet editor already
 *  uses for the same control — which is the point of ADR 0099 decision 9's reuse. */
function globalSwatch(page: Page, entryId: string) {
  return page
    .getByTestId("global-settings-colour-group")
    .getByTestId(`finish-${entryId}`);
}

/** Chooses a colour for the whole kitchen and commits it, leaving the sheet shut. */
async function applyGlobalColour(page: Page, entryId: string): Promise<void> {
  await openSheet(page);
  await globalSwatch(page, entryId).tap();
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
}

test("offers the colour group after the material group, from the material's own palette", async ({
  page,
  seededDesign,
}) => {
  await openAndSettle(page, seededDesign);
  await openSheet(page);

  const group = page.getByTestId("global-settings-colour-group");
  await expect(group).toBeVisible();
  // The declared shape, read off the attribute rather than by counting buttons (ADR 0071
  // decision 3): a fresh design is on PAL, whose control is a decor list.
  await expect(group.locator("[data-finish-control]")).toHaveAttribute(
    "data-finish-control",
    "decor-list",
  );

  // "Just behind the material": the material group is above this one, hardware's below.
  //
  // **Read off each group's own identifier, never off the sheet's text.** This used to look three
  // declared headings up in `innerText`, and it could not pass however the sheet was ordered:
  // `innerText` is the *rendered* text and applies `text-transform`, and `.heading` in
  // `global-settings.module.css` has been `text-transform: uppercase` since wave 6G — so
  // `"Material corp și fronturi"` was being sought in `"MATERIAL CORP ȘI FRONTURI"` and all three
  // lookups returned −1.
  //
  // `textContent` would have fixed the styling half alone and broken again the day the copy is
  // reworded, which M6B exists to do. The colour group is addressed by the same `data-testid` this
  // file uses for its swatches two assertions above, and the tier groups by the `name` their radios
  // carry — `${dialogId}-${group.key}`, the group's own key. Neither is copy and neither is style.
  const groups = await page
    .getByTestId("global-settings-surface")
    .evaluate((sheet) =>
      [...sheet.querySelectorAll("section")].map((section) => ({
        testId: section.getAttribute("data-testid"),
        radioName:
          section.querySelector("input[type='radio']")?.getAttribute("name") ??
          null,
      })),
    );
  const material = groups.findIndex((group) =>
    group.radioName?.endsWith("-material"),
  );
  const colour = groups.findIndex(
    (group) => group.testId === "global-settings-colour-group",
  );
  const hardware = groups.findIndex((group) =>
    group.radioName?.endsWith("-hardware"),
  );
  expect(material).toBeGreaterThan(-1);
  expect(colour).toBeGreaterThan(material);
  expect(hardware).toBeGreaterThan(colour);
});

test("writes the kitchen's colour and grows the document no cabinet key at all", async ({
  page,
  seededDesign,
}) => {
  await openAndSettle(page, seededDesign);

  const before = await storedColour(page);
  expect(before.globalFinish).toBe("");
  expect(before.overridingFinishes).toBe(0);

  await applyGlobalColour(page, "pal.antracit");

  // The reload is what makes this about the document rather than the store's memory.
  await openAndSettle(page, seededDesign);
  const after = await storedColour(page);
  expect(after.globalFinish).toBe("palette-entry:pal.antracit");
  // **The owner's invariant, from the outside**: no placement gained a `finish` key. Had the global
  // change stamped itself onto every following cabinet, this would be the placement count — and the
  // *second* global change would then move nothing on screen.
  expect(after.overridingFinishes).toBe(0);
});

test("leaves a cabinet's own colour untouched when the kitchen's colour changes", async ({
  page,
  seededDesign,
}) => {
  await wearColour(page, seededDesign, "pal.antracit");
  await openAndSettle(page, seededDesign);
  expect((await storedColour(page)).overridingFinishes).toBe(1);

  await applyGlobalColour(page, "pal.gri-havanna");

  await openAndSettle(page, seededDesign);
  const after = await storedColour(page);
  expect(after.globalFinish).toBe("palette-entry:pal.gri-havanna");
  // Still exactly one override: the global change wrote one settings key and reached no cabinet
  // (ADR 0099 decision 2). Zero here would be the override erased; the placement count would be
  // every cabinet stamped.
  expect(after.overridingFinishes).toBe(1);
});

test("re-derives the offered colours from the pending material, before apply", async ({
  page,
  seededDesign,
}) => {
  await openAndSettle(page, seededDesign);
  await openSheet(page);

  await expect(globalSwatch(page, "pal.antracit")).toBeVisible();
  await globalSwatch(page, "pal.antracit").tap();

  // Veneer, chosen in the same open sheet: the group must now offer veneer's woods and nothing PAL
  // makes (ADR 0099 decision 4), and the PAL colour just chosen is dropped rather than committed
  // and then reset by a command.
  await page
    .getByTestId("global-settings-group")
    .first()
    .getByRole("radio")
    .last()
    .tap();
  await expect(globalSwatch(page, "pal.antracit")).toHaveCount(0);
  await expect(globalSwatch(page, "veneer.nuc")).toBeVisible();
});

test("cancelling after choosing a colour writes nothing at all", async ({
  page,
  seededDesign,
}) => {
  await openAndSettle(page, seededDesign);
  const before = await storedColour(page);

  await openSheet(page);
  await globalSwatch(page, "pal.antracit").tap();
  await globalSwatch(page, "pal.gri-havanna").tap();
  await page.getByTestId("global-settings-cancel").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);

  // Not merely "no colour": nothing moved at all, `updatedAt` included — a document a command
  // touched would carry a later one.
  expect(await storedColour(page)).toEqual(before);
});

test("keeps the colour group unreachable on a read-only link", async ({
  page,
  seededDesign,
}) => {
  await page.context().clearCookies();
  // `openSeededDesign` would throw on exactly the read-only answer this test wants, so this opens
  // the link the same way `read-only-global-settings.e2e.spec.ts` does — waiting for the probe
  // without asserting `canWrite: true`.
  await openWithoutAssertingWriteAccess(page, seededDesign.id);

  // The trigger is locked, so the fourth group is unreachable — which is the correct read-only
  // behaviour and what `read-only-global-settings.e2e.spec.ts` asserts for the other three. Held
  // here so the group this wave adds cannot become the one exception (M6-AUD-001).
  await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
  // Pinned to the read-only sentence itself (wave 7E4 Q7), not merely to "some reason": `/./` would
  // also pass while the trigger still carried `accessCheckingReason`, the wording a probe still in
  // flight leaves on screen — a state this test's own `openWithoutAssertingWriteAccess` has already
  // waited past.
  await expect(page.getByTestId("global-settings-trigger")).toHaveAttribute(
    "data-disabled-reason",
    ro.panel.readOnlyReason,
  );
});

test("gives a cabinet back to the kitchen's colour, and it then tracks two further changes", async ({
  page,
  seededDesign,
}) => {
  // ADR 0099 decision 8, and the only leg here that has to reach §9's own control — so it taps the
  // scene, through the pinned constants in `support/panel.ts`.
  await openFridgeColumnView(page, seededDesign);
  await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionKind === "placement",
    description: "a cabinet the finish control is offered for",
  });
  await expect(page.getByTestId("section-finish")).toBeVisible();

  await pressPanelControl(page, "finish-pal.antracit");
  // `waitForFirstSave` throws unless the stored revision moved past the seeded one, so there is
  // nothing left here to check.
  await waitForFirstSave(page, seededDesign);
  await expect
    .poll(async () => (await storedColour(page)).overridingFinishes)
    .toBe(1);

  // The way back out, without which the tap above is a one-way door.
  await pressPanelControl(page, "finish-follow-kitchen");
  await expect
    .poll(async () => (await storedColour(page)).overridingFinishes)
    .toBe(0);
  await expect(page.getByTestId("finish-follow-kitchen")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByTestId("panel-close").tap();

  // **Two global changes, not one.** A clear that wrote the current global colour into the key
  // instead of deleting it would satisfy the first and fail the second.
  for (const entryId of ["pal.gri-havanna", "pal.nuc-warmia"]) {
    await applyGlobalColour(page, entryId);
    await expect
      .poll(async () => (await storedColour(page)).globalFinish)
      .toBe(`palette-entry:${entryId}`);
    await expect
      .poll(async () => (await storedColour(page)).overridingFinishes)
      .toBe(0);
  }
});
