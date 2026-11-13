import type { NextRequest } from "next/server";

import { PUT } from "@/app/api/staff/prices/defaults/route";
import {
  DEFAULT_HANDLE,
  paletteFinish,
  TOP_ROW_HANDLE,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import type { HeldDashboardAuditEvent } from "@lemnaria/persistence";

import { accountRequest, type AccountRequestInit } from "./account-world";
import { availabilityHead, defaultsRevision } from "./availability-route-world";
import { currentPriceDashboardWorld } from "./price-dashboard-world";

// What a test of the defaults route needs beside the dashboard world: the request as a browser sends it, a body of six
// values built over the fixed fallbacks of the world's book, and the audit rows a save leaves.

const SOME_NETWORK = { "x-forwarded-for": "192.0.2.10" };

type Init = Omit<AccountRequestInit, "method">;

export function defaultsRequest(init: Init = {}): NextRequest {
  return accountRequest("/api/staff/prices/defaults", {
    ...init,
    method: "PUT",
    headers: { ...SOME_NETWORK, ...init.headers },
  });
}

export const putDefaults = (init: Init = {}) => PUT(defaultsRequest(init));

/** The six values a kitchen starts from while nothing is saved, in the sample book the world publishes. */
export const FIXED_DEFAULTS = {
  materialTierId: "material.melamine",
  hardwareTierId: "hardware.standard",
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: DEFAULT_HANDLE,
  topRowHandle: TOP_ROW_HANDLE,
} as const;

/** A whole save body against the revisions the stores hold now; a test overrides the members it is about. */
export async function saveBody(
  defaults: Readonly<Record<string, unknown>> = {},
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<Record<string, unknown>> {
  return {
    expectedRevision: await defaultsRevision(),
    expectedAvailabilityRevision: await availabilityHead(),
    defaults: { ...FIXED_DEFAULTS, ...defaults },
    ...overrides,
  };
}

export async function saveWhole(
  cookie: string,
  defaults: Readonly<Record<string, unknown>> = {},
) {
  return putDefaults({ cookie, json: await saveBody(defaults) });
}

export function savedRows(): readonly HeldDashboardAuditEvent[] {
  return currentPriceDashboardWorld()
    .ledger.heldEvents()
    .filter(({ action }) => action === "kitchen-defaults-saved");
}

/** What the store holds now, as the stamped whole, or `undefined` when nothing was ever saved. */
export async function storedDefaults(): Promise<
  NewKitchenSettings | undefined
> {
  const read = await currentPriceDashboardWorld().defaults.read();
  return read.kind === "saved"
    ? (read.saved.defaults as NewKitchenSettings)
    : undefined;
}
