// @vitest-environment happy-dom
//
// The already-sent view mounted alone, with every module of the send path replaced by a factory that throws. If anything
// in the view's import graph imports one of them, the import throws and this file fails (ADR 0163 A5). A scan of the
// view's own imports cannot fail for a transitive one; this does.
//
// What this cannot see: a send path that is not one of these five modules (the closure scan reads for `fetch(`).
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

function importOfASendPathModuleIsAFailure(path: string): never {
  throw new Error(`the already-sent view imported ${path}`);
}

vi.mock("@/contact/use-contact-submission", () =>
  importOfASendPathModuleIsAFailure("use-contact-submission"),
);
vi.mock("@/contact/contact-form", () =>
  importOfASendPathModuleIsAFailure("contact-form"),
);
vi.mock("@/contact/retry-when-online", () =>
  importOfASendPathModuleIsAFailure("retry-when-online"),
);
vi.mock("@/contact/send-contact-request", () =>
  importOfASendPathModuleIsAFailure("send-contact-request"),
);
vi.mock("@/done/use-replace-with-done", () =>
  importOfASendPathModuleIsAFailure("use-replace-with-done"),
);
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));

import { AlreadySentView } from "@/contact/already-sent-view";

import messages from "../../src/messages/ro.json";

const DESIGN = "design0123456789abcde";

let unmount: () => void;

function mountTheView(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages,
        timeZone: "Europe/Chisinau",
        children: createElement(AlreadySentView, {
          designId: DESIGN as never,
          reference: "LM-2614",
        }),
      }),
    );
  });
  unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return container;
}

afterEach(() => {
  unmount();
});

describe("the already-sent view", () => {
  it("mounts with the whole send path replaced by modules that throw when imported", () => {
    const container = mountTheView();

    expect(
      container.querySelector('[data-testid="contact-already-sent"]'),
    ).not.toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });
});
