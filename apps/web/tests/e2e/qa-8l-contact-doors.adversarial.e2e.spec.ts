// Wave 8L criteria 15 and 16 through a browser: the editor, the review and the contact page answer one request alike.
// A browser with no cookie, a foreign one, an id nothing matches and every segment that is not a design id's shape are
// each given the same status and the same load-error page by all three doors, and none of them asks the design's API.
// The owner's own request is the contrast, so that "alike" is not "all refused". Nothing here counts a contact request.
import { expect, type Browser, type Page } from "@playwright/test";

import {
  callbackPath,
  contactDocumentPath,
  UNAVAILABLE,
} from "./support/contact-page";
import { deleteMintedDesigns } from "./support/minted-designs";
import { editorPath, refuseWebGL, reviewPath } from "./support/qa-8d-review";
import { mintSeededDesign, test } from "./support/seeded-design";

const LOAD_ERROR = "design-load-error";
const WELL_FORMED_UNKNOWN_ID = "A".repeat(21);

/** Segments that are not the generator's shape: too short, too long, the wrong alphabet, a static extension, an escape. */
const MALFORMED_SEGMENTS: readonly string[] = [
  "not-an-id",
  "x".repeat(20),
  "x".repeat(22),
  "abc.png",
  "..%2F..%2Fapi",
  "a%20b",
  "e2e-readiness-probe-but-longer-than-21",
];

type Door = "editor" | "review" | "contact";
const DOORS: readonly Door[] = ["editor", "review", "contact"];

function addressOf(door: Door, id: string): string {
  if (door === "editor") return editorPath("ro", id);
  return door === "review"
    ? reviewPath("ro", id)
    : contactDocumentPath("ro", id);
}

interface DoorAnswer {
  readonly status: number | undefined;
  readonly loadError: string | null;
  readonly designApiRequests: number;
}

async function answerOfDoor(
  page: Page,
  door: Door,
  id: string,
): Promise<DoorAnswer> {
  let designApiRequests = 0;
  const count = (url: string): void => {
    if (new URL(url).pathname.startsWith("/api/designs/"))
      designApiRequests += 1;
  };
  page.on("request", (request) => {
    count(request.url());
  });
  const response = await page.goto(addressOf(door, id));
  const loadError = page.getByTestId(LOAD_ERROR);
  await loadError
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(500);
  return {
    status: response?.status(),
    loadError:
      (await loadError.count()) === 0 ? null : await loadError.innerText(),
    designApiRequests,
  };
}

async function expectAllDoorsAnswerAlike(
  page: Page,
  id: string,
): Promise<DoorAnswer> {
  const answers = new Map<Door, DoorAnswer>();
  for (const door of DOORS)
    answers.set(door, await answerOfDoor(page, door, id));
  const [editor, review, contact] = DOORS.map((door) => answers.get(door));
  expect(review, `review against editor for ${id}`).toEqual(editor);
  expect(contact, `contact against editor for ${id}`).toEqual(editor);
  if (editor === undefined) throw new Error("the editor door answered nothing");
  return editor;
}

async function aForeignBrowser(
  browser: Browser,
): Promise<{ page: Page; closeAndRemove: () => Promise<void>; ownId: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const own = await mintSeededDesign(page);
  return {
    page,
    ownId: own.id,
    closeAndRemove: async () => {
      await context.close();
      await deleteMintedDesigns([own.id]);
    },
  };
}

test.describe("three doors, one answer", () => {
  test("a browser with no cookie is refused as unavailable by all three, with no request for the design", async ({
    browser,
    seededDesign,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const answer = await expectAllDoorsAnswerAlike(page, seededDesign.id);

      expect(answer.status).toBe(200);
      expect(answer.loadError).not.toBeNull();
      expect(answer.designApiRequests).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("another visitor's browser is refused exactly as one with no cookie is", async ({
    browser,
    page,
    seededDesign,
  }) => {
    const stranger = await aForeignBrowser(browser);
    try {
      const withNoCookie = await browser.newContext();
      const bare = await withNoCookie.newPage();
      const baseline = await expectAllDoorsAnswerAlike(bare, seededDesign.id);
      await withNoCookie.close();

      const foreign = await expectAllDoorsAnswerAlike(
        stranger.page,
        seededDesign.id,
      );

      expect(foreign).toEqual(baseline);
      expect(foreign.designApiRequests).toBe(0);
      // The owner, by contrast, is let in by all three: "alike" is not "all refused".
      // The editor is left out: its first frame takes the better part of a minute under software GL, and the review and
      // the contact page are the two doors this wave's criterion is about.
      for (const door of ["review", "contact"] as const) {
        const owner = await answerOfDoor(page, door, seededDesign.id);
        expect(owner.loadError, `${door} for the owner`).toBeNull();
      }
    } finally {
      await stranger.closeAndRemove();
    }
  });

  test("an id nothing matches, held by a browser that has a cookie, is refused as the same page", async ({
    browser,
    seededDesign,
  }) => {
    const stranger = await aForeignBrowser(browser);
    try {
      const unknown = await expectAllDoorsAnswerAlike(
        stranger.page,
        WELL_FORMED_UNKNOWN_ID,
      );
      const someoneElses = await expectAllDoorsAnswerAlike(
        stranger.page,
        seededDesign.id,
      );

      expect(unknown).toEqual(someoneElses);
      expect(unknown.loadError).not.toBeNull();
    } finally {
      await stranger.closeAndRemove();
    }
  });

  for (const segment of MALFORMED_SEGMENTS) {
    test(`the segment ${JSON.stringify(segment)} is unavailable on all three, as an unknown id is, before the design is asked for`, async ({
      browser,
    }) => {
      const stranger = await aForeignBrowser(browser);
      try {
        const unknown = await expectAllDoorsAnswerAlike(
          stranger.page,
          WELL_FORMED_UNKNOWN_ID,
        );
        const malformed = await expectAllDoorsAnswerAlike(
          stranger.page,
          segment,
        );

        expect(malformed.designApiRequests).toBe(0);
        expect(malformed.loadError).toBe(unknown.loadError);
        expect(malformed.status).toBe(unknown.status);
      } finally {
        await stranger.closeAndRemove();
      }
    });
  }

  test("an address with a broken percent-escape is answered alike by all three, and the design is not asked for", async ({
    browser,
  }) => {
    const stranger = await aForeignBrowser(browser);
    try {
      // Not asserted: the status. A broken escape answers 500 on every door and on the share link's and the root's too
      // (`/ro/s/%E0%A4%A`, `/%E0%A4%A`), none of which this wave changed; it is reported, not pinned here.
      const answer = await expectAllDoorsAnswerAlike(stranger.page, "%E0%A4%A");

      expect(answer.designApiRequests).toBe(0);
    } finally {
      await stranger.closeAndRemove();
    }
  });

  test("the readiness probe's address still answers 200 with the load-error page", async ({
    page,
  }) => {
    const response = await page.goto("/ro/d/e2e-readiness-probe");

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId(LOAD_ERROR)).toBeVisible();
  });
});

test.describe("a device that cannot show the kitchen", () => {
  test("the design's contact page is frame 2F with its one link, and no form; the link leads to the callback form, which is drawn without a probe", async ({
    page,
    seededDesign,
  }) => {
    await refuseWebGL(page);

    await page.goto(contactDocumentPath("ro", seededDesign.id));

    await expect(page.getByTestId("webgl-unavailable")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(
      page.getByTestId("webgl-unavailable").locator("a"),
    ).toHaveCount(1);
    await page.getByTestId("webgl-unavailable").locator("a").tap();
    await page.waitForURL(callbackPath("ro"));

    await expect(page.getByTestId("contact-cta")).toBeVisible();
    await expect(page.getByTestId("webgl-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("contact-design-card")).toHaveCount(0);
  });

  test("the callback form, opened directly, is a form on such a device and never frame 2F", async ({
    page,
  }) => {
    await refuseWebGL(page);

    await page.goto(callbackPath("ro"));

    await expect(page.getByTestId("contact-cta")).toBeVisible();
    await expect(page.getByTestId("webgl-unavailable")).toHaveCount(0);
    await expect(page.getByTestId(UNAVAILABLE)).toHaveCount(0);
  });
});
