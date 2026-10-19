// @vitest-environment happy-dom
// "Profil" (Lot 2 frames A10A to A10D, A10H; criterion 12): the optional name, address and phone, drawn filled from the
// server. A save sends only what changed; with nothing different it sends no request and says "Nimic de salvat" rather
// than "Salvat"; an emptied field is sent as an empty text.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import { EMAIL_CHANGE_ENABLED } from "@/account/profile/email-change-enabled";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import { firstArgumentsOf } from "../support/mock-calls";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());
const leaveFor = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor,
}));

const { ProfileForm } = await import("@/account/profile/profile-form");

const copy = roMessages.accountProfile;
const errors = roMessages.accountFieldErrors;
const STORED = { name: "Ana Popescu", address: "Orhei", phone: "069 123 456" };

let screen: MountedScreen | undefined;
let answer: SignedInOutcome;

beforeEach(() => {
  sendSignedInRequest.mockReset();
  leaveFor.mockReset();
  answer = { kind: "saved" };
  sendSignedInRequest.mockImplementation(() => Promise.resolve(answer));
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

function mountProfile(profile = STORED): MountedScreen {
  screen = mountInCatalogue(
    createElement(ProfileForm, {
      locale: "ro",
      email: "ana@example.com",
      profile,
    }),
  );
  return screen;
}

const field = (
  page: MountedScreen,
  name: "name" | "address" | "phone",
): HTMLInputElement =>
  requireIn<HTMLInputElement>(page.container, `input[name=${name}]`);

async function save(page: MountedScreen): Promise<void> {
  submitFormIn(page.container);
  await flushPromises(5);
}

const sentBodies = (): unknown[] =>
  firstArgumentsOf<SignedInRequest>(sendSignedInRequest).map((request) =>
    request.flow === "profile" ? request.body : request,
  );
const statusText = (page: MountedScreen): string =>
  allIn(page.container, "[role=status]")
    .map((node) => node.textContent)
    .join("|");

describe("the page", () => {
  it("is drawn filled from the server, with the address as text and no way to type it", () => {
    const page = mountProfile();
    expect(field(page, "name").value).toBe(STORED.name);
    expect(field(page, "address").value).toBe(STORED.address);
    expect(field(page, "phone").value).toBe(STORED.phone);
    expect(page.container.textContent).toContain("ana@example.com");
    expect(
      page.container.querySelector("input[type=email], input[name=email]"),
    ).toBeNull();
  });

  it("draws values the server kept with edge spaces already trimmed, so they are no change", async () => {
    const page = mountProfile({
      name: "  Ana Popescu ",
      address: " Orhei",
      phone: "069 123 456  ",
    });
    expect(field(page, "name").value).toBe("Ana Popescu");
    await save(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it("offers a way to change the address only while that change is on", () => {
    const page = mountProfile();
    const hasControl = allIn(page.container, "button, a").some(
      (control) =>
        control.textContent.trim() ===
        roMessages.accountEmailChange.changeControl,
    );
    expect(hasControl).toBe(EMAIL_CHANGE_ENABLED);
  });

  it("holds the phone as text and says it is not verified", () => {
    const page = mountProfile();
    expect(field(page, "phone").type).toBe("tel");
    expect(page.container.textContent).toContain(copy.phoneHint);
  });
});

describe("a save with nothing different", () => {
  it("sends no request and says 'Nimic de salvat', never 'Salvat'", async () => {
    const page = mountProfile();
    await save(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(statusText(page)).toContain(copy.nothingToSave);
    expect(statusText(page)).not.toContain(copy.saved);
  });

  it("says so again on every further press, and still sends nothing", async () => {
    const page = mountProfile();
    await save(page);
    await save(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it("treats a difference of edge spaces alone as nothing, and shows the trimmed value", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "  Ana Popescu  ");
    await save(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(statusText(page)).toContain(copy.nothingToSave);
    expect(field(page, "name").value).toBe("Ana Popescu");
  });

  it("treats spaces in a field that was empty as nothing", async () => {
    const page = mountProfile({ name: "", address: "", phone: "" });
    typeInto(field(page, "address"), "     ");
    await save(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it("takes the notice back when the person edits again", async () => {
    const page = mountProfile();
    await save(page);
    typeInto(field(page, "name"), "Ana P");
    expect(statusText(page)).not.toContain(copy.nothingToSave);
  });
});

describe("a save with a difference", () => {
  it.each([
    ["name", "Ana M. Popescu", { name: "Ana M. Popescu" }],
    ["address", "Chisinau", { address: "Chisinau" }],
    ["phone", "079 000 111", { phone: "079 000 111" }],
  ] as const)("sends %s alone", async (name, value, body) => {
    const page = mountProfile();
    typeInto(field(page, name), value);
    await save(page);
    expect(sentBodies()).toEqual([body]);
  });

  it("sends the trimmed value", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "  Dan  ");
    await save(page);
    expect(sentBodies()).toEqual([{ name: "Dan" }]);
  });

  it("sends an emptied field as an empty text, which withdraws it", async () => {
    const page = mountProfile();
    typeInto(field(page, "phone"), "");
    await save(page);
    expect(sentBodies()).toEqual([{ phone: "" }]);
  });

  it("sends two changed fields together and the unchanged one not at all", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    typeInto(field(page, "address"), "Soroca");
    await save(page);
    expect(sentBodies()).toEqual([{ name: "Dan", address: "Soroca" }]);
  });

  it("says 'Salvat', and a second press without an edit then has nothing to save", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    await save(page);
    expect(statusText(page)).toContain(copy.saved);
    await save(page);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(statusText(page)).toContain(copy.nothingToSave);
  });

  it("measures the next save against what was just saved: editing back to the old value is a change", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    await save(page);
    typeInto(field(page, "name"), STORED.name);
    await save(page);
    expect(sentBodies()).toEqual([{ name: "Dan" }, { name: STORED.name }]);
  });

  it("takes 'Salvat' back as soon as the person edits", async () => {
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    await save(page);
    typeInto(field(page, "name"), "Dana");
    expect(statusText(page)).not.toContain(copy.saved);
  });

  it("does not send a second request while the first is out", async () => {
    let resolveSave: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReturnValueOnce(
      new Promise<SignedInOutcome>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    submitFormIn(page.container);
    submitFormIn(page.container);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(requireIn(page.container, "form").getAttribute("aria-busy")).toBe(
      "true",
    );
    resolveSave({ kind: "saved" });
    await flushPromises(5);
    expect(
      requireIn(page.container, "form").getAttribute("aria-busy"),
    ).toBeNull();
  });

  it("keeps the unsaved edit after a failed save, so a retry sends it again", async () => {
    answer = { kind: "unavailable" };
    const page = mountProfile();
    typeInto(field(page, "name"), "Dan");
    await save(page);
    expect(field(page, "name").value).toBe("Dan");
    expect(page.container.textContent).toContain(
      roMessages.accountForm.unavailableTitle,
    );
    answer = { kind: "saved" };
    await save(page);
    expect(sentBodies()).toEqual([{ name: "Dan" }, { name: "Dan" }]);
    expect(statusText(page)).toContain(copy.saved);
  });
});

describe("the server's refusals are placed beside the field", () => {
  it("marks one refused field in place, without a summary, and puts focus on it", async () => {
    answer = {
      kind: "invalid-input",
      issues: [{ field: "name", code: "TOO_LONG" }],
    };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(field(page, "name").getAttribute("aria-invalid")).toBe("true");
    expect(page.container.textContent).toContain(errors.nameTooLong);
    expect(page.container.querySelector("[role=alert]:not([id])")).toBeNull();
    expect(document.activeElement).toBe(field(page, "name"));
  });

  it("summarises several refused fields in one notice that takes focus, and marks each", async () => {
    answer = {
      kind: "invalid-input",
      issues: [
        { field: "name", code: "TOO_LONG" },
        { field: "address", code: "TOO_LONG" },
      ],
    };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    typeInto(field(page, "address"), "y");
    await save(page);
    expect(field(page, "name").getAttribute("aria-invalid")).toBe("true");
    expect(field(page, "address").getAttribute("aria-invalid")).toBe("true");
    expect(field(page, "phone").getAttribute("aria-invalid")).toBeNull();
    const notice = requireIn(page.container, "[role=alert]");
    expect(notice.textContent).toContain("2");
    expect(document.activeElement).toBe(notice);
  });

  it("takes back only the edited field's refusal and leaves the other standing", async () => {
    answer = {
      kind: "invalid-input",
      issues: [
        { field: "name", code: "TOO_LONG" },
        { field: "address", code: "TOO_LONG" },
      ],
    };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    typeInto(field(page, "address"), "y");
    await save(page);
    typeInto(field(page, "name"), "z");
    expect(field(page, "name").getAttribute("aria-invalid")).toBeNull();
    expect(field(page, "address").getAttribute("aria-invalid")).toBe("true");
  });

  it("reads a refusal of a field this page does not draw as a failed request, never as a silent success", async () => {
    answer = { kind: "request-failed" };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.requestFailedTitle,
    );
    expect(statusText(page)).not.toContain(copy.saved);
  });
});

describe("the other answers", () => {
  it("sends a session that ended to sign in with the reason that it expired", async () => {
    answer = { kind: "unauthenticated" };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });

  it("draws the forbidden page in place of the form for a 403, never an expiry", async () => {
    answer = { kind: "forbidden" };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(page.container.querySelector("form")).toBeNull();
    expect(leaveFor).not.toHaveBeenCalled();
    expect(page.container.textContent).toContain(
      roMessages.accountForbidden.title,
    );
  });

  it("counts a short limit down on the notice and keeps the button off for it, with the label unchanged", async () => {
    answer = { kind: "rate-limited", wait: { kind: "countdown", seconds: 45 } };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    const submit = requireIn<HTMLButtonElement>(
      page.container,
      "button[type=submit]",
    );
    expect(submit.getAttribute("aria-disabled")).toBe("true");
    expect(submit.textContent).toBe(copy.submit);
    expect(page.container.textContent).toContain("0:4");
  });

  it("offers 'Incearca din nou' after a service that was not there, in place of the save label", async () => {
    answer = { kind: "unavailable" };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(
      byWords(page.container, "button", roMessages.accountForm.retry),
    ).toBeDefined();
  });

  it("tells no answer at all as a lost connection", async () => {
    answer = { kind: "unanswered" };
    const page = mountProfile();
    typeInto(field(page, "name"), "x");
    await save(page);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.offlineTitle,
    );
  });
});
