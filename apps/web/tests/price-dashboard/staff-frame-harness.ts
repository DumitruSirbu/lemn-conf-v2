// What a DOM test of a dashboard page needs around the staff frame: the account control asks the server who is signed in
// and the sheet's sign-out posts to a route, both stubbed here, and a shell mounted in the shipped catalogue the way the
// project's other screens are.
import { createElement, type ReactNode } from "react";
import { vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  StaffShell,
  type StaffAreaPage,
  type StaffRole,
  type StaffShellContext,
} from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

export const STAFF_ADDRESS = "elena.munteanu@lemnaria.md";

const STAFF_SESSION = {
  state: "signed-in",
  email: STAFF_ADDRESS,
  capabilities: ["design.read.any", "price.edit", "account.manage.own"],
};

export function stubTheStaffServer(): void {
  resetAccountSessionForTests();
  vi.stubGlobal("location", { assign: () => undefined });
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string | URL | Request) => {
      const isLogout =
        typeof address === "string" && address === "/api/account/logout";
      return Promise.resolve(
        isLogout
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(STAFF_SESSION), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
      );
    }),
  );
}

export function leaveTheStaffServer(): void {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
}

export function contextOf(
  role: StaffRole,
  navigation: readonly StaffAreaPage[],
  pendingPriceCount?: number,
): StaffShellContext {
  return { role, email: STAFF_ADDRESS, navigation, pendingPriceCount };
}

export async function mountInStaffFrame({
  locale = "ro",
  page = "cabinets",
  context,
  children,
}: {
  locale?: TestLocale;
  page?: StaffAreaPage;
  context: StaffShellContext;
  children: ReactNode;
}): Promise<MountedScreen> {
  const screen = mountInCatalogue(
    createElement(StaffShell, { locale, page, context, children }),
    locale,
  );
  await flushPromises(5);
  return screen;
}
