import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";

import { SAMPLE_PRICE_ROOT } from "../../../support/sample-price-root";

/**
 * The notice's translator, over a catalogue with a leaf missing. The catalogue is the real one with the leaf taken out,
 * so what the translator does about a leaf that fails is what is under test, and nothing it says is a value of ours.
 */
vi.mock("@/messages/ro.json", async (importOriginal) => ({
  default: structuredClone(
    (await importOriginal<typeof import("@/messages/ro.json")>()).default,
  ),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/server/load-owned-design", () => ({ loadOwnedDesign: vi.fn() }));
vi.mock("@/lib/server/active-price-book", () => ({
  readActivePriceBook: () => Promise.resolve(SAMPLE_PRICE_ROOT),
}));

const { default: catalogue } = await import("@/messages/ro.json");
const { makeContactProductionPorts } = await import(
  "@/lib/server/contact/contact-production-ports"
);

type Leaves = Record<string, Record<string, unknown>>;
const pristine = structuredClone(catalogue) as unknown as Leaves;
const MISSING_LEAF_PATH = "band.base";

function restoreCatalogue(): void {
  Object.assign(catalogue, structuredClone(pristine));
}

function takeOut(group: string, leaf: string): void {
  const groupOfLeaves = (catalogue as unknown as Leaves)[group];
  if (groupOfLeaves === undefined) throw new Error(`no group ${group}`);
  Reflect.deleteProperty(groupOfLeaves, leaf);
}

beforeEach(restoreCatalogue);

afterEach(() => {
  restoreCatalogue();
  vi.restoreAllMocks();
});

describe("what a translator does about a leaf that fails", () => {
  it("writes to the console on its own and answers the leaf's path as text, when it is given no handler", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    takeOut("band", "base");
    const translate = createTranslator({
      locale: NOTICE_LOCALE,
      messages: catalogue,
    }) as unknown as (path: string) => string;

    const text = translate(MISSING_LEAF_PATH);

    expect(text).toBe(MISSING_LEAF_PATH);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("MISSING_MESSAGE");
  });
});

describe("the notice's translator in the contact's production ports", () => {
  it("fails a leaf that cannot be read when the ports are made, and writes nothing of its own", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Reflect.deleteProperty(catalogue, "brand");

    await expect(makeContactProductionPorts(new Headers())).rejects.toThrow();

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails a leaf that cannot be read when the notice asks for it, and writes nothing of its own", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    takeOut("band", "base");
    const { noticeContent } = await makeContactProductionPorts(new Headers());

    expect(() => noticeContent.bandLabel("base")).toThrow();

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads every leaf it is given as it always did, with the catalogue whole", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { noticeContent } = await makeContactProductionPorts(new Headers());

    expect(noticeContent.bandLabel("base")).toBe(
      (pristine.band as Record<string, string>).base,
    );
    expect(error).not.toHaveBeenCalled();
  });
});
