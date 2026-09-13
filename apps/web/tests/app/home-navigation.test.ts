import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "../../src/app/[locale]/page";

const localizedRedirect = vi.hoisted(() => vi.fn(() => undefined as never));

vi.mock("@/i18n/navigation", () => ({ redirect: localizedRedirect }));

describe("localized home redirect", () => {
  beforeEach(() => localizedRedirect.mockClear());

  it.each(["ro", "ru"] as const)(
    "redirects the %s root from one logical locale-aware href",
    async (locale) => {
      await HomePage({ params: Promise.resolve({ locale }) });

      expect(localizedRedirect).toHaveBeenCalledOnce();
      expect(localizedRedirect).toHaveBeenCalledWith({
        href: "/configurator/room",
        locale,
      });
    },
  );
});
