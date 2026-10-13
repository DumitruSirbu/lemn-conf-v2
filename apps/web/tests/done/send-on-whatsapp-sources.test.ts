// Reads source and stylesheet. What the WhatsApp action's dom tests cannot see: that it names no way to open a window or to
// write down, send or navigate to the link, that its one address is a literal in one place, that no other folder of the
// contact code draws it (the callback form's sent view has no design to share), and that its control is a 44 px target.
// The browser stores, the page's address, the history and the console are the contact scan's, which reads this folder.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { valuesFor } from "../support/css-declarations";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const ACTION_FILE = join(SOURCE_ROOT, "done/send-on-whatsapp.tsx");

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const actionSource = withoutComments(readFileSync(ACTION_FILE, "utf8"));

const WAYS_TO_REACH_OUT_FROM_THE_ACTION: readonly (readonly [
  string,
  RegExp,
])[] = [
  ["a window opened by script", /\bopen\s*\(|\bwindow\.open\b/],
  ["a request of its own", /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/],
  ["a Next link", /from "next\/link"|from "@\/i18n\/navigation"|<Link\b/],
  ["a prefetch", /\bprefetch\b/],
  ["the clipboard", /\bclipboard\b/],
  ["the share sheet", /\bnavigator\.share\b/],
  ["a telephone link", /\btel:/],
];

describe("the WhatsApp action's source", () => {
  it.each(WAYS_TO_REACH_OUT_FROM_THE_ACTION)(
    "names no %s",
    (_name, pattern) => {
      expect(actionSource).not.toMatch(pattern);
    },
  );

  it("makes the link by the share control's two requests and by no other", () => {
    const requests = [
      ...actionSource.matchAll(
        /\b(issueShareLink|shareLinkStatus|revokeShareLink)\(/g,
      ),
    ].map((match) => match[1]);

    expect(new Set(requests)).toEqual(
      new Set(["issueShareLink", "shareLinkStatus"]),
    );
    expect(actionSource).toMatch(
      /import \{[^}]*\} from "@\/persistence\/share-link-client"/,
    );
  });

  it("holds wa.me's address once, with the recipient taken from the shop's phone module and no digit typed", () => {
    const addresses = actionSource.match(/https?:\/\/[^"'`\s]+/g);

    expect(addresses).toEqual(["https://wa.me/${shopWhatsAppDigits()}?text="]);
    expect(actionSource).toMatch(
      /import \{ shopWhatsAppDigits \} from "@\/shop\/shop-phone"/,
    );
    expect(actionSource).not.toMatch(/\d{5,}/);
  });

  it("encodes the whole message as the one value after it", () => {
    expect(actionSource).toMatch(
      /`\$\{WHATSAPP_MESSAGE_ADDRESS\}\$\{encodeURIComponent\(message\)\}`/,
    );
  });

  it("draws the external anchor with a new tab and no opener and no referrer, and no other anchor", () => {
    const anchors = actionSource.match(/<a\b[\s\S]*?>/g) ?? [];

    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toContain('target="_blank"');
    expect(anchors[0]).toContain('rel="noopener noreferrer"');
  });

  it("writes nothing into the editor's store", () => {
    expect(actionSource).not.toMatch(
      /\buseConfiguratorStore\.(?:setState|getState)\b/,
    );
  });
});

describe("the files that draw the action", () => {
  it("are the confirmation's own: no other source file names it", () => {
    const namingFiles = sourceFilesUnder(SOURCE_ROOT)
      .filter((file) =>
        /SendOnWhatsapp|send-on-whatsapp/.test(readFileSync(file, "utf8")),
      )
      .map((file) => file.slice(SOURCE_ROOT.length + 1))
      .sort();

    expect(namingFiles).toEqual([
      "done/done-screen.tsx",
      "done/send-on-whatsapp.tsx",
    ]);
  });
});

describe("the WhatsApp action's stylesheet", () => {
  const stylesheet = readFileSync(
    join(SOURCE_ROOT, "done/done.module.css"),
    "utf8",
  );

  it("is at least 44 px, as a button and as the anchor, by one class", () => {
    expect(valuesFor(stylesheet, "whatsappAction", "min-height")).toEqual([
      "52px",
    ]);
  });
});
