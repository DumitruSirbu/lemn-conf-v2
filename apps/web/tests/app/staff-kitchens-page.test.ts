// The staff kitchens page is a shell around one client screen, and the server gate decides what the person sees: the
// real gate, the real session read and the real capability table, over the persistence package's fake session and account
// stores. A person who is not signed in leaves for the login page; every other answer is HTTP 200 with a screen (the
// forbidden marker of the account area), never a 403 status and never "session expired" (Lot 2 O18).
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";

import roMessages from "../../src/messages/ro.json";
import {
  cookieOfValue,
  freshAccountWorld,
  type AccountWorld,
} from "../support/account-world";
import { signedInAs } from "../support/staff-world";

const framework = vi.hoisted(() => ({
  connection: vi.fn(() => Promise.resolve()),
  cookie: undefined as string | undefined,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((address: string) => {
    throw new Error(`NEXT_REDIRECT:${address}`);
  }),
}));

vi.mock("next/server", () => ({ connection: framework.connection }));
vi.mock("next/navigation", () => ({
  notFound: framework.notFound,
  redirect: framework.redirect,
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const [cookieName, value] = (framework.cookie ?? "").split("=");
        return cookieName === name && value !== undefined
          ? { name, value }
          : undefined;
      },
    }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: ({ locale }: { locale: "ro" }) =>
    Promise.resolve(createTranslator({ locale, messages: roMessages })),
}));
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);

const { default: StaffKitchensPage, generateMetadata } = await import(
  "../../src/app/[locale]/staff/kitchens/page"
);

const paramsOf = (locale: string) => ({ params: Promise.resolve({ locale }) });

let world: AccountWorld;

beforeEach(() => {
  world = freshAccountWorld();
  framework.cookie = undefined;
  framework.connection.mockClear();
  framework.notFound.mockClear();
  framework.redirect.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function signInAs(
  caller: Parameters<typeof signedInAs>[0],
): Promise<string> {
  const { session } = await signedInAs(caller);
  framework.cookie = session.cookie;
  return session.value;
}

describe("a person who is signed in as staff", () => {
  it.each([
    ["operator", ["kitchens"]],
    ["administrator", ["kitchens", "audit", "cabinets", "defaults"]],
  ] as const)(
    "gets the list for a verified %s, in the staff frame with the pages the role opens in its navigation",
    async (role, navigation) => {
      await signInAs({ role });

      const page = await StaffKitchensPage(paramsOf("ro"));

      expect(page.type).toBe(StaffKitchensScreen);
      expect(page.props).toEqual({
        locale: "ro",
        context: {
          role,
          email: `${role}@example.test`,
          navigation,
        },
      });
    },
  );

  it("asks for the page per request, before it reads the session", async () => {
    await signInAs({ role: "operator" });
    const order: string[] = [];
    framework.connection.mockImplementationOnce(() => {
      order.push("connection");
      return Promise.resolve();
    });
    world.intercept("sessions.findLive", (real) => {
      order.push("session");
      return real();
    });

    await StaffKitchensPage(paramsOf("ro"));

    expect(order).toEqual(["connection", "session"]);
  });
});

describe("a person who is not allowed in", () => {
  it.each([
    ["a verified client", { role: "client" }],
    [
      "an operator whose address is not confirmed",
      { role: "operator", isVerified: false },
    ],
    [
      "an administrator whose address is not confirmed",
      { role: "administrator", isVerified: false },
    ],
  ] as const)(
    "gets the account area's forbidden screen as a page, not a status, for %s",
    async (_label, caller) => {
      await signInAs(caller);

      const page = await StaffKitchensPage(paramsOf("ro"));

      expect(page.type).toBe(ForbiddenScreen);
      expect(page.props).toEqual({ locale: "ro" });
      expect(framework.redirect).not.toHaveBeenCalled();
      expect(framework.notFound).not.toHaveBeenCalled();
    },
  );

  it("sends a visitor to the plain login page", async () => {
    await expect(StaffKitchensPage(paramsOf("ro"))).rejects.toThrow(
      "NEXT_REDIRECT:/ro/account/login",
    );
    expect(framework.redirect).toHaveBeenCalledWith("/ro/account/login");
  });

  it("sends a session that is no longer live to the login page as an expired one, in the page's language", async () => {
    framework.cookie = cookieOfValue("x".repeat(43));

    await expect(StaffKitchensPage(paramsOf("ru"))).rejects.toThrow(
      "NEXT_REDIRECT:/ru/account/login?reason=session-expired",
    );
  });

  it("sends a session that was revoked to the login page as an expired one", async () => {
    const { account, session } = await signedInAs({ role: "operator" });
    framework.cookie = session.cookie;
    await world.sessions.revokeAllForAccount(account.id);

    await expect(StaffKitchensPage(paramsOf("ro"))).rejects.toThrow(
      "NEXT_REDIRECT:/ro/account/login?reason=session-expired",
    );
  });
});

describe("a session store that cannot be read", () => {
  it("draws the notice and sends no one to sign in", async () => {
    await signInAs({ role: "operator" });
    world.failOn("sessions.findLive");

    const page = await StaffKitchensPage(paramsOf("ro"));

    expect(page.type).toBe(StaffKitchensUnavailableScreen);
    expect(page.props).toEqual({ locale: "ro" });
    expect(framework.redirect).not.toHaveBeenCalled();
  });
});

describe("a locale the site does not serve", () => {
  it("is the framework's not-found, for the page and for its title", async () => {
    await signInAs({ role: "operator" });

    await expect(StaffKitchensPage(paramsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(generateMetadata(paramsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("the page's title", () => {
  it("is the brand alone: it is built before the gate, so it names neither the staff area nor a kitchen", async () => {
    const metadata = await generateMetadata(paramsOf("ro"));

    expect(metadata.title).toBe(roMessages.brand);
  });
});
