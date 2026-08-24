import { describe, expect, it } from "vitest";

import { CONFIGURATOR_DOMAIN_PACKAGE } from "@lemnaria/configurator-domain";

describe("configurator-domain package", () => {
  it("exposes its built public package entry point", () => {
    expect(CONFIGURATOR_DOMAIN_PACKAGE).toBe("@lemnaria/configurator-domain");
  });
});
