import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadOwnedDesign } from "../../../src/lib/server/load-owned-design";

/**
 * The shared owned load refuses a segment that is not a design id's shape as *unavailable* before any query (8L.13,
 * criterion 16). The shape is the domain's `isDesignId`: the load states none of its own, which these tests hold by
 * letting the predicate's answer, and nothing else, decide whether the repository is asked.
 */

const OWNER_VALUE = "O".repeat(43);
const WELL_FORMED_ID = "wellFormedDesignId__1";

const loadOwned = vi.hoisted(() => vi.fn());
const isDesignIdSpy = vi.hoisted(() => vi.fn<(value: string) => boolean>());

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return { ...actual, isDesignId: isDesignIdSpy };
});
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === "__Host-lemnaria_visitor" ? { value: OWNER_VALUE } : undefined,
    }),
}));

const UNAVAILABLE = { kind: "refused", reason: "unavailable" } as const;

beforeEach(async () => {
  loadOwned.mockReset();
  loadOwned.mockResolvedValue({ kind: "none" });
  isDesignIdSpy.mockClear();
  const actual = await vi.importActual<
    typeof import("@lemnaria/configurator-domain")
  >("@lemnaria/configurator-domain");
  isDesignIdSpy.mockImplementation(actual.isDesignId);
});

describe("loadOwnedDesign's use of the domain's id predicate", () => {
  it("asks isDesignId about the very segment it was given", async () => {
    await loadOwnedDesign(WELL_FORMED_ID);

    expect(isDesignIdSpy).toHaveBeenCalledWith(WELL_FORMED_ID);
  });

  it("refuses a well-formed id the predicate refuses, and asks the repository nothing", async () => {
    isDesignIdSpy.mockReturnValue(false);

    const outcome = await loadOwnedDesign(WELL_FORMED_ID);

    expect(outcome).toEqual(UNAVAILABLE);
    expect(loadOwned).not.toHaveBeenCalled();
  });

  it("asks the repository about a segment the predicate accepts, however short, so the load holds no shape of its own", async () => {
    isDesignIdSpy.mockReturnValue(true);

    await loadOwnedDesign("x");

    expect(loadOwned).toHaveBeenCalledTimes(1);
    expect(loadOwned.mock.calls[0]?.[0]).toMatchObject({ id: "x" });
  });
});

describe("a segment that is not a design id's shape", () => {
  const malformedIds: readonly [string, string][] = [
    ["empty", ""],
    ["twenty characters", "a".repeat(20)],
    ["twenty-two characters", "a".repeat(22)],
    ["a legacy slug", "owned-row"],
    ["a dot in the alphabet's place", `${"a".repeat(20)}.`],
    ["a slash in the alphabet's place", `${"a".repeat(20)}/`],
    ["a percent escape", `${"a".repeat(18)}%2F`],
    ["a trailing newline after twenty-one characters", `${"a".repeat(21)}\n`],
    ["a trailing newline after twenty characters", `${"a".repeat(20)}\n`],
    ["a space", `${"a".repeat(20)} `],
    ["a non-ASCII letter", `${"a".repeat(20)}é`],
    ["a path traversal", "../../etc/passwd_____"],
  ];

  it.each(malformedIds)(
    "%s is unavailable and reaches no repository",
    async (_name, id) => {
      const outcome = await loadOwnedDesign(id);

      expect(outcome).toEqual(UNAVAILABLE);
      expect(loadOwned).not.toHaveBeenCalled();
    },
  );

  it.each(malformedIds)(
    "%s is refused as an unknown well-formed id is, to the last property",
    async (_name, id) => {
      const refusedForShape = await loadOwnedDesign(id);
      const refusedAsUnknown = await loadOwnedDesign(WELL_FORMED_ID);

      expect(refusedAsUnknown).toEqual(UNAVAILABLE);
      expect(refusedForShape).toStrictEqual(refusedAsUnknown);
      expect(Object.keys(refusedForShape)).toEqual(
        Object.keys(refusedAsUnknown),
      );
    },
  );
});

describe("a segment that is a design id's shape", () => {
  it("is looked up under exactly that id", async () => {
    await loadOwnedDesign(WELL_FORMED_ID);

    expect(loadOwned).toHaveBeenCalledTimes(1);
    expect(loadOwned.mock.calls[0]?.[0]).toMatchObject({ id: WELL_FORMED_ID });
  });

  it("is found when the repository finds it", async () => {
    loadOwned.mockResolvedValue({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "7",
    });

    const outcome = await loadOwnedDesign(WELL_FORMED_ID);

    expect(outcome).toEqual({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "7",
    });
  });

  it.each([
    "A".repeat(21),
    "z".repeat(21),
    "0".repeat(21),
    "-".repeat(21),
    "_".repeat(21),
  ])("%s, at an edge of the alphabet, reaches the repository", async (id) => {
    await loadOwnedDesign(id);

    expect(loadOwned).toHaveBeenCalledTimes(1);
  });
});
