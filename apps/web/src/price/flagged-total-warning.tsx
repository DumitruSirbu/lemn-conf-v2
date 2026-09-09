"use client";

// ADR 0065 decision 6's flagged total, said on the scene rather than in the top bar.
//
// **Moved by the owner's ruling of 2026-09-09** (ADR 0104 decision 8b), over the alternative of
// letting the desktop bar grow on a flagged design. Frame D2A has no slot for this sentence — it was
// drawn before the product acquired it — so the frame could not answer, and the measurement is what
// forced the question: with `Verifică designul` and the settings pill in the same row, the sentence
// and the row did not both fit at 900 px at any rung.
//
// **What the move buys, and it is the point of the choice:** the header keeps frame D2A's shape at
// every width, flagged or not. There is no width at which a flagged design draws a different header
// from an unflagged one.
//
// **It renders `describePriceBar`'s own answer**, not a second rule. The flag travels with the total
// (decision 6) and the total's model is where it is decided; only the surface it is drawn on has
// changed. `ADR 0065`'s wording is untouched.
import { useContent } from "@/i18n/use-content";

import styles from "./flagged-total-warning.module.css";
import { describePriceBar } from "./price-bar-model";
import { usePricedDesign } from "./use-priced-design";

export function FlaggedTotalWarning() {
  const content = useContent();
  const pricing = usePricedDesign();
  const view = describePriceBar({ pricing, content });
  const warning = view.kind === "priced" ? view.overflowWarning : undefined;

  return (
    // Mounted whether or not there is anything in it, for the reason `PanelNoticeRow` and
    // `scene/overflow-warning.tsx` both give: many screen readers announce only *changes* to a
    // region already in the accessibility tree, so a region created at the same moment as its first
    // message is announced late or not at all — and this warning's arrival is what matters most.
    <div
      className={styles.region}
      role="status"
      data-testid="price-bar-flag-region"
    >
      {warning === undefined ? null : (
        <p className={styles.warning} data-testid="price-bar-overflow">
          {warning}
        </p>
      )}
    </div>
  );
}
