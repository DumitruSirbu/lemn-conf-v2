// @vitest-environment happy-dom
//
// What the form's memory does with the profile's values while a send holds its id, and what a request names: the
// withdrawal a hold puts off, the arrival it ignores, and the account claim that follows the account the values were
// entered under (ADR 0179 d1, d5).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  ContactFormEvent,
  ProfileAccount,
  ProfileOffer,
} from "@/contact/contact-form-model";
import { CALLBACK_TARGET } from "@/contact/use-contact-submission";

import {
  answerWith,
  hydrateSavedDesign,
  mountContactForm,
  type MountedContactForm,
} from "./contact-submission-harness";

const OFFER: ProfileOffer = {
  name: "Ana Popescu",
  phone: "069 123 456",
  locality: "Chisinau",
};
const ACCOUNT: ProfileAccount = {
  email: "ana@mail.md",
  blanks: { name: true, phone: true, locality: true },
};
const NETWORK_FAILURE = { kind: "network-failure" } as const;
const CONFLICT = answerWith(409, { code: "CONTACT_REQUEST_CONFLICT" });

let form: MountedContactForm;

beforeEach(() => {
  hydrateSavedDesign();
  form = mountContactForm({ target: CALLBACK_TARGET, locale: "ro" });
});

afterEach(() => {
  form.unmount();
});

function edit(event: ContactFormEvent): void {
  form.inOneTask((submission) => {
    submission.edit(event as Parameters<typeof submission.edit>[0]);
  });
}

function filledFromTheProfile(): void {
  edit({ type: "profile-arrived", offer: OFFER });
  form.inOneTask((submission) => {
    submission.showProfileAccount(ACCOUNT);
  });
  edit({ type: "consent-changed", isGiven: true });
}

function press(): void {
  form.inOneTask((submission) => {
    submission.press();
  });
}

function nameShown(): string {
  return form.current().form.values.name;
}

function bodyOfRequest(index: number): Record<string, unknown> {
  const request = form.fetchControl.requests[index];
  if (request === undefined) throw new Error(`no request at ${String(index)}`);
  return request.body as unknown as Record<string, unknown>;
}

async function sendAndLoseTheAnswer(): Promise<void> {
  press();
  await form.answerOldest(NETWORK_FAILURE);
}

describe("a withdrawal while a send holds its id", () => {
  it("waits, so a retry sends the values the send carried", async () => {
    filledFromTheProfile();
    await sendAndLoseTheAnswer();

    edit({ type: "profile-withdrawn" });
    press();

    expect(nameShown()).toBe(OFFER.name);
    expect(form.fetchControl.requests).toHaveLength(2);
    expect((bodyOfRequest(1).contact as { name: string }).name).toBe(
      OFFER.name,
    );
  });

  it("is applied when the id is reset", async () => {
    filledFromTheProfile();
    await sendAndLoseTheAnswer();
    edit({ type: "profile-withdrawn" });

    form.inOneTask((submission) => {
      submission.resetRequestId();
    });

    expect(nameShown()).toBe("");
  });

  it("is applied when the id is spent by a conflict", async () => {
    filledFromTheProfile();
    press();
    edit({ type: "profile-withdrawn" });
    expect(nameShown()).toBe(OFFER.name);

    await form.answerOldest(CONFLICT);

    expect(nameShown()).toBe("");
  });

  it("is dropped when the profile arrives again before the hold ends", async () => {
    filledFromTheProfile();
    await sendAndLoseTheAnswer();
    edit({ type: "profile-withdrawn" });
    edit({ type: "profile-arrived", offer: OFFER });

    form.inOneTask((submission) => {
      submission.resetRequestId();
    });

    expect(nameShown()).toBe(OFFER.name);
  });

  it("is not needed for an arrival, which a hold ignores: the carried values stay as they are", async () => {
    edit({ type: "text-changed", field: "name", text: "Ion" });
    edit({ type: "consent-changed", isGiven: true });
    edit({ type: "text-changed", field: "phone", text: "069 000 111" });
    await sendAndLoseTheAnswer();

    edit({ type: "profile-arrived", offer: OFFER });

    expect(form.current().form.values.locality).toBe("");
  });
});

describe("the account a request names", () => {
  it("is the one the line shows", () => {
    edit({ type: "text-changed", field: "name", text: "Ion" });
    edit({ type: "text-changed", field: "phone", text: "069 000 111" });
    edit({ type: "consent-changed", isGiven: true });
    form.inOneTask((submission) => {
      submission.showProfileAccount(ACCOUNT);
    });

    press();

    expect(bodyOfRequest(0).profileAccountEmail).toBe(ACCOUNT.email);
  });

  it("is none for what was typed under an account that has gone, until the customer edits a field", async () => {
    edit({ type: "text-changed", field: "name", text: "Ion" });
    edit({ type: "text-changed", field: "phone", text: "069 000 111" });
    edit({ type: "consent-changed", isGiven: true });
    form.inOneTask((submission) => {
      submission.showProfileAccount(ACCOUNT);
    });
    edit({ type: "account-changed" });
    form.inOneTask((submission) => {
      submission.showProfileAccount({ ...ACCOUNT, email: "ion@mail.md" });
    });

    press();
    await form.answerOldest(NETWORK_FAILURE);
    expect("profileAccountEmail" in bodyOfRequest(0)).toBe(false);

    edit({ type: "text-changed", field: "locality", text: "Balti" });
    press();

    expect(bodyOfRequest(1).profileAccountEmail).toBe("ion@mail.md");
  });

  it("is still named after a change of account when the customer typed nothing under the first", () => {
    edit({ type: "profile-arrived", offer: OFFER });
    edit({ type: "consent-changed", isGiven: true });
    form.inOneTask((submission) => {
      submission.showProfileAccount(ACCOUNT);
    });
    edit({ type: "account-changed" });
    form.inOneTask((submission) => {
      submission.showProfileAccount({ ...ACCOUNT, email: "ion@mail.md" });
    });
    edit({
      type: "profile-arrived",
      offer: { name: "Ion Rusu", phone: "069 000 111", locality: "" },
    });

    press();

    expect(bodyOfRequest(0).profileAccountEmail).toBe("ion@mail.md");
  });
});
