// An id the app never writes in prose, for the sheet's "no id is drawn" checks. A dotted token (`material.veneer`, `pal.alb`)
// must start a word and be followed by an id's own characters, so a sentence that merely ends in the word "material." (the
// note's "Alege alt material.") is not one. `created-and-since-deleted` is the vanished tier the DOM files render;
// `ZZ-` is the prefix of the vanished ids the model's generated kitchens store (`ZZ-vanished-material`, `ZZ-vanished-hardware`),
// which have no dot, so only the prefix can catch them. No Romanian or Russian leaf contains it.
export const LEAKED_ID =
  /(^|[^\p{L}\p{N}_-])(pal|veneer|mdf|material|hardware)\.[a-z0-9]|created-and-since-deleted|ZZ-/u;
