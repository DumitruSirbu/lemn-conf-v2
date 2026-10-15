// @vitest-environment happy-dom
//
// A press the form cannot send and has no field to point at is told as a failure, never left as a button that does
// nothing: the domain refuses a body no field accounts for (a honeypot over its length), or the saved design has no id
// to name. An unsaved design stays as it was: its wait is the sentence on screen, and the press is silent by design.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DESIGN_TARGET } from "@/contact/use-contact-submission";

import {
  changeStore,
  editWithoutSaving,
  fillValidForm,
  hydrateSavedDesign,
  mountContactForm,
  type MountedContactForm,
} from "./contact-submission-harness";

const MORE_THAN_THE_HONEYPOT_MAY_HOLD = "x".repeat(257);
const FAILED_FOR_NO_FIELD = {
  kind: "failed",
  outcome: { kind: "failed" },
  waitsUntilMs: undefined,
};

let form: MountedContactForm;

function press(): void {
  form.inOneTask(({ press: pressTheButton }) => {
    pressTheButton();
  });
}

beforeEach(() => {
  hydrateSavedDesign();
  form = mountContactForm({ target: DESIGN_TARGET, locale: "ro" });
  fillValidForm(form);
});

afterEach(() => {
  form.unmount();
});

describe("a press with no field to point at", () => {
  it("is told as a failure, with no request, when the domain refuses a body no field accounts for", () => {
    form.inOneTask(({ edit }) => {
      edit({ type: "honeypot-filled", text: MORE_THAN_THE_HONEYPOT_MAY_HOLD });
    });

    press();

    expect(form.current().phase).toEqual(FAILED_FOR_NO_FIELD);
    expect(form.current().refusedPress).toBeUndefined();
    expect(form.fetchControl.requests).toHaveLength(0);
  });

  it("is told as a failure when the saved design has no id to name", () => {
    changeStore({ designId: null });

    press();

    expect(form.current().phase).toEqual(FAILED_FOR_NO_FIELD);
    expect(form.fetchControl.requests).toHaveLength(0);
  });

  it("sends once what refused it is mended", () => {
    form.inOneTask(({ edit }) => {
      edit({ type: "honeypot-filled", text: MORE_THAN_THE_HONEYPOT_MAY_HOLD });
    });
    press();

    form.inOneTask(({ edit }) => {
      edit({ type: "honeypot-filled", text: "" });
    });
    press();

    expect(form.fetchControl.requests).toHaveLength(1);
    expect(form.current().phase).toEqual({ kind: "sending" });
  });

  it("is not a failure while an edit is unsaved, which the wait on screen already says", () => {
    editWithoutSaving("edited-in-the-editor");

    press();

    expect(form.current().phase).toEqual({ kind: "idle" });
    expect(form.fetchControl.requests).toHaveLength(0);
  });
});
