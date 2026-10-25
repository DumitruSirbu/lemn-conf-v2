import {
  readTypedText,
  type TextRefusalCode,
} from "../contact/input-checks.js";

// The name a person gives a saved kitchen. It is typed text like every other field, so the reading is
// `readTypedText`'s: NFC, format characters removed, trimmed, no control character. A kitchen needs a name to
// be renamed to, so an empty one is refused.

/** Characters, as code points, in the stored NFC form. The `designs.name` column's length check repeats it. */
export const KITCHEN_NAME_MAX_LENGTH = 120;

export type KitchenNameRefusalCode = TextRefusalCode | "REQUIRED";

export type KitchenNameJudgement =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly code: KitchenNameRefusalCode };

/** On acceptance, `name` is the form that is stored and shown. */
export function judgeKitchenName(raw: unknown): KitchenNameJudgement {
  const reading = readTypedText(raw, KITCHEN_NAME_MAX_LENGTH);
  if (!reading.ok) return reading;
  if (reading.value === "") return { ok: false, code: "REQUIRED" };
  return { ok: true, name: reading.value };
}
