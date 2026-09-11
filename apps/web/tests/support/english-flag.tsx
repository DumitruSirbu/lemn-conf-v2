import type { ReactElement } from "react";

/** The clip that counterchanges the red diagonals. Fixed rather than generated: this flag is drawn
 *  once per render, in one menu, in one test. */
const COUNTERCHANGE_ID = "english-flag-counterchange";

/**
 * **The third flag the three-locale rehearsal has to fly, and the product decision it is standing in
 * for.**
 *
 * `locale-menu-scales.dom.test.ts` adds `en` where a real locale would be added, so `flagOf` must
 * answer for it — which is exactly the compile-time guard `src/i18n/locale-flags.tsx` exists to give.
 * The flag lives *here* rather than in that table because `AppLocale` does not contain `en`: nothing
 * in `routing.locales` ships English yet.
 *
 * **The United Kingdom's, chosen and flagged for the owner rather than settled.** English is the one
 * language on offer that is not tied to one country — Moldova's flag stands for Romanian because the
 * market is Moldova, and there is no equivalent argument between the Union Flag and the Stars and
 * Stripes. The Union Flag is the reading a Moldovan customer is likeliest to expect for *English* in
 * a European product, and it is what a real `en` should ship with unless the owner says otherwise.
 *
 * Drawn at the same 1:2 and the same 18 px width as Moldova's, with the saltire's counterchange kept
 * because it is the one thing a wrong Union Flag gets wrong.
 */
export function unitedKingdomFlag(): ReactElement {
  return (
    <svg width="18" height="9" viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id={COUNTERCHANGE_ID}>
        <path d="M30,15 h30 v15 z v-15 h-30 z h-30 v-15 z v15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 60,30 M60,0 0,30" stroke="#ffffff" strokeWidth="6" />
      <path
        d="M0,0 60,30 M60,0 0,30"
        clipPath={`url(#${COUNTERCHANGE_ID})`}
        stroke="#c8102e"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}
