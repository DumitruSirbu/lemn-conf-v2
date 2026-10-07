// **The M7 mobile gate, by touch** — wave 7K, slices S1 and S2 (`docs/milestones/M7-room-and-presets.md`,
// *Wave 7K — the plan (2026-09-28)*).
//
// The gate is a manifest (§3): four specs earlier waves wrote and this wave inherits unchanged —
// `room-to-editor.qa`, `room-traversal.qa`, `linear-flow` and `mirror-real-flow` — plus this one,
// which closes the gaps they leave. **None of them is driven by touch** (G6), and ADR 0023 is this
// product's own precedent that a tap and a click can differ. So everything here is reached with a
// finger (D5): no click, no mouse, no fill over a length, and no `goto` to a room query — every
// Step-1 state is reached from the one before it.
//
// **Out of this gate by derivation, not by choice (D2):** the preset list (frame 1E), *Folosește*,
// the card's price against the editor's and the save-as-preset sweep. The 2026-09-15 and 2026-09-22
// rulings put the preset story past M8 (G3), and a gate asserting against a control that does not
// exist is a vacuous one. The evaluated-design round trip is asserted on the **composed** design,
// the only design Step 1 creates today (D7).
//
// **A defect this gate finds stays red** (D10): the product is fixed in its own dispatch, never by
// weakening an assertion here.
//
// **CI is the verdict.** Locally the suite serves `next dev`, not a build (G16).
import { expect, type Page } from "@playwright/test";

import { waitForSettleAfter } from "./support/mirror-flow";
import {
  cameraGroupLabel,
  continueButton,
  editorPath,
  emulateNetworkLatency,
  eraseDigits,
  findBaseRowTapTarget,
  idInEditorUrl,
  isEditorRoutePathname,
  isEditorUrl,
  lengthField,
  readDesignWritesInPage,
  readStoredDesign,
  readTheHandOff,
  recordRequestedPathnames,
  roomPath,
  roomScreen,
  stepSentence,
  test,
  typeDigits,
  waitForAWriteInFlight,
  waitForWritesToSettle,
  watchDesignWritesInPage,
  watchTheHandOff,
  type DesignWrites,
  type Locale,
} from "./support/step-one-by-touch";

type CornerDirection = "left" | "right";

/** The L room each journey types — comfortably inside the approved bounds, so composition places
 *  every core role and the journey, not the generator's boundary, is the subject (criterion 6). */
const L_ROOM_AS_TYPED = {
  wallA: "3560",
  wallB: "4250",
  height: "2700",
} as const;
/** The same room as the settle writes it into the URL, in metres (ADR 0126). */
const L_ROOM_URL_METRES = {
  wallA: "3.56",
  wallB: "4.25",
  height: "2.7",
} as const;
const L_ROOM_IN_THE_URL = `wallA=${L_ROOM_URL_METRES.wallA}&wallB=${L_ROOM_URL_METRES.wallB}&height=${L_ROOM_URL_METRES.height}`;

/** One millimetre under the approved L wall-A minimum of 900 mm (`approved-room-policy.ts:20`,
 *  ADR 0125), and the same length as the URL carries it. */
const L_WALL_A_TOO_SHORT = "899";
const L_WALL_A_TOO_SHORT_IN_THE_URL = "0.899";

/** The straight kitchen this gate types (D6). */
const STRAIGHT_ROOM_AS_TYPED = { wallA: "3700", height: "2600" } as const;
const STRAIGHT_ROOM_URL_METRES = { wallA: "3.7", height: "2.6" } as const;
const STRAIGHT_ROOM_IN_THE_URL = `wallA=${STRAIGHT_ROOM_URL_METRES.wallA}&height=${STRAIGHT_ROOM_URL_METRES.height}`;
/** One millimetre under the approved straight wall-A minimum of 1200 mm (`approved-room-policy.ts:47`,
 *  ADR 0108 Amendment G). */
const STRAIGHT_WALL_A_TOO_SHORT = "1199";
const STRAIGHT_WALL_A_TOO_SHORT_IN_THE_URL = "1.199";

/** A straight room's stored depth is fixed by validation, never typed (ADR 0130 D3). Written here,
 *  never imported from the domain, so the assertion cannot move with the constant it checks (D7). */
const STRAIGHT_ROOM_DEPTH_MM = 3400;

/** The two L journeys (D6). The right-hand one is the round trip's discriminating case (ADR 0121):
 *  only a right-hand document carries `room.cornerDirection` (ADR 0129 D2). Russian is a chrome axis
 *  the stored document must never see. */
const L_JOURNEYS = [
  { locale: "ro", direction: "left" },
  { locale: "ru", direction: "right" },
] as const satisfies readonly {
  readonly locale: Locale;
  readonly direction: CornerDirection;
}[];

/** Several reloads, a composition and a cold editor per journey, on `next dev`. The waits are all on
 *  the page's own signals; this only stops the clock from being the thing that fails. */
const JOURNEY_TIMEOUT_MS = 180_000;

/** Criterion 14's stretched round trip: each design write pays this much, so a finger lands on 1F's
 *  *Înapoi* while one is in flight by a wide margin rather than a lucky one. */
const WRITE_LATENCY_MS = 1_500;
/** The room screen's settle interval (`room-query-sync.ts`, Q-D45-3). */
const URL_SETTLE_MS = 400;
/** A composition on a slowed network still has to fetch the adapter's chunk before it writes. */
const WRITE_IN_FLIGHT_TIMEOUT_MS = 60_000;

// ===========================================================================================
// S1 — the L journey by touch, in {ro, left} and {ru, right}.
// ===========================================================================================

for (const { locale, direction } of L_JOURNEYS) {
  test(`L kitchen by touch, ${locale}, ${direction}-hand corner: 1A to 1D with reloads, the hand-off, the round trip, the editor touched, and back to the room`, async ({
    page,
    designWrites,
    committedPathnames,
    pageErrors,
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT_MS);

    await test.step("1A — U taken with no refusal, L taken, and a reload forgets the card (criterion 2)", async () => {
      await openStepOne(page, locale);
      // Restated at M7B U6 S1 (census E2): the approved policy builds the U, so its card draws no
      // refusal and Continue leads on.
      await page.getByTestId("room-shape-card-U").tap();
      await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
      await expect(continueButton(page)).toBeEnabled();

      await page.getByTestId("room-shape-card-L").tap();
      await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
      await expect(continueButton(page)).toBeEnabled();

      // The choice is not in the URL (ADR 0111 decision 3), so a reload cannot know it.
      await page.reload({ waitUntil: "networkidle" });
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1A",
      );
      await expect(
        page.getByTestId("room-shapes").getByRole("radio", { checked: true }),
      ).toHaveCount(0);
      await expect(continueButton(page)).toBeDisabled();

      await page.getByTestId("room-shape-card-L").tap();
      await continueButton(page).tap();
    });

    await test.step("1B — the pill, the corner toggle both ways, and a reload keeps the first field (criterion 3)", async () => {
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1B",
      );
      await expect(page.getByTestId("top-bar-step")).toHaveAttribute(
        "aria-label",
        stepSentence(locale, 1),
      );
      await expect(page).toHaveURL(
        `${roomPath(locale)}?shape=L&direction=left`,
      );

      for (const side of cornerTapsEndingAt(direction)) {
        await page.getByTestId(`room-corner-${side}`).tap();
        await expect(
          page.getByTestId(`room-corner-control-${side}`),
        ).toBeChecked();
        await expect(page).toHaveURL(
          `${roomPath(locale)}?shape=L&direction=${side}`,
        );
      }

      await typeDigits(page, "wallA", L_WALL_A_TOO_SHORT);
      await expect(page).toHaveURL(
        `${roomPath(locale)}?shape=L&wallA=${L_WALL_A_TOO_SHORT_IN_THE_URL}&direction=${direction}`,
      );
      await page.reload({ waitUntil: "networkidle" });
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1B",
      );
      await expect(lengthField(page, "wallA")).toHaveValue(L_WALL_A_TOO_SHORT);
      await expect(lengthField(page, "wallB")).toHaveValue("");
      await expect(lengthField(page, "height")).toHaveValue("");
      await expect(
        page.getByTestId(`room-corner-control-${direction}`),
      ).toBeChecked();
    });

    await test.step("1C — typed, survives a reload, and is corrected by the keyboard into 1D (criterion 4)", async () => {
      await typeDigits(page, "wallB", L_ROOM_AS_TYPED.wallB);
      await typeDigits(page, "height", L_ROOM_AS_TYPED.height);
      const refusedRoomUrl = `${roomPath(locale)}?shape=L&wallA=${L_WALL_A_TOO_SHORT_IN_THE_URL}&wallB=${L_ROOM_URL_METRES.wallB}&height=${L_ROOM_URL_METRES.height}&direction=${direction}`;
      await expect(page).toHaveURL(refusedRoomUrl);
      await expectWallAAtOneC(page);

      await page.reload({ waitUntil: "networkidle" });
      await expect(page).toHaveURL(refusedRoomUrl);
      await expectWallAAtOneC(page);
      await expect(lengthField(page, "wallA")).toHaveValue(L_WALL_A_TOO_SHORT);

      await eraseDigits(page, "wallA", L_WALL_A_TOO_SHORT.length);
      await typeDigits(page, "wallA", L_ROOM_AS_TYPED.wallA);
      await expect(page).toHaveURL(typedLRoomUrl(locale, direction));
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1D",
      );
      await expect(page.getByTestId("room-length-reason-wallA")).toHaveCount(0);
      await expect(page.getByTestId("room-plan-label-A")).toHaveAttribute(
        "data-marked",
        "false",
      );
      await expect(continueButton(page)).toBeEnabled();
    });

    await test.step("1D — a reload keeps every field, and nothing was written before leaving it (criterion 5)", async () => {
      await page.reload({ waitUntil: "networkidle" });
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1D",
      );
      await expectLRoomFields(page, direction);
      expect(designWrites.postCount()).toBe(0);
      expect(designWrites.saves()).toHaveLength(0);
    });

    const designId =
      await test.step("1D → 1F → the editor, with no screen between (criterion 6)", async () => {
        await watchTheHandOff(page, stepSentence(locale, 1));
        const beforeTheTap = committedPathnames.mark();

        await continueButton(page).tap();
        await page.waitForURL((url) => isEditorUrl(url, locale), {
          timeout: JOURNEY_TIMEOUT_MS / 3,
        });
        const mintedId = idInEditorUrl(page.url());

        expect(new URL(page.url()).search).toBe("");
        await expectEditorOn(page, { locale, designId: mintedId });
        expect(designWrites.postCount()).toBe(1);

        const handOff = await readTheHandOff(page);
        expect(
          handOff,
          "the hand-off replaced the document — it must be a client-side push",
        ).toBeDefined();
        expect(handOff?.sawComposeAtStepOne).toBe(true);
        expect(handOff?.composePhases).toContain("composed");
        expect(handOff?.sawDroppedRoles).toBe(false);

        // The room's own query may be re-committed by the departure's push; nothing else may be.
        const visited = committedPathnames.since(beforeTheTap);
        const theRoomOrTheEditor = [
          roomPath(locale),
          editorPath(locale, mintedId),
        ];
        expect(
          visited.filter((pathname) => !theRoomOrTheEditor.includes(pathname)),
        ).toEqual([]);
        expect(visited).toContain(editorPath(locale, mintedId));
        return mintedId;
      });

    await test.step("the round trip: what the browser sent is what the database gives back (criterion 7)", async () => {
      await expectRoundTrip(page, designWrites, {
        designId,
        room: typedLRoom(direction),
      });
    });

    await test.step("a reload on /d/{id} reopens the same design and mints nothing (criterion 8)", async () => {
      await page.reload();
      await expectEditorOn(page, { locale, designId });
      expect(designWrites.postCount()).toBe(1);
    });

    const savesBeforeTheSelection =
      await test.step("the editor touched: a base-row body tapped on the touchscreen is selected (criterion 9)", async () => {
        await waitForSettleAfter(page, 0);
        const target = await findBaseRowTapTarget(page);
        const saves = designWrites.saves().length;

        await page.touchscreen.tap(target.x, target.y);
        await expect(page.getByTestId("selection-debug")).toHaveAttribute(
          "data-selection-id",
          target.placementId,
        );
        await expect(page.getByTestId("editor-panel")).toBeVisible();
        return saves;
      });

    await test.step("the editor's room back link, tapped, lands on 1D with every field refilled (criterion 10)", async () => {
      await page.getByTestId("top-bar-back").tap();
      // M7C C1 S3: the link asks first, and *Înapoi la cameră* is the navigation.
      await page.getByTestId("back-confirm-confirm").tap();
      await expect(page).toHaveURL(typedLRoomUrl(locale, direction));
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1D",
      );
      await expectLRoomFields(page, direction);

      // Criterion 9's must-not, read after the editor has been left: a selection is not an edit, so
      // nothing was saved between the tap and here.
      expect(designWrites.saves()).toHaveLength(savesBeforeTheSelection);
      expect(designWrites.postCount()).toBe(1);
      expect(pageErrors).toEqual([]);
    });
  });
}

// ===========================================================================================
// S2 — every Back out of the editor, choosing again, resume, and leaving 1F mid-write.
// ===========================================================================================

test("from the editor: browser Back returns the form, Forward the same design; choosing again mints a second design, the first still opens, and resume lands on the newest (criteria 11-13)", async ({
  page,
  designWrites,
  pageErrors,
}) => {
  test.setTimeout(JOURNEY_TIMEOUT_MS);
  const locale = "ro";
  const direction = "left";

  const firstId = await composeLRoomByTouch(page, { locale, direction });
  await expectEditorOn(page, { locale, designId: firstId });

  await test.step("browser Back from the editor → the form, not 1F, and no composition (criterion 11)", async () => {
    await page.goBack();
    await expectTheTypedLForm(page, { locale, direction });
    expect(designWrites.postCount()).toBe(1);
  });

  await test.step("Forward → the same design, and nothing minted (criterion 11)", async () => {
    await page.goForward();
    await expect(page).toHaveURL(editorPath(locale, firstId));
    await expectEditorOn(page, { locale, designId: firstId });
    expect(designWrites.postCount()).toBe(1);
  });

  const secondId =
    await test.step("choosing again after Back mints exactly one new design (criterion 12)", async () => {
      await page.goBack();
      await expectTheTypedLForm(page, { locale, direction });

      await continueButton(page).tap();
      await page.waitForURL(
        (url) =>
          isEditorUrl(url, locale) && idInEditorUrl(url.href) !== firstId,
        { timeout: JOURNEY_TIMEOUT_MS / 3 },
      );
      const mintedId = idInEditorUrl(page.url());
      expect(mintedId).not.toBe(firstId);
      await expectEditorOn(page, { locale, designId: mintedId });
      expect(designWrites.postCount()).toBe(2);
      return mintedId;
    });

  await test.step("the first design still opens in this browser (criterion 12, ADR 0111 decision 5)", async () => {
    await page.goto(editorPath(locale, firstId));
    await expectEditorOn(page, { locale, designId: firstId });
  });

  await test.step("resume lands on the newest composed design from both entry routes (criterion 13)", async () => {
    for (const entry of [`/${locale}`, `/${locale}/configurator/configure`]) {
      const navigation = await page.goto(entry);
      // Never the committed URL of an editor: the entry answers a redirect, and the page lands on
      // the design's own address.
      expect(navigation?.request().redirectedFrom(), entry).not.toBeNull();
      expect(new URL(page.url()).pathname, entry).toBe(
        editorPath(locale, secondId),
      );
      await expectEditorOn(page, { locale, designId: secondId });
    }
    expect(designWrites.postCount()).toBe(2);
    expect(pageErrors).toEqual([]);
  });
});

test("leaving 1F while the design is being written: the form stays, no editor opens, and resume finds the design once the write lands (criterion 14)", async ({
  page,
  designWrites,
  committedPathnames,
  pageErrors,
}) => {
  test.setTimeout(JOURNEY_TIMEOUT_MS);
  const locale = "ro";
  const direction = "left";

  await walkToTheTypedLRoom(page, { locale, direction });
  await watchDesignWritesInPage(page);
  const restoreTheNetwork = await emulateNetworkLatency(page, WRITE_LATENCY_MS);
  const requestedPathnames = recordRequestedPathnames(page);
  const beforeTheTap = committedPathnames.mark();
  const requestsBeforeTheTap = requestedPathnames.mark();

  await continueButton(page).tap();
  await expect(page.getByTestId("room-compose")).toBeVisible();
  await waitForAWriteInFlight(page, WRITE_IN_FLIGHT_TIMEOUT_MS);
  await page.getByTestId("room-compose-back").tap();

  // **The precondition, asserted rather than assumed** (D8 e). Read inside the browser at the instant
  // the finger touched *Înapoi*: if no write was in flight then, this test proves nothing about
  // leaving mid-write and must fail rather than pass — the plan's stop-and-report, never a skip.
  const atTheTouch = await readDesignWritesInPage(page);
  expect(
    atTheTouch.pendingAtBackTouch,
    "no design write was in flight when 1F's back control was touched — the precondition did not hold",
  ).toBeGreaterThanOrEqual(1);

  await expectTheTypedLForm(page, { locale, direction });

  // The mint and the save that follows it both land: a write in flight is abandoned, not recalled.
  await waitForWritesToSettle(page, {
    count: 2,
    timeoutMs: WRITE_IN_FLIGHT_TIMEOUT_MS,
  });
  // **An observation window for a must-not, not a synchronisation.** Had the abandoned hand-off still
  // been armed, its `push` would commit `/d/{id}` one emulated round trip (the RSC fetch) after the
  // save landed; this waits out that round trip twice over plus the settle before reading the record.
  await page.waitForTimeout(WRITE_LATENCY_MS * 2 + URL_SETTLE_MS);
  // The sharper witness first: a stale `push` **requests** `/{locale}/d/{id}` the instant it runs, so
  // this cannot be outlasted by a slow RSC response or a cold `next dev` compile the way a check on
  // the committed URL alone could be.
  expect(
    requestedPathnames
      .since(requestsBeforeTheTap)
      .filter(isEditorRoutePathname),
    "the abandoned hand-off still requested the editor",
  ).toEqual([]);
  expect(
    committedPathnames
      .since(beforeTheTap)
      .filter((pathname) => pathname.includes("/d/")),
  ).toEqual([]);
  expect(new URL(page.url()).pathname).toBe(roomPath(locale));
  await expectTheTypedLForm(page, { locale, direction });

  await restoreTheNetwork();
  const minted = await designWrites.mintedIds();
  expect(minted).toHaveLength(1);
  const [orphanedId] = minted;
  if (orphanedId === undefined) throw new Error("no design id was observed");

  // The owner's 2026-09-17 ruling: the customer reaches the design they left by resuming.
  await page.goto(`/${locale}`);
  expect(new URL(page.url()).pathname).toBe(editorPath(locale, orphanedId));
  await expectEditorOn(page, { locale, designId: orphanedId });
  const stored = await readStoredDesign(page, orphanedId);
  expect(stored.status).toBe(200);
  expect((stored.design as { room?: unknown }).room).toStrictEqual(
    typedLRoom(direction),
  );
  expect(pageErrors).toEqual([]);
});

test("straight kitchen by touch, ro: one wall and no corner at 1B, its own 1C corrected, two cameras in the editor, the round trip, and browser Back to the form (criterion 15)", async ({
  page,
  designWrites,
  pageErrors,
}) => {
  test.setTimeout(JOURNEY_TIMEOUT_MS);
  const locale = "ro";
  const typedRoomUrl = `${roomPath(locale)}?shape=linear&${STRAIGHT_ROOM_IN_THE_URL}`;

  await test.step("the straight card → 1B with one wall, the height, and no corner toggle", async () => {
    await openStepOne(page, locale);
    await page.getByTestId("room-shape-card-linear").tap();
    await expect(continueButton(page)).toBeEnabled();
    await continueButton(page).tap();

    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");
    await expect(page).toHaveURL(`${roomPath(locale)}?shape=linear`);
    await expect(lengthField(page, "wallA")).toBeVisible();
    await expect(lengthField(page, "height")).toBeVisible();
    await expect(lengthField(page, "wallB")).toHaveCount(0);
    await expect(page.getByTestId("room-corner")).toHaveCount(0);
  });

  await test.step("wall A one millimetre short → 1C on wall A; corrected → 1D", async () => {
    await typeDigits(page, "wallA", STRAIGHT_WALL_A_TOO_SHORT);
    await typeDigits(page, "height", STRAIGHT_ROOM_AS_TYPED.height);
    await expect(page).toHaveURL(
      `${roomPath(locale)}?shape=linear&wallA=${STRAIGHT_WALL_A_TOO_SHORT_IN_THE_URL}&height=${STRAIGHT_ROOM_URL_METRES.height}`,
    );
    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1C");
    await expect(page.getByTestId("room-length-reason-wallA")).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();

    await eraseDigits(page, "wallA", STRAIGHT_WALL_A_TOO_SHORT.length);
    await typeDigits(page, "wallA", STRAIGHT_ROOM_AS_TYPED.wallA);
    await expect(page).toHaveURL(typedRoomUrl);
    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
    await expect(continueButton(page)).toBeEnabled();
    expect(designWrites.postCount()).toBe(0);
    expect(designWrites.saves()).toHaveLength(0);
  });

  const designId =
    await test.step("one tap → the editor with two camera buttons", async () => {
      await continueButton(page).tap();
      await page.waitForURL((url) => isEditorUrl(url, locale), {
        timeout: JOURNEY_TIMEOUT_MS / 3,
      });
      const mintedId = idInEditorUrl(page.url());
      await expectEditorOn(page, { locale, designId: mintedId });
      await expect(
        page
          .getByRole("group", { name: cameraGroupLabel(locale) })
          .getByRole("button"),
      ).toHaveCount(2);
      expect(designWrites.postCount()).toBe(1);
      return mintedId;
    });

  await test.step("the round trip, with the stored depth fixed and no corner direction", async () => {
    await expectRoundTrip(page, designWrites, {
      designId,
      room: {
        shape: "linear",
        widthMm: Number(STRAIGHT_ROOM_AS_TYPED.wallA),
        depthMm: STRAIGHT_ROOM_DEPTH_MM,
        heightMm: Number(STRAIGHT_ROOM_AS_TYPED.height),
      },
    });
  });

  await test.step("browser Back → the form with wall A and the height intact, and nothing minted", async () => {
    await page.goBack();
    await expect(page).toHaveURL(typedRoomUrl);
    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
    await expect(page.getByTestId("room-compose")).toHaveCount(0);
    await expect(lengthField(page, "wallA")).toHaveValue(
      STRAIGHT_ROOM_AS_TYPED.wallA,
    );
    await expect(lengthField(page, "height")).toHaveValue(
      STRAIGHT_ROOM_AS_TYPED.height,
    );
    expect(designWrites.postCount()).toBe(1);
    expect(pageErrors).toEqual([]);
  });
});

// ===========================================================================================
// The journey's own steps, and the claims each one makes.
// ===========================================================================================

/** Step 1 reached the way a new visitor reaches it: `/{locale}` resumes nothing for a browser with no
 *  visitor cookie and answers with the room (D5 — an entry route, never a room query). */
async function openStepOne(page: Page, locale: Locale): Promise<void> {
  await page.goto(`/${locale}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(roomPath(locale));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
}

/** Each case toggles to both sides at least once and leaves 1B on its own direction (criterion 3).
 *  The toggle opens on *left*, so the first tap is always *right*. */
function cornerTapsEndingAt(
  direction: CornerDirection,
): readonly CornerDirection[] {
  return direction === "right" ? ["right", "left", "right"] : ["right", "left"];
}

function typedLRoomUrl(locale: Locale, direction: CornerDirection): string {
  return `${roomPath(locale)}?shape=L&${L_ROOM_IN_THE_URL}&direction=${direction}`;
}

/** The typed room as the design document must store it: the key `cornerDirection` present only for
 *  a right-hand room (ADR 0129 D2) — absent, not `"left"`, on the left. */
function typedLRoom(direction: CornerDirection): Record<string, unknown> {
  const room = {
    shape: "L",
    widthMm: Number(L_ROOM_AS_TYPED.wallA),
    depthMm: Number(L_ROOM_AS_TYPED.wallB),
    heightMm: Number(L_ROOM_AS_TYPED.height),
  };
  return direction === "right" ? { ...room, cornerDirection: "right" } : room;
}

async function expectWallAAtOneC(page: Page): Promise<void> {
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1C");
  await expect(page.getByTestId("room-length-reason-wallA")).toBeVisible();
  await expect(page.getByTestId("room-plan-label-A")).toHaveAttribute(
    "data-marked",
    "true",
  );
  await expect(page.getByTestId("room-presets-after-valid")).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();
}

async function expectLRoomFields(
  page: Page,
  direction: CornerDirection,
): Promise<void> {
  await expect(lengthField(page, "wallA")).toHaveValue(L_ROOM_AS_TYPED.wallA);
  await expect(lengthField(page, "wallB")).toHaveValue(L_ROOM_AS_TYPED.wallB);
  await expect(lengthField(page, "height")).toHaveValue(L_ROOM_AS_TYPED.height);
  await expect(
    page.getByTestId(`room-corner-control-${direction}`),
  ).toBeChecked();
}

/** The form — not 1F — over the typed room, at the room's own query. */
async function expectTheTypedLForm(
  page: Page,
  { locale, direction }: { locale: Locale; direction: CornerDirection },
): Promise<void> {
  await expect(page).toHaveURL(typedLRoomUrl(locale, direction));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expect(page.getByTestId("room-compose")).toHaveCount(0);
  await expectLRoomFields(page, direction);
}

/** The editor is drawn and is on `designId`: its pill at step 2, its canvas mounted, and the store
 *  holding that id — which it does only once `GET /api/designs/{id}` answered. */
async function expectEditorOn(
  page: Page,
  { locale, designId }: { locale: Locale; designId: string },
): Promise<void> {
  await expect(page.getByTestId("top-bar-step")).toHaveAttribute(
    "aria-label",
    stepSentence(locale, 2),
  );
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-design-id",
    designId,
  );
}

/**
 * **The round trip (D7).** Both sides of the deep equality come from the product — the `PUT` body
 * the browser actually sent, and the stored design read back from the same browser — and the typed
 * room and `presetId` are checked independently of both. Chained with `room-handoff.dom.test.ts`,
 * which holds that the `PUT` body is the generated design, this covers generated → sent → stored →
 * read.
 */
async function expectRoundTrip(
  page: Page,
  designWrites: DesignWrites,
  { designId, room }: { designId: string; room: Record<string, unknown> },
): Promise<void> {
  const handOffSave = designWrites
    .saves()
    .find((save) => save.designId === designId);
  expect(handOffSave, `no PUT was sent for ${designId}`).toBeDefined();

  const stored = await readStoredDesign(page, designId);
  expect(stored.status).toBe(200);
  expect(stored.design).toStrictEqual(handOffSave?.body);

  const storedDesign = stored.design as {
    room?: Record<string, unknown>;
    presetId?: unknown;
  };
  expect(storedDesign.room).toStrictEqual(room);
  expect(
    storedDesign.room !== undefined && "cornerDirection" in storedDesign.room,
  ).toBe("cornerDirection" in room);
  expect(storedDesign.presetId).toBeNull();
}

/** 1A → 1D for the L room, by touch, with none of S1's detours — the setup S2's claims start from. */
async function walkToTheTypedLRoom(
  page: Page,
  { locale, direction }: { locale: Locale; direction: CornerDirection },
): Promise<void> {
  await openStepOne(page, locale);
  await page.getByTestId("room-shape-card-L").tap();
  await continueButton(page).tap();
  await expect(page).toHaveURL(`${roomPath(locale)}?shape=L&direction=left`);
  if (direction === "right") {
    await page.getByTestId("room-corner-right").tap();
  }
  await typeDigits(page, "wallA", L_ROOM_AS_TYPED.wallA);
  await typeDigits(page, "wallB", L_ROOM_AS_TYPED.wallB);
  await typeDigits(page, "height", L_ROOM_AS_TYPED.height);
  await expect(page).toHaveURL(typedLRoomUrl(locale, direction));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
}

async function composeLRoomByTouch(
  page: Page,
  room: { locale: Locale; direction: CornerDirection },
): Promise<string> {
  await walkToTheTypedLRoom(page, room);
  await continueButton(page).tap();
  await page.waitForURL((url) => isEditorUrl(url, room.locale), {
    timeout: JOURNEY_TIMEOUT_MS / 3,
  });
  return idInEditorUrl(page.url());
}
