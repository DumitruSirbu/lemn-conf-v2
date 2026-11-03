import {
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { russian } from "./cabinet-detail-page";
import { DRAFT_ROUTE, OK, STATE_ROUTE } from "./price-dashboard-session";
import { romanian } from "./staff-world";

// How the publish page at /staff/catalog/publish, its history tab and one version's page are read in a browser: where
// they are, and the names of their parts. The assertions stay in the specs (docs/best-practices/browser-and-visual-qa.md).
//
// The pages read the server's own draft and history, in a development server and in a production build alike, so a spec
// seeds the draft through the routes the dashboard uses, as the screens do. A spec never publishes: a publish moves the
// active version for every other spec of the same server.

export const PUBLISH_PATH = "/ro/staff/catalog/publish";
export const HISTORY_PATH = `${PUBLISH_PATH}/history`;
export const RUSSIAN_PUBLISH_PATH = "/ru/staff/catalog/publish";

/** The config's own test: `playwright.config.ts` starts `next start` when `CI` is set, `next dev` otherwise. */
export const SERVER_IS_PRODUCTION_BUILD = process.env.CI !== undefined;

const BULK_ROUTE = "/api/staff/prices/bulk";
const VERSIONS_ROUTE = "/api/staff/prices/versions";
const BASE_CABINET_RULE_ID = "cabinet.base-cabinet";
const BULK_PERCENT = 5;
const ANCHOR_RISE_MINOR = 6_000;
const DEPTH_PERCENT = 18;
const MDF_PERCENT = 30;
const HINGE_MINOR = 4_500;
const DRYING_RACK_MINOR = 65_000;
const SECOND_TIER = 1;

/** What the seeded draft holds: the frame's count, the rows of the table, and the prices a person can correct inline. */
export const PENDING_IN_SEED = 8;
export const EDITABLE_PRICES_IN_SEED = 3;

interface DraftBody {
  readonly draftRevision: string;
  readonly changes: readonly unknown[];
}

/**
 * Puts the draft of the publish review in the server's draft, through the routes: a bulk action on the base cabinet whose
 * anchor is then set on its own, and a depth rule, a material, a hinge, a drying rack and the provisional switch. Eight
 * changes, three of them prices a row lets a person correct.
 */
export async function seedPendingDraft(context: BrowserContext): Promise<void> {
  const state = await readStateOf(context);
  let revision = await bulkOnBaseCabinet(context, state.draft.draftRevision);
  for (const change of seedChangesOf(state.active.book)) {
    revision = await putChange(context, revision, change);
  }
  const { draft } = await readStateOf(context);
  expect(draft.changes, "the seeded draft").toHaveLength(PENDING_IN_SEED);
}

interface SeedChange {
  readonly address: AppliedAddress | { readonly kind: "provisional" };
  readonly value: number | boolean;
}

function seedChangesOf(book: PriceBook): readonly SeedChange[] {
  const anchor: AppliedAddress = {
    kind: "cabinet",
    ruleId: BASE_CABINET_RULE_ID,
    field: "anchorMinor",
  };
  const activeAnchor = readEditableFields(book).find((reading) =>
    isSameAddress(reading.address, anchor),
  )?.value;
  if (typeof activeAnchor !== "number") {
    throw new Error("the active book has no anchor for the base cabinet");
  }
  const material = book.material.tiers[SECOND_TIER];
  const hardware = book.hardware.tiers[SECOND_TIER];
  if (material === undefined || hardware === undefined) {
    throw new Error("the active book has fewer than two tiers");
  }
  return [
    { address: anchor, value: activeAnchor + ANCHOR_RISE_MINOR },
    { address: { kind: "depth-rule" }, value: DEPTH_PERCENT },
    {
      address: {
        kind: "material",
        tierId: material.tierId,
        field: "percentOfCabinets",
      },
      value: MDF_PERCENT,
    },
    {
      address: {
        kind: "hardware",
        tierId: hardware.tierId,
        field: "perHingeMinor",
      },
      value: HINGE_MINOR,
    },
    {
      address: {
        kind: "accessory",
        accessoryId: "dishDryingRack",
        field: "perUnitMinor",
      },
      value: DRYING_RACK_MINOR,
    },
    { address: { kind: "provisional" }, value: false },
  ];
}

async function readStateOf(context: BrowserContext) {
  const answer = await context.request.get(STATE_ROUTE);
  expect(answer.status(), "the dashboard's state").toBe(OK);
  return (await answer.json()) as {
    active: { book: PriceBook };
    draft: DraftBody;
  };
}

async function bulkOnBaseCabinet(
  context: BrowserContext,
  expectedDraftRevision: string,
): Promise<string> {
  const answer = await context.request.post(BULK_ROUTE, {
    data: {
      expectedDraftRevision,
      target: { scope: "selection", ruleIds: [BASE_CABINET_RULE_ID] },
      percent: BULK_PERCENT,
    },
  });
  expect(answer.status(), "the bulk action on the base cabinet").toBe(OK);
  return ((await answer.json()) as { draft: DraftBody }).draft.draftRevision;
}

async function putChange(
  context: BrowserContext,
  expectedDraftRevision: string,
  change: SeedChange,
): Promise<string> {
  const answer = await context.request.put(DRAFT_ROUTE, {
    data: { expectedDraftRevision, change },
  });
  expect(
    answer.status(),
    `the change at ${JSON.stringify(change.address)}`,
  ).toBe(OK);
  return ((await answer.json()) as DraftBody).draftRevision;
}

export interface PublishedVersion {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly state: "active" | "archived";
}

/** The versions the server holds, newest first. */
export async function readVersions(
  context: BrowserContext,
): Promise<readonly PublishedVersion[]> {
  const answer = await context.request.get(VERSIONS_ROUTE);
  expect(answer.status(), "the history").toBe(OK);
  const { versions } = (await answer.json()) as {
    versions: readonly PublishedVersion[];
  };
  return versions;
}

export function versionPathOf(
  versionId: string,
  locale: "ro" | "ru" = "ro",
): string {
  return `/${locale}/staff/catalog/publish/${versionId}`;
}

/** The words of a screen, in the language of the route it is opened at. */
export type Words = (
  key: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

export function wordsOf(locale: "ro" | "ru"): Words {
  return locale === "ro" ? romanian : russian;
}

export async function openPublish(page: Page, path = PUBLISH_PATH) {
  await page.goto(path);
  await expectPublishHydrated(page, "publish-page");
}

export async function openVersion(
  page: Page,
  versionId: string,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(versionPathOf(versionId, locale));
  await expectPublishHydrated(page, "version-detail");
}

/** The element is drawn and React has taken it over: a click before that is a click on markup nothing listens to. */
export async function expectPublishHydrated(
  page: Page,
  testId: string,
): Promise<void> {
  const element = page.getByTestId(testId);
  await expect(element).toBeVisible();
  await expect
    .poll(
      () =>
        element.evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
        ),
      { message: `React has hydrated ${testId}` },
    )
    .toBe(true);
}

export function pageOf(page: Page): Locator {
  return page.getByTestId("publish-page");
}

export function diffRows(page: Page): Locator {
  return page.getByTestId("diff-row");
}

export function revertButtons(page: Page): Locator {
  return page.getByTestId("diff-revert");
}

export function noticeOf(page: Page): Locator {
  return page.getByTestId("publish-notice");
}

export function dialogOf(page: Page): Locator {
  return page.getByRole("alertdialog");
}

export function publishButton(page: Page, words: Words, count: number) {
  return pageOf(page).getByRole("button", {
    name: words("priceDashboard.publish.publishAction", { count }),
    exact: true,
  });
}

export function versionNameField(page: Page, words: Words): Locator {
  return pageOf(page).getByLabel(
    words("priceDashboard.publish.versionNameLabel"),
    { exact: true },
  );
}

export function provisionalSwitch(page: Page): Locator {
  return pageOf(page).getByRole("switch");
}

/** The element that has focus, named for a failure message. */
export function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (focused === null || focused === document.body) return "body";
    const label = focused.getAttribute("aria-label") ?? "";
    const testId = focused.getAttribute("data-testid") ?? "";
    return `${focused.tagName.toLowerCase()}[${testId}] ${label || focused.textContent.trim().slice(0, 40)}`;
  });
}

/** Whether the document scrolls sideways, and the elements that stick out past the right edge of the viewport. */
export function stickingOut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > width + 0.5 || rect.left < -0.5) {
        const name =
          element.getAttribute("data-testid") ??
          (element.getAttribute("class") ?? "").slice(0, 40);
        found.push(
          `${element.tagName.toLowerCase()}.${name} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)} of ${String(width)}`,
        );
      }
    }
    return found.slice(0, 8);
  });
}

/** The start of the name of a row's "Nou" button and field: the sentence with the row's own words cut off. */
export function newValuePrefix(words: Words): string {
  const marker = "\u0001";
  const [prefix = ""] = words("priceDashboard.publish.newValueAria", {
    name: marker,
    field: marker,
  }).split(marker);
  return prefix;
}

/** The name of a row's "Nou" button and field starts with this. */
export function startsWithNewValue(words: Words): RegExp {
  return startsWith(newValuePrefix(words));
}

function startsWith(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}

/** The buttons that open a "Nou" field, in the order of the rows: the cabinet's price, the hinge's, the rack's. */
export function newValueButtons(page: Page, words: Words): Locator {
  return pageOf(page).getByRole("button", {
    name: startsWith(newValuePrefix(words)),
  });
}

/** The open "Nou" field: there is at most one in a test that opens one. */
export function newValueField(page: Page, words: Words): Locator {
  return pageOf(page).getByRole("textbox", {
    name: startsWith(newValuePrefix(words)),
  });
}

/** What a sentence of the page says once its bidi isolates are taken out, as a reader hears it. */
export function plainText(text: string): string {
  return text.replace(/[⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
}

export interface OpenFieldGeometry {
  readonly rowHeight: number;
  /** Every descendant of the "Nou" cell that lies outside the cell's own box, named. */
  readonly outsideItsCell: string[];
  /** The "Nou" cell reaches into the cell beside it. */
  readonly overlapsNextCell: boolean;
  /** How far the table's content is wider than the table: more than 0 is clipped or scrolled content. */
  readonly pageOverflow: number;
}

/** The measures that say whether an open field fits its row, taken from the row that holds it. */
export function measureOpenField(row: Locator): Promise<OpenFieldGeometry> {
  return row.evaluate((rowElement) => {
    const cell = rowElement
      .querySelector("input")
      ?.closest<HTMLElement>("[data-empty]");
    if (cell === null || cell === undefined) throw new Error("no open field");
    const box = cell.getBoundingClientRect();
    const outsideItsCell: string[] = [];
    for (const element of cell.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      // The visually hidden labels are one pixel wide and sit just outside on purpose.
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) {
        outsideItsCell.push(
          `${element.tagName.toLowerCase()} ${rect.left.toFixed(0)}..${rect.right.toFixed(0)} in ${box.left.toFixed(0)}..${box.right.toFixed(0)}`,
        );
      }
    }
    const next = cell.nextElementSibling?.getBoundingClientRect();
    const root = document.documentElement;
    return {
      rowHeight: rowElement.getBoundingClientRect().height,
      outsideItsCell,
      overlapsNextCell: next !== undefined && box.right > next.left + 0.5,
      pageOverflow: root.scrollWidth - root.clientWidth,
    };
  });
}

export function heightOf(row: Locator): Promise<number> {
  return row.evaluate((element) => element.getBoundingClientRect().height);
}

/** The "Nou" cell of a row: the second of its cells, after "Activ acum". */
export function nouCellOf(row: Locator): Locator {
  return row.locator("[data-empty]").nth(1);
}

/** The words of a row that the row's width breaks across two lines in the middle of the word, named. */
export function wordsBrokenIn(row: Locator): Promise<string[]> {
  return row.evaluate((rowElement) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(rowElement, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      const parent = node.parentElement;
      if (parent === null || getComputedStyle(parent).display === "none")
        continue;
      for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const lines = new Set(
          Array.from(range.getClientRects()).map((rect) =>
            Math.round(rect.top),
          ),
        );
        if (lines.size > 1) broken.push(match[0]);
      }
    }
    return broken.slice(0, 6);
  });
}

/** The restore button of a version's page, named for the version it restores. */
export function restoreButton(page: Page, sequenceNumber: number): Locator {
  return page.getByRole("button", {
    name: romanian("priceDashboard.history.restoreAction", {
      versionId: String(sequenceNumber),
    }),
    exact: true,
  });
}
