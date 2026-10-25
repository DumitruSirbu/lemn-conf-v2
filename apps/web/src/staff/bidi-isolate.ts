// A string somebody typed, set inside a sentence of the page. The text around it must read as it was written whatever the
// value holds, so the value is first stripped of the characters that reorder or isolate (the set a preset's typed name is
// refused for: preset-name-rule.ts) and then fenced between isolate marks. Stripping comes first: a closing mark inside the
// value would otherwise end the fence early and let what follows it run out into the sentence. A value that stands in an
// element of its own is isolated by the stylesheet instead and needs none of this.

const FIRST_STRONG_ISOLATE = "\u2068";
const POP_DIRECTIONAL_ISOLATE = "\u2069";

/** The Arabic letter mark, the left-to-right and right-to-left marks, the embeddings and overrides, the isolates. */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

export function isolated(typed: string): string {
  const withoutControls = typed.replace(BIDI_CONTROLS, "");
  return `${FIRST_STRONG_ISOLATE}${withoutControls}${POP_DIRECTIONAL_ISOLATE}`;
}
