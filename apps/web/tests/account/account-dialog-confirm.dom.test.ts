// @vitest-environment happy-dom
//
// The confirmation of the shared account dialog in its three states: ready, busy (a request is out) and off (a reason the
// person is told beside the button, such as a limit being waited out). Busy and off both ignore a press and are drawn off;
// only busy shows the spinner and the present-tense label and locks the dialog's way out. Every Lot 2 dialog stands on it.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountDialog } from "@/account/account-dialog";

import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

interface Props {
  readonly isBusy: boolean;
  readonly isOff?: boolean;
}

function open({ isBusy, isOff }: Props) {
  const onPress = vi.fn();
  const onCancel = vi.fn();
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(AccountDialog, {
        kind: "destructive",
        confirmTone: "primary",
        title: "title",
        confirm: {
          label: "do it",
          busyLabel: "doing it",
          isBusy,
          ...(isOff === undefined ? {} : { isOff }),
          onPress,
        },
        cancel: { label: "cancel", onPress: onCancel },
      }),
    ),
  );
  const confirm = requireIn(screen.container, "button:first-of-type");
  return { confirm, onPress, onCancel };
}

describe("the confirmation of the account dialog", () => {
  it("presses when it is ready, with the label of the act and no flags", () => {
    const { confirm, onPress } = open({ isBusy: false });

    click(confirm);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(confirm.textContent).toBe("do it");
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    expect(confirm.getAttribute("aria-busy")).toBeNull();
  });

  it("ignores a press when it is busy, and says the act in the present tense with a spinner", () => {
    const { confirm, onPress } = open({ isBusy: true });

    click(confirm);

    expect(onPress).not.toHaveBeenCalled();
    expect(confirm.textContent).toBe("doing it");
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(allIn(confirm, "span")).toHaveLength(1);
  });

  it("ignores a press when it is off, is drawn off, and keeps its label, with no spinner and no busy flag", () => {
    const { confirm, onPress } = open({ isBusy: false, isOff: true });

    click(confirm);

    expect(onPress).not.toHaveBeenCalled();
    expect(confirm.textContent).toBe("do it");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(confirm.getAttribute("aria-busy")).toBeNull();
    expect(allIn(confirm, "span")).toHaveLength(0);
  });

  it("presses again once it is no longer off", () => {
    const { confirm, onPress } = open({ isBusy: false, isOff: false });

    click(confirm);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves the way out open while it is off, and locks it while it is busy", () => {
    const off = open({ isBusy: false, isOff: true });
    click(requireIn(screen?.container ?? document.body, "button:last-of-type"));
    expect(off.onCancel).toHaveBeenCalledTimes(1);
    screen?.unmount();

    const busy = open({ isBusy: true });
    click(requireIn(screen?.container ?? document.body, "button:last-of-type"));
    expect(busy.onCancel).not.toHaveBeenCalled();
  });
});
