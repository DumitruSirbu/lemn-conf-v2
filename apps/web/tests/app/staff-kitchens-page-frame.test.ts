// What the page draws for each answer of the staff gate, whatever produced it: the gate is replaced here so that the
// answer `staff-forbidden` (a staff account the page's capability is withheld from), which no real role reaches on this
// page today, is mapped too. A staff member refused the page keeps the staff frame and its navigation (frame S1D).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import {
  StaffForbiddenScreen,
  type StaffShellContext,
} from "@/staff/staff-shell";

import type { StaffPageRead } from "@/lib/server/staff/staff-page";

const gate = vi.hoisted(() => ({
  answer: undefined as StaffPageRead | undefined,
  asked: [] as { locale: string; page: string }[],
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: (request: { locale: string; page: string }) => {
    gate.asked.push(request);
    if (gate.answer === undefined) throw new Error("no answer planned");
    return Promise.resolve(gate.answer);
  },
}));

const { default: StaffKitchensPage } = await import(
  "../../src/app/[locale]/staff/kitchens/page"
);

const SHELL: StaffShellContext = {
  role: "operator",
  email: "staff@example.test",
  navigation: ["kitchens"],
};

beforeEach(() => {
  gate.answer = undefined;
  gate.asked = [];
});

async function pageFor(answer: StaffPageRead) {
  gate.answer = answer;
  return StaffKitchensPage({ params: Promise.resolve({ locale: "ro" }) });
}

describe("the page for each answer of the staff gate", () => {
  it("is the framework's not-found for a locale the site does not serve, before the gate is asked", async () => {
    gate.answer = { kind: "unavailable" };

    await expect(
      StaffKitchensPage({ params: Promise.resolve({ locale: "xx" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(gate.asked).toEqual([]);
  });

  it("asks the gate for the kitchens page in the page's language", async () => {
    await pageFor({ kind: "unavailable" });

    expect(gate.asked).toEqual([{ locale: "ro", page: "kitchens" }]);
  });

  it("draws the list for a staff member who may open it, handing the screen the frame the server worked out", async () => {
    const page = await pageFor({ kind: "signed-in", shell: SHELL });

    expect(page.type).toBe(StaffKitchensScreen);
    expect(page.props).toEqual({ locale: "ro", context: SHELL });
  });

  it("draws the forbidden screen inside the staff frame for a staff member refused the page", async () => {
    const page = await pageFor({ kind: "staff-forbidden", shell: SHELL });

    expect(page.type).toBe(StaffForbiddenScreen);
    expect(page.props).toEqual({
      locale: "ro",
      page: "kitchens",
      context: SHELL,
    });
  });

  it("draws the account area's forbidden screen, with no word of the staff area, for anyone else", async () => {
    const page = await pageFor({ kind: "forbidden" });

    expect(page.type).toBe(ForbiddenScreen);
    expect(page.props).toEqual({ locale: "ro" });
  });

  it("draws the notice for a gate that could not read the session", async () => {
    const page = await pageFor({ kind: "unavailable" });

    expect(page.type).toBe(StaffKitchensUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro" });
  });
});
