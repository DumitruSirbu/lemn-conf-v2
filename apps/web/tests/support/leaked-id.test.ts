// The id-leak check the replacement sheet's tests share is only worth what it can see: the note's closing word must pass, and
// an id, in any shape the sheet's world stores, must be caught.
import { describe, expect, it } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { LEAKED_ID } from "./leaked-id";

describe("the leaked-id check", () => {
  it("passes the note in both locales and its bare closing word, which only end in the word material", () => {
    for (const note of [
      roMessages.replacementSheet.materialAndColoursUnavailable,
      ruMessages.replacementSheet.materialAndColoursUnavailable,
      "Alege alt material.",
      "<p>Alege alt material.</p>",
    ]) {
      expect(note).not.toMatch(LEAKED_ID);
    }
  });

  it.each([
    "<span>material.created-and-since-deleted</span>",
    "<span>Alege alt material.veneer</span>",
    "<span>hardware.premium</span>",
    "<span>pal.alb</span>",
    "<span>veneer.stejar</span>",
    "<span>mdf.default</span>",
    "<span>created-and-since-deleted</span>",
    "ZZ-vanished-material",
    "ZZ-vanished-hardware",
  ])("catches the id in %s", (leaked) => {
    expect(leaked).toMatch(LEAKED_ID);
  });
});
