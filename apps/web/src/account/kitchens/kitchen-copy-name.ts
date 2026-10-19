import { KITCHEN_NAME_MAX_LENGTH } from "@lemnaria/configurator-domain";

// The name a duplicate is sent with. The server writes no sentence (ADR 0095), so the screen composes it from its
// catalogue: the source's displayed name inside the catalogue's own pattern ("{name} (copie)"). The server stores at most
// `KITCHEN_NAME_MAX_LENGTH` code points of the NFC form, and refuses a longer name instead of cutting it, so the source's
// name gives way to the pattern and not the other way round.

export interface CopyNameInput {
  /** The source's displayed name: the name the person gave it, or the one its facts generate. */
  readonly sourceName: string;
  /** The catalogue's pattern, applied to a name. Where the name stands in the sentence is the language's to say. */
  readonly composeCopyName: (name: string) => string;
}

/** The copy's name: the pattern around as much of the source's name as fits the server's limit. */
export function copyNameOf({
  sourceName,
  composeCopyName,
}: CopyNameInput): string {
  const patternLength = codePointCount(nfc(composeCopyName("")));
  const room = Math.max(0, KITCHEN_NAME_MAX_LENGTH - patternLength);
  const fitted = Array.from(nfc(sourceName)).slice(0, room).join("").trimEnd();
  return nfc(composeCopyName(fitted));
}

function nfc(text: string): string {
  return text.normalize("NFC");
}

/** Code points, as the server counts: a UTF-16 length would count an emoji or a rare letter twice. */
function codePointCount(text: string): number {
  return Array.from(text).length;
}
