// Shared by the M7B U7 S0 SSR specs (`ssr-first-frame`, `qa-u7s0-ssr.adversarial`): seed a kitchen of a
// known shape, fetch the raw HTML the server sent for `/d/{id}` or `/s/{token}`, and read what that HTML
// says about the design it carries. No JavaScript is involved in any of it — what is read is what the
// server sent, not what React made of it afterwards (ADR 0133).
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type Design,
  type RoomInput,
} from "@lemnaria/configurator-domain";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { issueShareLink } from "./seeded-design";
import { composeKitchen, seedDesign } from "./u-design";

const HEIGHT_MM = 2600;

/** What a share view calls the session it hydrates (`SHARED_VIEW_DESIGN_ID`), published by
 *  `SelectionDebug` as `data-design-id` — deliberately never a real design id. */
export const SHARE_VIEW_SESSION_ID = "shared-view";

export interface KitchenSpec {
  readonly name: string;
  readonly input: RoomInput;
  readonly cameraChips: number;
  /** Seeded distinct per kitchen, so a fingerprint names its design even where price could tie. */
  readonly updatedAt: string;
}

export const U_MIDDLE: KitchenSpec = {
  name: "U 4500/3000/3600",
  input: {
    shape: "U",
    wallAMm: 4500,
    wallBMm: 3000,
    wallCMm: 3600,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 4,
  updatedAt: "2026-01-02T00:00:00.000Z",
};

export const U_LARGE: KitchenSpec = {
  name: "U 6000/3000/3000",
  input: {
    shape: "U",
    wallAMm: 6000,
    wallBMm: 3000,
    wallCMm: 3000,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 4,
  updatedAt: "2026-01-03T00:00:00.000Z",
};

/** Not the seeded L (3560 x 2920): same chip count, different kitchen. */
export const L_OWN: KitchenSpec = {
  name: "L 3700/3400",
  input: {
    shape: "L",
    wallAMm: 3700,
    wallBMm: 3400,
    heightMm: HEIGHT_MM,
    cornerDirection: "left",
  },
  cameraChips: 3,
  updatedAt: "2026-01-04T00:00:00.000Z",
};

export const STRAIGHT: KitchenSpec = {
  name: "straight 3700",
  input: { shape: "linear", wallAMm: 3700, heightMm: HEIGHT_MM },
  cameraChips: 2,
  updatedAt: "2026-01-05T00:00:00.000Z",
};

export interface SeededKitchen {
  readonly spec: KitchenSpec;
  readonly id: string;
  readonly revision: string;
  readonly designPath: string;
  readonly sharePath: string;
}

/** Everything the server-rendered HTML says about the design it carries. */
export interface Fingerprint {
  readonly cameraChips: number;
  readonly sessionId: string;
  readonly price: string;
  readonly updatedAt: string;
  readonly cabinetDepth: string;
}

function designFor(spec: KitchenSpec): Design {
  const validation = validateRoomInput(spec.input, APPROVED_ROOM_POLICY);
  if (!validation.ok) {
    throw new Error(`the approved policy refuses ${spec.name}`);
  }
  return { ...composeKitchen(validation.room), updatedAt: spec.updatedAt };
}

/**
 * Mints `spec`'s kitchen, and a share link for it, from inside `page` — the write-token and visitor
 * cookies are that browser's own, which is what `/d/{id}`'s owner gate reads. The id is pushed to
 * `mintedIds` at once, so the caller's teardown deletes the row even if a later step throws.
 */
export async function seedKitchen(
  page: Page,
  mintedIds: string[],
  spec: KitchenSpec,
): Promise<SeededKitchen> {
  const seeded = await seedDesign(page, designFor(spec));
  mintedIds.push(seeded.id);
  const sharePath = await issueShareLink(page, seeded);
  return {
    spec,
    id: seeded.id,
    revision: seeded.revision,
    designPath: `/ro/d/${seeded.id}`,
    sharePath: `/ro${sharePath}`,
  };
}

/** The HTML `path` answers with, requiring a 200. */
export async function htmlOf(
  requests: APIRequestContext,
  path: string,
): Promise<string> {
  const response = await requests.get(path);
  expect(response.status(), path).toBe(200);
  return response.text();
}

/** One of `SelectionDebug`'s `data-*` attributes; it is published only where the debug flag is on,
 *  which the e2e server sets. */
export function selectionDebugAttribute(html: string, name: string): string {
  const match = new RegExp(
    `data-testid="selection-debug"[^>]*\\s${name}="([^"]*)"`,
  ).exec(html);
  if (match === null) throw new Error(`the HTML carries no ${name}`);
  return match[1] ?? "";
}

/** Zero when the HTML has no camera row at all, so a page that carries no kitchen counts none. */
export function cameraChipCount(html: string): number {
  const row = new RegExp(
    `role="group"\\s+aria-label="${ro.configure.cameraGroupLabel}"[^>]*>([\\s\\S]*?)</div>`,
  ).exec(html);
  if (row === null) return 0;
  return (row[1] ?? "").split("<button").length - 1;
}

export function fingerprintOf(html: string): Fingerprint {
  const price = /data-testid="price-bar-total">([^<]*)</.exec(html);
  return {
    cameraChips: cameraChipCount(html),
    sessionId: selectionDebugAttribute(html, "data-design-id"),
    price: price?.[1] ?? "",
    updatedAt: selectionDebugAttribute(html, "data-updated-at"),
    cabinetDepth: selectionDebugAttribute(html, "data-cabinet-depth"),
  };
}
