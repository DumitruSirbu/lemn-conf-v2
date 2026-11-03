// Adversarial QA of how the publish page's screens are reached and sheeted: which screen each answer of the page's read becomes, that a
// phone-sized page cannot be pushed sideways by what the follow-ups draw.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement } from "react";

import { describe, expect, it } from "vitest";

import { publishScreenOf } from "@/app/[locale]/staff/catalog/_lib/publish-read-screen";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";
import {
  PublishScreen,
  PublishUnavailableScreen,
} from "@/price-dashboard/publish-page";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";

import { declarationsFor, valuesFor } from "../support/css-declarations";
import { contextOf } from "./staff-frame-harness";

const SHELL = contextOf("administrator", ["kitchens", "publish"]);

function screenOf(
  read: Parameters<typeof publishScreenOf>[0]["read"],
  initialView: "pending" | "history" = "pending",
) {
  return publishScreenOf({ read, locale: "ro", shell: SHELL, initialView });
}

describe("the screen each answer of the page's read becomes", () => {
  it("is the unreadable-draft screen, at the revision the read named, for a draft that cannot be read", () => {
    const screen = screenOf({
      kind: "draft-unreadable",
      draftRevision: "rev-9",
    });

    expect(isValidElement(screen)).toBe(true);
    expect(isValidElement(screen) && screen.type).toBe(
      PublishDraftUnreadableScreen,
    );
    expect(
      isValidElement<{ draftRevision: string }>(screen) &&
        screen.props.draftRevision,
    ).toBe("rev-9");
  });

  it.each(["pending", "history"] as const)(
    "is the publish screen on the %s tab, over the input the read gave",
    (initialView) => {
      const screen = screenOf(
        { kind: "ready", input: SAMPLE_PUBLISH_PAGE },
        initialView,
      );

      expect(isValidElement(screen) && screen.type).toBe(PublishScreen);
      expect(
        isValidElement<{ initialView: string }>(screen) &&
          screen.props.initialView,
      ).toBe(initialView);
    },
  );

  it("is the unavailable screen, which has no discard, for a store that cannot be read", () => {
    const screen = screenOf({ kind: "unavailable" });
    expect(isValidElement(screen) && screen.type).toBe(
      PublishUnavailableScreen,
    );
  });
});

describe("the sheet the follow-ups draw with", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/price-dashboard/publish.module.css"),
    "utf8",
  );

  it("lets the reasons of a refused publish wrap at any point, so an authored name cannot widen a 390 px page", () => {
    expect(valuesFor(css, "refusalList", "overflow-wrap")).toEqual([
      "anywhere",
    ]);
  });

  it("stacks the pager and its count, which the 390 px page has no room to put side by side", () => {
    expect(
      declarationsFor(css, "pager", "flex-direction").map((d) => d.value),
    ).toEqual(["column"]);
  });
});
