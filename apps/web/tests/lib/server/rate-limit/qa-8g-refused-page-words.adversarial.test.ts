// The refused page's words are written into markup as text: whatever a catalogue leaf holds, the sentence and
// the link's label can add no element, no attribute and no second link to the page.
import { describe, expect, it } from "vitest";

import { refusedPageHtml } from "@/lib/server/rate-limit/page-limit-page";

const MARKUP = `<script>alert(1)</script><a href="//example.com">x</a> & "quoted" 'single'`;

describe("the refused page, for words that hold markup", () => {
  it.each([
    ["the sentence", { sentence: MARKUP, retryLabel: "again" }],
    ["the link's label", { sentence: "wait", retryLabel: MARKUP }],
  ])(
    "writes %s as text and keeps its one empty link the only one",
    (_label, words) => {
      const html = refusedPageHtml({ locale: "ro", ...words });

      expect(html.match(/<a\b[^>]*>/g)).toEqual(['<a href="">']);
      expect(html).not.toContain("<script");
      expect(html).not.toContain('"quoted"');
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).toContain("&amp; &quot;quoted&quot; &#39;single&#39;");
    },
  );
});
