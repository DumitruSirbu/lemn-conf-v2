// M7C wave C1 slice S1 adversarial QA (docs/WORKFLOW.md step 3), FB-009 (docs/decisions/0171, M7C C1 S1):
// at 1280, 1440 and 1920 px wide, in 1A, 1B, 1C and 1F, each footer control's vertical centre is within
// 1 px of the footer's (the test's own tolerance). *Must not:* any phone footer rule changes; a control
// moves horizontally.
//
// **Computed layout, not the declaration.** `tests/room/step-one-desktop-footer-centring.test.ts`
// pins `align-items: center` in two rule bodies and stays green under a later rule that overrides it
// or a child that opts out with `align-self` (both measured in this wave's QA). This reads the boxes.
//
// **1F is held on screen, never raced** — the design write is held by `page.route` and aborted, as
// `holdDesignWrites` in `support/room-desktop-line.ts` does, so no row is ever written.
//
// Each test prints one `FOOTER_GEOMETRY` line, which is how the horizontal positions were compared
// against the unfixed stylesheet: the same run, twice, and a diff of the two lines' `left`/`right`.
import { expect, test, type Page, type Route } from "@playwright/test";

interface Viewport {
  readonly width: number;
  readonly height: number;
}

const DESKTOP_VIEWPORTS: readonly Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const PHONE: Viewport = { width: 390, height: 844 };

const CENTRE_TOLERANCE_PX = 1;
/** D1A `:92`, D1B `:190`: the desktop footer band, border included (`box-sizing: border-box`). */
const DESKTOP_FOOTER_HEIGHT_PX = 88;
/** D1A `:92`: the footer's horizontal padding at desktop width. */
const DESKTOP_FOOTER_INSET_PX = 40;
/** `.cta` and `.back`: the control height both frames draw. */
const CONTROL_HEIGHT_PX = 52;
/** The phone footers' `padding: 14px 18px 20px` under a 1 px top border. */
const PHONE_FOOTER_TOP_INSET_PX = 15;
const PHONE_FOOTER_BOTTOM_INSET_PX = 20;
const PHONE_FOOTER_SIDE_INSET_PX = 18;
const COMPOSE_TIMEOUT_MS = 90_000;

const ROOM_PATH = "/ro/configurator/room";
const ONE_B_QUERY = "shape=L&direction=left";
/** Frame D1C's own room: wall B under the L minimum. */
const ONE_C_QUERY = "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left";
const ONE_D_QUERY = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";

interface ControlBox {
  readonly testId: string | null;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface FooterGeometry {
  readonly alignItems: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly controls: readonly ControlBox[];
}

interface FooterWitness {
  readonly screen: string;
  /** A control whose parent element is the footer under measurement. */
  readonly anchorTestId: string;
  readonly controlTestIds: readonly string[];
}

const ONE_A: FooterWitness = {
  screen: "1A",
  anchorTestId: "room-continue",
  controlTestIds: ["room-continue"],
};
const FORM_CONTROLS = ["room-back", "room-continue"];
const ONE_F: FooterWitness = {
  screen: "1F",
  anchorTestId: "room-compose-back",
  controlTestIds: ["room-compose-back", "room-compose-cta"],
};
const ONE_F_RETRY: FooterWitness = {
  screen: "1F after a failed hand-off",
  anchorTestId: "room-compose-back",
  controlTestIds: ["room-compose-back", "room-compose-retry"],
};

for (const viewport of DESKTOP_VIEWPORTS) {
  test(`at ${String(viewport.width)} px every Step 1 footer control is centred in an 88 px footer, 40 px from its edges`, async ({
    page,
  }) => {
    test.setTimeout(COMPOSE_TIMEOUT_MS);
    await page.setViewportSize(viewport);

    const measured = await walkStepOneFooters(page);
    printGeometry(viewport, measured);

    for (const [screen, footer] of measured) {
      const detail = `${screen}: ${JSON.stringify(footer)}`;
      expect(footer.bottom - footer.top, detail).toBe(DESKTOP_FOOTER_HEIGHT_PX);
      for (const control of footer.controls) {
        expect(centreOffset(footer, control), detail).toBeLessThanOrEqual(
          CENTRE_TOLERANCE_PX,
        );
        expect(control.bottom - control.top, detail).toBe(CONTROL_HEIGHT_PX);
        expect(control.left, detail).toBeGreaterThanOrEqual(
          footer.left + DESKTOP_FOOTER_INSET_PX,
        );
        expect(control.right, detail).toBeLessThanOrEqual(
          footer.right - DESKTOP_FOOTER_INSET_PX,
        );
      }
      const last = footer.controls.at(-1);
      expect(last?.right, detail).toBe(footer.right - DESKTOP_FOOTER_INSET_PX);
    }
  });
}

test("at 390 x 844 no Step 1 footer centres on the cross axis: each control keeps the phone's 14 / 18 / 20 padding", async ({
  page,
}) => {
  test.setTimeout(COMPOSE_TIMEOUT_MS);
  await page.setViewportSize(PHONE);

  const measured = await walkStepOneFooters(page);
  printGeometry(PHONE, measured);

  for (const [screen, footer] of measured) {
    const detail = `${screen}: ${JSON.stringify(footer)}`;
    expect(footer.alignItems, detail).toBe("normal");
    for (const control of footer.controls) {
      expect(control.top - footer.top, detail).toBe(PHONE_FOOTER_TOP_INSET_PX);
      expect(footer.bottom - control.bottom, detail).toBe(
        PHONE_FOOTER_BOTTOM_INSET_PX,
      );
    }
    expect(footer.controls[0]?.left, detail).toBe(PHONE_FOOTER_SIDE_INSET_PX);
    expect(footer.controls.at(-1)?.right, detail).toBe(
      PHONE.width - PHONE_FOOTER_SIDE_INSET_PX,
    );
  }
});

function centreOffset(footer: FooterGeometry, control: ControlBox): number {
  const footerCentre = (footer.top + footer.bottom) / 2;
  const controlCentre = (control.top + control.bottom) / 2;
  return Math.abs(controlCentre - footerCentre);
}

function printGeometry(
  viewport: Viewport,
  measured: ReadonlyMap<string, FooterGeometry>,
): void {
  console.log(
    `FOOTER_GEOMETRY ${String(viewport.width)} ${JSON.stringify([...measured])}`,
  );
}

/** 1A, 1B, 1C, 1D, 1F and 1F's failed hand-off, each footer read while its screen is up. */
async function walkStepOneFooters(
  page: Page,
): Promise<ReadonlyMap<string, FooterGeometry>> {
  const measured = new Map<string, FooterGeometry>();
  const formScreens = [
    { screen: "1B", query: ONE_B_QUERY },
    { screen: "1C", query: ONE_C_QUERY },
    { screen: "1D", query: ONE_D_QUERY },
  ];

  await openRoom(page, "1A", "");
  measured.set("1A", await readFooter(page, ONE_A));
  await page.getByTestId("room-shape-card-L").click();
  await expect(page.getByTestId("room-continue")).toBeEnabled();
  measured.set("1A with a shape chosen", await readFooter(page, ONE_A));

  const releaseWrites = await holdDesignWrites(page);
  for (const { screen, query } of formScreens) {
    await openRoom(page, screen, query);
    const witness = {
      screen,
      anchorTestId: "room-back",
      controlTestIds: FORM_CONTROLS,
    };
    measured.set(screen, await readFooter(page, witness));
  }

  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose-notice")).toHaveAttribute(
    "data-compose-phase",
    "composed",
    { timeout: COMPOSE_TIMEOUT_MS / 2 },
  );
  measured.set(ONE_F.screen, await readFooter(page, ONE_F));

  await releaseWrites();
  await expect(page.getByTestId("room-compose-retry")).toBeVisible();
  measured.set(ONE_F_RETRY.screen, await readFooter(page, ONE_F_RETRY));
  return measured;
}

async function openRoom(
  page: Page,
  substate: string,
  query: string,
): Promise<void> {
  await page.goto(query === "" ? ROOM_PATH : `${ROOM_PATH}?${query}`);
  await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
    "data-room-substate",
    substate,
  );
}

/** Holds every `POST /api/designs`; the returned release aborts them, so no row is ever written. */
async function holdDesignWrites(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname === "/api/designs",
    async (route) => {
      if (route.request().method() === "POST") {
        held.push(route);
        return;
      }
      await route.continue();
    },
  );
  return async () => {
    await Promise.all(
      held.map((route) => route.abort().catch(() => undefined)),
    );
  };
}

/** The footer's box and every element child's, refusing a footer whose children are not exactly the
 *  controls the screen is known to draw — so a control added later cannot go unmeasured. */
async function readFooter(
  page: Page,
  witness: FooterWitness,
): Promise<FooterGeometry> {
  const geometry = await page
    .getByTestId(witness.anchorTestId)
    .evaluate((anchor): FooterGeometry => {
      const footer = anchor.parentElement;
      if (footer === null) throw new Error("The control has no footer.");
      const box = footer.getBoundingClientRect();
      return {
        alignItems: getComputedStyle(footer).alignItems,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        controls: [...footer.children].map((child) => {
          const childBox = child.getBoundingClientRect();
          return {
            testId: child.getAttribute("data-testid"),
            left: childBox.left,
            right: childBox.right,
            top: childBox.top,
            bottom: childBox.bottom,
          };
        }),
      };
    });
  expect(
    geometry.controls.map((control) => control.testId),
    witness.screen,
  ).toEqual(witness.controlTestIds);
  return geometry;
}
