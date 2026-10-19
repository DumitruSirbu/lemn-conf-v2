// @vitest-environment happy-dom
// Hands the browser a file through a temporary object URL and a temporary anchor (Lot 2 U13, the account export). Nothing
// is kept: the anchor is gone as soon as it has been pressed, and the URL is freed when its 60 s lifetime ends or the
// document goes away, whichever is first, and only once.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { saveFile } from "@/account/profile/save-file";

const OBJECT_URL_LIFETIME_MS = 60_000;

const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
let urlCount = 0;
let clickSpy: MockInstance<HTMLAnchorElement["click"]>;
let clickedAnchors: HTMLAnchorElement[] = [];
let anchorWasInDocumentAtClick: boolean[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  urlCount = 0;
  clickedAnchors = [];
  anchorWasInDocumentAtClick = [];
  createObjectURL.mockReset();
  createObjectURL.mockImplementation(() => {
    urlCount += 1;
    return `blob:fake/${String(urlCount)}`;
  });
  revokeObjectURL.mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
  clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
    clickedAnchors.push(this);
    anchorWasInDocumentAtClick.push(document.body.contains(this));
  });
});

afterEach(() => {
  // Every pending save listens for the page to hide; letting it hide here frees what the test left pending, so one
  // test's leftovers are never counted by the next.
  window.dispatchEvent(new Event("pagehide"));
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const BLOB = new Blob(["{}"], { type: "application/json" });

describe("the anchor", () => {
  it("is pressed once, hidden, pointing at the object URL, carrying the file name", () => {
    saveFile(BLOB, "lemnaria-account-data.json");
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(BLOB);
    expect(clickedAnchors).toHaveLength(1);
    const [anchor] = clickedAnchors;
    expect(anchor?.getAttribute("href")).toBe("blob:fake/1");
    expect(anchor?.download).toBe("lemnaria-account-data.json");
    expect(anchor?.hidden).toBe(true);
  });

  it("is in the document when pressed (some Firefox versions ignore a click on a loose anchor) and gone straight after", () => {
    saveFile(BLOB, "a.json");
    expect(anchorWasInDocumentAtClick).toEqual([true]);
    expect(document.body.querySelector("a")).toBeNull();
    expect(document.body.children).toHaveLength(0);
  });

  it("is removed even when pressing it throws, and the throw reaches the caller", () => {
    clickSpy.mockImplementation(() => {
      throw new Error("blocked by the browser");
    });
    expect(() => {
      saveFile(BLOB, "a.json");
    }).toThrow("blocked by the browser");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("is not left behind by a second file: each press makes its own and removes it", () => {
    saveFile(BLOB, "a.json");
    saveFile(BLOB, "b.json");
    expect(clickedAnchors.map((anchor) => anchor.download)).toEqual([
      "a.json",
      "b.json",
    ]);
    expect(document.body.querySelector("a")).toBeNull();
  });
});

describe("the object URL's lifetime", () => {
  it("is not revoked within the lifetime: a download the browser starts late still reads the blob", () => {
    saveFile(BLOB, "a.json");
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("is revoked at 60 seconds, once, and the page-hide listener goes with it", () => {
    saveFile(BLOB, "a.json");
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:fake/1");
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("is revoked when the page hides, once, and the timer goes with it", () => {
    saveFile(BLOB, "a.json");
    vi.advanceTimersByTime(1_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:fake/1");
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS * 2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("is still revoked when pressing the anchor threw", () => {
    clickSpy.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => {
      saveFile(BLOB, "a.json");
    }).toThrow();
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:fake/1");
  });

  it("frees each file's own URL: two saves, two revocations, each of its own", () => {
    saveFile(BLOB, "a.json");
    vi.advanceTimersByTime(10_000);
    saveFile(BLOB, "b.json");
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS - 10_000);
    expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
      "blob:fake/1",
    ]);
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
      "blob:fake/1",
      "blob:fake/2",
    ]);
  });

  it("frees both when the page hides while two are pending", () => {
    saveFile(BLOB, "a.json");
    saveFile(BLOB, "b.json");
    window.dispatchEvent(new Event("pagehide"));
    expect(revokeObjectURL.mock.calls.map(([url]) => url).sort()).toEqual([
      "blob:fake/1",
      "blob:fake/2",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("makes no anchor and leaves no timer when the browser cannot make an object URL", () => {
    createObjectURL.mockImplementation(() => {
      throw new Error("no memory");
    });
    expect(() => {
      saveFile(BLOB, "a.json");
    }).toThrow("no memory");
    expect(document.body.querySelector("a")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
