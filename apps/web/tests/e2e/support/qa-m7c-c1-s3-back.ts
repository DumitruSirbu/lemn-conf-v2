// M7C wave C1 slice S3 adversarial QA (docs/WORKFLOW.md step 3): what both viewports' specs share.
// The Romanian is the copy lock's (`tests/support/approved-romanian-messages.ts`), the corpus the
// lint rule allows it in, and the Russian is written out here: neither is read from the message file
// the page renders, so the page and the expectation are not fed by one source
// (`engineering-conventions.md`, *Both sides fed by the same source*).
import {
  expect,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../../support/approved-romanian-messages";

import type { Locale } from "./seeded-design";

/** The confirmation's wording as the owner approved it on 2026-10-20 (plan M8B Lot 2 section 14, U15c), byte for byte.
 *  These specs run signed out, so `body` is the visitor's. */
export const APPROVED_COPY: Readonly<
  Record<Locale, { title: string; body: string; confirm: string; stay: string }>
> = {
  ro: {
    title: APPROVED_ROMANIAN_MESSAGES.configure.backConfirm.title,
    body: APPROVED_ROMANIAN_MESSAGES.configure.backConfirm.bodyVisitor,
    confirm: APPROVED_ROMANIAN_MESSAGES.configure.backConfirm.confirm,
    stay: APPROVED_ROMANIAN_MESSAGES.configure.backConfirm.stay,
  },
  ru: {
    title: "Вернуться к предыдущему шагу?",
    body: "Изменения сохраняются в этом браузере автоматически. Если вернёшься к предыдущему шагу, кухня останется в этом браузере, и ты сможешь начать новую.",
    confirm: "Назад к комнате",
    stay: "Остаться здесь",
  },
};

export const DIALOG = "back-confirm-dialog";
export const CONFIRM = "back-confirm-confirm";
export const STAY = "back-confirm-confirm-back";
export const SCRIM = "back-confirm-scrim";
/** `.actions`' own `gap`, which the centred variant must not have changed. */
export const ACTIONS_GAP_PX = 10;

export type BackLinkTestId = "top-bar-back" | "bottom-bar-back";

const ROOM_PATHNAME = /^\/(ro|ru)\/configurator\/room$/;

/** A tap where the project is a phone, a click where it is a pointer. */
export async function press(page: Page, target: Locator): Promise<void> {
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  await (isTouch ? target.tap() : target.click());
}

export async function openTheQuestion(
  page: Page,
  linkTestId: BackLinkTestId,
): Promise<void> {
  await press(page, page.getByTestId(linkTestId));
  await expect(page.getByTestId(DIALOG)).toBeVisible();
}

export function isRoomUrl(url: string): boolean {
  return ROOM_PATHNAME.test(new URL(url).pathname);
}

export interface RecordedRequest {
  readonly method: string;
  readonly pathname: string;
  readonly resourceType: string;
}

/** Every request the page makes from now on, with the path a reader can judge it by. */
export function recordRequests(page: Page): readonly RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  page.on("request", (request: Request) => {
    recorded.push({
      method: request.method(),
      pathname: new URL(request.url()).pathname,
      resourceType: request.resourceType(),
    });
  });
  return recorded;
}

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export async function boxOf(target: Locator): Promise<Box> {
  return target.evaluate((element): Box => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  });
}

/** Which confirmation is read: the standalone one, or the settings sheet's own confirm step. */
export interface ConfirmationSurface {
  readonly dialogTestId: string;
  readonly testIdPrefix: string;
}

export const BACK_CONFIRMATION: ConfirmationSurface = {
  dialogTestId: DIALOG,
  testIdPrefix: "back-confirm",
};
export const MATERIAL_CONFIRMATION: ConfirmationSurface = {
  dialogTestId: "global-settings-surface",
  testIdPrefix: "global-settings",
};

interface TextPart extends Box {
  readonly text: string;
  readonly overflowX: number;
  readonly overflowY: number;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly textAlign: string;
}

/** A confirmation as laid out: its heading, its sentence, its two actions and the footer's rule. */
export interface DialogFit {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly pageScrollWidth: number;
  readonly dialog: Box;
  readonly title: TextPart;
  readonly body: TextPart;
  readonly stay: TextPart;
  readonly confirm: TextPart;
  readonly footer: Box & {
    readonly justifyContent: string;
    readonly paddingLeft: number;
  };
}

export async function readDialogFit(
  page: Page,
  surface: ConfirmationSurface = BACK_CONFIRMATION,
): Promise<DialogFit> {
  return page
    .getByTestId(surface.dialogTestId)
    .evaluate((dialog, prefix): DialogFit => {
      const boxOfElement = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      };
      const need = (selector: string): Element => {
        const element = dialog.querySelector(selector);
        if (!element) throw new Error(`the dialog draws no ${selector}`);
        return element;
      };
      const textPart = (element: Element) => {
        const style = getComputedStyle(element);
        return {
          text: element.textContent,
          overflowX: element.scrollWidth - element.clientWidth,
          overflowY: element.scrollHeight - element.clientHeight,
          fontSizePx: Number.parseFloat(style.fontSize),
          fontWeight: Number(style.fontWeight),
          textAlign: style.textAlign,
          ...boxOfElement(element),
        };
      };
      const confirm = need(`[data-testid="${prefix}-confirm"]`);
      const footer = confirm.parentElement?.parentElement;
      if (!footer) throw new Error("the actions stand in no footer");
      const footerStyle = getComputedStyle(footer);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        pageScrollWidth: document.documentElement.scrollWidth,
        dialog: boxOfElement(dialog),
        title: textPart(need("h2")),
        body: textPart(need(`[data-testid="${prefix}-confirm-body"]`)),
        stay: textPart(need(`[data-testid="${prefix}-confirm-back"]`)),
        confirm: textPart(confirm),
        footer: {
          justifyContent: footerStyle.justifyContent,
          paddingLeft: Number.parseFloat(footerStyle.paddingLeft),
          ...boxOfElement(footer),
        },
      };
    }, surface.testIdPrefix);
}

/** How far the two actions, taken as one group, stand from the dialog's own centre line. */
export function actionsCentreOffset(fit: DialogFit): number {
  const groupCentre = (fit.stay.left + fit.confirm.right) / 2;
  return Math.abs(groupCentre - (fit.dialog.left + fit.dialog.right) / 2);
}

/** The dialog's own bands of `<main>` and whether each is inert, the dialog's host excepted. */
export async function liveBandsBehindTheDialog(
  page: Page,
): Promise<readonly string[]> {
  return page.getByTestId(DIALOG).evaluate((dialog) => {
    const screen = dialog.closest("main");
    if (!screen) throw new Error("the dialog stands outside the screen");
    return [...screen.children]
      .filter((band) => !band.contains(dialog) && !band.hasAttribute("inert"))
      .map((band) => `${band.tagName}.${band.className}`);
  });
}

export async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

/** Outside the watched tree (`browser-and-visual-qa.md`): a write under `apps/web` hot-reloads the
 *  page under measurement. Unset, nothing is captured. */
export async function captureEvidence(page: Page, name: string): Promise<void> {
  const directory = process.env.QA_EVIDENCE_DIR;
  if (directory === undefined) return;
  await page.screenshot({ path: `${directory}/${name}` });
}

/**
 * The settings sheet's own confirmation, reached the way a customer reaches it: a decor chosen for
 * the whole kitchen and applied, then a different material — which would lose that decor, so the
 * sheet asks first (ADR 0086 decision 3).
 */
export async function reachTheMaterialConfirmation(page: Page): Promise<void> {
  const surface = page.getByTestId(MATERIAL_CONFIRMATION.dialogTestId);
  await press(page, page.getByTestId("global-settings-trigger"));
  await press(page, surface.getByTestId("finish-pal.antracit"));
  await press(page, page.getByTestId("global-settings-apply"));
  await expect(surface).toHaveCount(0);

  await press(page, page.getByTestId("global-settings-trigger"));
  await press(
    page,
    surface.getByTestId("global-settings-option").filter({ hasText: "MDF" }),
  );
  await press(page, page.getByTestId("global-settings-apply"));
  await expect(surface).toHaveAttribute("data-step", "confirm");
}
