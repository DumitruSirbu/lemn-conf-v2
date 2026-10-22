// The undo page is a shell around one client screen, and unlike the confirmation page it is not behind the e-mail-change
// switch: a link already mailed must not be stranded when the feature is turned off (Lot 2 plan R-13).
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_CHANGE_ENABLED } from "@/account/profile/email-change-enabled";
import { RevertEmailForm } from "@/account/profile/revert-email-form";

import roMessages from "../../src/messages/ro.json";

const connection = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({
  getTranslations: ({ locale }: { locale: "ro" }) =>
    Promise.resolve(createTranslator({ locale, messages: roMessages })),
}));

const { default: RevertEmailPage, generateMetadata } = await import(
  "../../src/app/[locale]/account/revert-email/page"
);

const paramsOf = (locale: string) => ({ params: Promise.resolve({ locale }) });

beforeEach(() => {
  connection.mockReset();
  notFound.mockClear();
});

describe("the undo page", () => {
  it("is built while the e-mail change is switched off", () => {
    expect(EMAIL_CHANGE_ENABLED).toBe(false);
  });

  it("renders the form for a served locale while the switch is off, per request", async () => {
    const page = await RevertEmailPage(paramsOf("ro"));

    expect(page.type).toBe(RevertEmailForm);
    expect(page.props).toEqual({ locale: "ro" });
    expect(connection).toHaveBeenCalledTimes(1);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("titles itself from its own catalogue while the switch is off", async () => {
    const metadata = await generateMetadata(paramsOf("ro"));

    expect(metadata.title).toBe(
      roMessages.accountRevertEmail.metaTitle.replace(
        "{brand}",
        roMessages.brand,
      ),
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("is the framework's not-found for a locale the site does not serve", async () => {
    await expect(RevertEmailPage(paramsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(generateMetadata(paramsOf("xx"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
