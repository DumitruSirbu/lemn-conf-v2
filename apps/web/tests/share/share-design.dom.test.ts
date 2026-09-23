// @vitest-environment happy-dom
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";

const issueShareLink = vi.hoisted(() => vi.fn());
const revokeShareLink = vi.hoisted(() => vi.fn());
const shareLinkStatus = vi.hoisted(() => vi.fn());

vi.mock("@/persistence/share-link-client", () => ({
  issueShareLink,
  revokeShareLink,
  shareLinkStatus,
}));

const [{ ShareDesign }, { useConfiguratorStore }] = await Promise.all([
  import("@/share/share-design"),
  import("@/store/configurator-store"),
]);

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(ShareDesign),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
  await flush();
}

function byTestId(testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

/** Dispatches a click and flushes the handler's promise chain in one step — every button here
 *  starts an async request, so a bare `act(() => dispatch())` would leave that request unresolved
 *  when the assertion below runs. */
async function click(testId: string): Promise<void> {
  act(() => {
    byTestId(testId)?.dispatchEvent(new Event("click", { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  issueShareLink.mockReset();
  revokeShareLink.mockReset();
  shareLinkStatus.mockReset();
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

/** D10: the presence gate. Each case leaves the store otherwise eligible, so a failure here is
 *  earned by the one field under test. */
describe("ShareDesign — presence gate", () => {
  it.each([
    ["canWrite is false", { canWrite: false }],
    ['canWrite is "checking"', { canWrite: "checking" as const }],
    ["hasPersistedSuccessfully is false", { hasPersistedSuccessfully: false }],
    ["designId is null", { designId: null }],
  ])("renders nothing when %s", async (_case, override) => {
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: "design-a",
      revision: "1",
      canWrite: true,
      hasPersistedSuccessfully: true,
      ...override,
    });

    await mount();

    expect(container.querySelector('[data-testid="share-design"]')).toBeNull();
    expect(shareLinkStatus).not.toHaveBeenCalled();
  });

  it("renders once canWrite, hasPersistedSuccessfully and designId all hold", async () => {
    shareLinkStatus.mockResolvedValue(false);
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: "design-a",
      revision: "1",
      canWrite: true,
      hasPersistedSuccessfully: true,
    });

    await mount();

    expect(byTestId("share-design")).not.toBeNull();
    expect(shareLinkStatus).toHaveBeenCalledWith("design-a");
  });
});

describe("ShareDesign — the four states", () => {
  beforeEach(() => {
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: "design-a",
      revision: "1",
      canWrite: true,
      hasPersistedSuccessfully: true,
    });
  });

  it("none: offers to create a link", async () => {
    shareLinkStatus.mockResolvedValue(false);
    await mount();

    expect(byTestId("share-design-create")).not.toBeNull();
    expect(byTestId("share-design-status")).toBeNull();
  });

  it("active: shows status, reissue and revoke, never the link", async () => {
    shareLinkStatus.mockResolvedValue(true);
    await mount();

    expect(byTestId("share-design-status")).not.toBeNull();
    expect(byTestId("share-design-reissue")).not.toBeNull();
    expect(byTestId("share-design-revoke")).not.toBeNull();
    expect(byTestId("share-design-link")).toBeNull();
  });

  it("just-issued: creating shows the link exactly once, with the shown-once warning", async () => {
    shareLinkStatus.mockResolvedValue(false);
    issueShareLink.mockResolvedValue("/s/abcDEF123456");
    await mount();
    await click("share-design-create");

    const field = byTestId("share-design-link") as HTMLInputElement | null;
    expect(field?.value).toContain("/s/abcDEF123456");
    expect(byTestId("share-design-shown-once")).not.toBeNull();
  });

  it("copies the shown link to the clipboard", async () => {
    shareLinkStatus.mockResolvedValue(false);
    issueShareLink.mockResolvedValue("/s/abcDEF123456");
    await mount();
    await click("share-design-create");
    await click("share-design-copy");

    const clipboard = navigator.clipboard as unknown as {
      writeText: ReturnType<typeof vi.fn>;
    };
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/s/abcDEF123456"),
    );
  });

  it("revoking an active link returns to none, with the revoked line", async () => {
    shareLinkStatus.mockResolvedValue(true);
    revokeShareLink.mockResolvedValue(undefined);
    await mount();
    await click("share-design-revoke");

    expect(byTestId("share-design-create")).not.toBeNull();
    expect(byTestId("share-design-revoked")).not.toBeNull();
  });

  it("error: a failed status check shows the error copy and a way to try again", async () => {
    shareLinkStatus.mockRejectedValue(new Error("network down"));
    await mount();

    expect(byTestId("share-design-error")).not.toBeNull();
    expect(byTestId("share-design-retry")).not.toBeNull();
  });
});

/** Review round 1, L1.1: the retry button must repeat whichever request failed, never always
 *  `create` — a status-check retry that silently re-issued would mint a fresh link, and a
 *  failed-revoke retry that silently re-issued would leave the link it was meant to kill standing
 *  beside a second one. */
describe("ShareDesign — the retry button repeats the operation that failed", () => {
  beforeEach(() => {
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: "design-a",
      revision: "1",
      canWrite: true,
      hasPersistedSuccessfully: true,
    });
  });

  it("retries the status check, not a create, after the initial read fails", async () => {
    shareLinkStatus.mockRejectedValueOnce(new Error("network down"));
    shareLinkStatus.mockResolvedValueOnce(false);
    await mount();
    expect(byTestId("share-design-error")).not.toBeNull();

    await click("share-design-retry");

    expect(shareLinkStatus).toHaveBeenCalledTimes(2);
    expect(issueShareLink).not.toHaveBeenCalled();
    expect(byTestId("share-design-create")).not.toBeNull();
  });

  it("retries create after a failed issue, not a revoke or a second status read", async () => {
    shareLinkStatus.mockResolvedValue(false);
    issueShareLink.mockRejectedValueOnce(new Error("network down"));
    issueShareLink.mockResolvedValueOnce("/s/abcDEF123456");
    await mount();
    await click("share-design-create");
    expect(byTestId("share-design-error")).not.toBeNull();

    await click("share-design-retry");

    expect(issueShareLink).toHaveBeenCalledTimes(2);
    expect(revokeShareLink).not.toHaveBeenCalled();
    const field = byTestId("share-design-link") as HTMLInputElement | null;
    expect(field?.value).toContain("/s/abcDEF123456");
  });

  it("retries revoke after a failed revoke, never re-issuing the link it was meant to kill", async () => {
    shareLinkStatus.mockResolvedValue(true);
    revokeShareLink.mockRejectedValueOnce(new Error("network down"));
    revokeShareLink.mockResolvedValueOnce(undefined);
    await mount();
    await click("share-design-revoke");
    expect(byTestId("share-design-error")).not.toBeNull();

    await click("share-design-retry");

    expect(revokeShareLink).toHaveBeenCalledTimes(2);
    expect(issueShareLink).not.toHaveBeenCalled();
    expect(byTestId("share-design-revoked")).not.toBeNull();
  });
});

/** Review round 1, L1.2: `copied` follows only a `writeText` that actually resolved, and a
 *  rejection or a missing `navigator.clipboard` must reach neither an unhandled rejection nor a
 *  false "Copiat". */
describe("ShareDesign — the copy button never shows a confirmation the browser did not earn", () => {
  beforeEach(() => {
    useConfiguratorStore.setState({
      design: KITCHEN_L_DESIGN,
      designId: "design-a",
      revision: "1",
      canWrite: true,
      hasPersistedSuccessfully: true,
    });
  });

  it("shows no confirmation when the clipboard write rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    shareLinkStatus.mockResolvedValue(false);
    issueShareLink.mockResolvedValue("/s/abcDEF123456");
    await mount();
    await click("share-design-create");

    await click("share-design-copy");

    expect(byTestId("share-design-copy")?.textContent).toBe(
      roMessages.share.copy,
    );
  });

  it("shows no confirmation and does not throw when navigator.clipboard is absent", async () => {
    vi.stubGlobal("navigator", {});
    shareLinkStatus.mockResolvedValue(false);
    issueShareLink.mockResolvedValue("/s/abcDEF123456");
    await mount();
    await click("share-design-create");

    await click("share-design-copy");

    expect(byTestId("share-design-copy")?.textContent).toBe(
      roMessages.share.copy,
    );
  });
});
