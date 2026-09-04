/** Every customer-visible string on the screens this milestone ships. Kept in one module so the
 *  localisation system that arrives with the contact and review steps has a single place to take
 *  over from, rather than a scatter of literals inside components. */
/** Romanian counts nouns in three bands, decided by the count's **last two digits**: one, two to
 *  nineteen, and 0 or twenty upward, which takes "de" — so 100 is "100 de corpuri" while 101 is
 *  "101 corpuri". The catalogue never reaches twenty today; the rule is written out anyway, because
 *  the alternative is a count line that silently becomes ungrammatical the day it does. */
function pluraliseBodies(count: number): string {
  if (count === 1) return "corp";
  const lastTwoDigits = count % 100;
  const isPlainPlural = lastTwoDigits >= 1 && lastTwoDigits < 20;
  return isPlainPlural ? "corpuri" : "de corpuri";
}

/** Whose bodies a whole-kitchen setting applies to, as frames 2E / D2E say it — *"tuturor celor 14
 *  corpuri"*. The singular is a separate form because the drawn one is ungrammatical at one:
 *  *"tuturor celor 1 corp"* is not Romanian. Zero takes the drawn form and reads *"0 de corpuri"*,
 *  which is what `pluraliseBodies`' documented rule answers and is the truth about an empty
 *  kitchen. */
function everyBodyPhrase(bodyCount: number): string {
  if (bodyCount === 1) return "singurului corp din bucătărie";
  return `tuturor celor ${String(bodyCount)} ${pluraliseBodies(bodyCount)}`;
}

/** ADR 0001 decision 4's prefix, held as one binding so the whole-kitchen sheet's *de la* badge is
 *  the same two words as the figure's *De la* rather than a second spelling of them. */
const STARTING_PREFIX = "De la";

export const ro = {
  brand: "Lemnaria",
  configure: {
    step: "Pasul 2 din 4",
    back: "‹ Cameră",
    // Frame 2A's instruction copy, merged with the orbit hint it sat beside. One sentence for both
    // viewports on purpose: the mockups differ only in "Atinge" versus "Clic", and a copy fork is
    // still a fork (§10.1).
    orbitHint: "Atinge un corp pentru a-l edita · trage pentru a roti",
    cameraGroupLabel: "Vedere cameră",
    cameraPresets: {
      overview: "Vedere generală",
      wallA: "Perete A",
      wallB: "Perete B",
    },
    loading: "Se încarcă modelul 3D…",
  },
  /** §9's panel. Derived sentences are functions rather than strings so the whole of the panel's
   *  copy still lives in this one module: §9 requires the count line to be *derived* ("5 corpuri
   *  bază de 600"), never a literal, and putting that template in the panel model instead would
   *  split the Romanian across two files. */
  panel: {
    close: "Închide panoul",
    done: "Gata",
    remove: "Șterge corpul",
    /** §9 header line 1's second row: `Perete X · band · W × H mm`. */
    headerMeta: (
      wall: string,
      bandLabel: string,
      widthMm: number,
      heightMm: number,
    ) =>
      `Perete ${wall} · ${bandLabel} · ${String(widthMm)} × ${String(heightMm)} mm`,
    replaceTitleOccupied: "Înlocuiește",
    replaceTitleEmpty: "Pune un corp aici",
    /** The band as the count and zero-result sentences need it, keyed by the **normalised** band.
     *  §9's header uses the raw label instead, because "rând de sus" is the right thing to read in
     *  a header and the wrong thing to read mid-sentence ("5 corpuri rând de sus de 700"). */
    bandWords: {
      base: { one: "bază", many: "bază" },
      wall: { one: "suspendat", many: "suspendate" },
      column: { one: "coloană", many: "coloană" },
    },
    /** "5 corpuri bază de 600" — the occupied swap set, which is band-scoped and single-width. */
    countForBody: (count: number, bandWord: string, widthMm: number) =>
      `${String(count)} ${pluraliseBodies(count)} ${bandWord} de ${String(widthMm)}`,
    /** "10 corpuri intră în 700 × 860 mm" — a slot takes the catalogue filtered by fit. */
    countForSlot: (count: number, widthMm: number, heightMm: number) =>
      `${String(count)} ${pluraliseBodies(count)} intră în ${String(widthMm)} × ${String(heightMm)} mm`,
    /** §9: a zero-result list says what to clear, never a bare "0". */
    noOffersForBody: (bandWord: string) =>
      `Niciun alt corp ${bandWord} nu încape aici. Șterge corpul ca să eliberezi deschiderea și să vezi ce intră în ea.`,
    noOffersForSlot: (widthMm: number, heightMm: number) =>
      `Niciun corp din catalog nu intră în ${String(widthMm)} × ${String(heightMm)} mm. Șterge un corp vecin ca să lărgești deschiderea.`,
    /** **ADR 0037, and §9's zero-result rule inverted.** §9 says a zero-result list names what to
     *  clear; above §7's 800 mm ceiling that advice makes the problem worse, because clearing a
     *  neighbour widens the opening it was meant to close. The owner decided on 2026-08-28 that such
     *  a space may simply stay empty — *"ok to have empty space left"* — so the sentence says that
     *  instead of asking for an action that cannot work.
     *
     *  It states the ceiling as a number because "no cabinet fits" is not actionable on its own: the
     *  customer's one real move is to put a cabinet back and split the span, and knowing the widest
     *  one is 800 is what makes that a plan rather than a guess. */
    noOffersTooWide: (widthMm: number, maxWidthMm: number) =>
      `Deschiderea are ${String(widthMm)} mm, mai mult decât cel mai lat corp din catalog (${String(maxWidthMm)} mm). Niciun corp nu o umple singur, iar ștergerea unui vecin ar lărgi-o și mai mult. Spațiul poate rămâne gol, sau îl poți împărți punând la loc un corp lângă el.`,
    /** The same trap from the other side, and ADR 0035 decision 7 is what created it: a shrink
     *  vacates a strip, and until the next press absorbs it that strip is a selectable opening
     *  narrower than anything the catalogue is made at. Suppressing such openings was tried in this
     *  milestone and reverted — a horizontal floor on void emission also hides the 190–199 mm
     *  openings the bottle-cargo refusals are observed in — so the honest answer is a sentence
     *  saying the space may be left. "Șterge un corp vecin" is wrong here too: the neighbours are
     *  what the strip was taken from, and clearing one gives a *wider* opening rather than a usable
     *  one at this width.
     *
     *  *"pe măsură ce"* rather than *"când"* since 2026-09-01 (ADR 0043, review finding R2.3): while
     *  the only legal growth consumed the gap exactly, one press really did close it. A `+50` now
     *  leaves whatever is left over, so widening is a direction rather than a single press. */
    noOffersTooNarrow: (widthMm: number, minWidthMm: number) =>
      `Deschiderea are ${String(widthMm)} mm, mai puțin decât cel mai îngust corp din catalog (${String(minWidthMm)} mm). Spațiul poate rămâne gol; se închide pe măsură ce lărgești corpul de lângă el.`,
    offerSize: (widthMm: number, heightMm: number) =>
      `${String(widthMm)} × ${String(heightMm)} mm`,
    currentBadge: "Actual",
    /** The one reason a row can be offered and still be unclickable: the scene has not mounted, so
     *  nothing can be measured yet. Shown on the row rather than after a tap, per §9. */
    probeUnavailable:
      "Modelul 3D se pregătește — poți alege în câteva momente.",
    /**
     * The read-only statement, said **once** and at the top of the panel (M4 hand-off 3). It is not
     * an error and must not read like one: a cookie expires after 30 days (`WRITE_TOKEN_MAX_AGE_SECONDS`),
     * a cookie jar gets cleared, and a shared link is opened by someone who never held one — all
     * ordinary. So it states a fact rather than apologising for a failure.
     *
     * **One sentence, and no way back.** It used to add "modificările se pot face doar din browserul
     * în care a fost creată", which is true of the shared-link case and false of the other two: an
     * expired or cleared cookie leaves the creating browser read-only too, so that sentence sent the
     * customer to a machine that would refuse them identically. Confidently actionable and wrong is
     * worse than silent. ADR 0019 decision 8 plans an emailed edit link — that is M8, and until it
     * exists there is no route back to name.
     */
    readOnlyNotice:
      "Poți vedea această configurație, dar nu o poți modifica din acest browser.",
    /** The same fact on the control that carries it, so §13.1's "greyed and unclickable, with the
     *  reason" holds control by control: offer rows, finish swatches, handle chips and **Șterge
     *  corpul** all take this. Two words rather than the whole sentence: it repeats down a ten-row
     *  list, and the explanation is already stated once above it. */
    readOnlyReason: "Doar vizualizare",
    /**
     * The panel while `/d/{id}`'s write-access probe is still in flight (`canWrite: "checking"`).
     *
     * Nothing is wrong, so the tone is `info` and the sentence is a statement about a wait rather
     * than about a permission. It has to exist because the controls are disabled meanwhile: §13.1
     * asks for the reason beside every greyed control, and "Doar vizualizare" would be a claim the
     * page has not earned — the probe may be about to say this browser owns the design.
     */
    accessCheckingNotice:
      "Se verifică dacă poți modifica această configurație. Până atunci o poți doar vedea.",
    /** The same wait on the control that carries it, kept short for the reason `readOnlyReason` is
     *  two words: it repeats down a ten-row list under a sentence that already explains it. */
    accessCheckingReason: "Se verifică accesul",
    /**
     * **Wave S7, finding WEB-002.** The probe failed — a dropped request, a blocked API, an offline
     * browser — so nothing knows whether this browser may edit, and no further attempt is running.
     *
     * It reads as a fault (`error`) because one occurred, and it is the one notice with an action
     * attached: the failure is transient by nature, so the sentence's promise is that pressing
     * retry can genuinely change the answer. It must not say "you cannot edit this" — that is an
     * authorisation claim nothing here has evidence for, and it would be false for the design's own
     * author on a flaky connection. What it does say plainly is that an edit made now would not be
     * stored, because that is the loss the old optimistic behaviour delivered silently.
     */
    accessUncheckableNotice:
      "Nu am putut verifica dacă poți modifica această configurație. Până când verificarea reușește o poți doar vedea — o modificare făcută acum nu s-ar salva.",
    /** Not "Doar vizualizare": that states a permission, and this state is the absence of one. */
    accessUncheckableReason: "Acces neverificat",
    /** The action on `accessUncheckableNotice`. */
    accessRetryLabel: "Încearcă din nou",
    /**
     * **WEB-003.** The stored design moved on between this browser loading it and this browser
     * saving: another tab of the same customer saved over it, and the write was refused rather than
     * silently replacing that other edit — which is what used to happen, in whichever direction the
     * saves happened to land.
     *
     * It says what is true and nothing more. It does **not** say "someone else is editing": the two
     * writers hold the same cookie, so they are the same person on another tab or another device,
     * and naming an intruder would be both wrong and alarming. It does not blame the customer for a
     * mistake they did not make either.
     *
     * The tone is `error` because an edit is unsaved, and the sentence has to be honest about which
     * copy each choice keeps: reloading keeps the version that is stored and discards what is on
     * screen, overwriting keeps what is on screen and discards the other tab's. Neither is safe by
     * default, which is exactly why nothing is chosen automatically.
     */
    saveConflictNotice:
      "Această configurație a fost modificată în altă filă sau pe alt dispozitiv, așa că modificarea ta nu a fost salvată. Reîncarcă pentru a vedea versiunea salvată — se pierde ce ai schimbat aici — sau suprascrie cu ce vezi acum, iar cealaltă versiune se pierde.",
    /** Keep the stored design, discard this screen's edit. */
    saveConflictReloadLabel: "Reîncarcă versiunea salvată",
    /** Keep this screen's edit, write it over the stored design — after re-reading it, so a third
     *  writer that lands in between conflicts again rather than being discarded unseen. */
    saveConflictOverwriteLabel: "Suprascrie cu ce vezi acum",
    /**
     * Read-only reached the **other** way: the load believed this browser could write, the panel
     * rendered fully interactive, the customer edited — and the save came back 403.
     *
     * The `/d/{id}` route into this window was closed in wave S7 (finding WEB-002): the panel no
     * longer renders interactive on a `canWrite` nothing has answered. What remains reachable is a
     * credential that was present and is not accepted — expired between load and save, or forged —
     * which `hasWriteCredentialFor` can only discover by being asked. The edit is applied on screen
     * and will never be stored, and `readOnlyNotice` — written for a browser that was never offered
     * an edit at all — says nothing about it.
     *
     * So this one says it, in the same spirit as `saveStoppedNotice`: the loss is permanent, no
     * retry is coming, and the one action that helps is starting again where saving works.
     */
    readOnlyRefusedNotice:
      "Modificarea nu a fost salvată: acest browser nu poate modifica această configurație. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă dacă vrei să faci modificări pe care le poți salva.",
    /**
     * The **retryable** write failure (`saveStatus: "error"`), and only that one: the coalescer has
     * a retry armed and the unwritten state is queued behind it. So the sentence promises exactly
     * what that branch delivers — the edit is on screen, another attempt is coming, do not redo the
     * work.
     *
     * It must not offer a reload. A reload during a pending retry throws away the very state that
     * was about to be written, which is the opposite of what this branch needs. The terminal branch
     * has its own copy below; the two were one sentence and it was false on both.
     */
    saveFailedNotice:
      "Modificarea este aplicată pe ecran și încercăm în continuare să o salvăm. Nu o reface și nu reîncărca pagina: o reîncărcare acum ar șterge versiunea care așteaptă să fie salvată.",
    /**
     * The **terminal** non-credential failure (`saveStatus: "stopped"`): writing is over for this
     * design and nothing will resume it, so the state on screen is the only copy that exists.
     *
     * It says so plainly rather than offering a reload, because here a reload really would discard
     * the unsaved edit permanently and no retry would ever have written it. The one action that
     * helps is starting again in a fresh tab, where a new design is minted and saving works.
     */
    saveStoppedNotice:
      "Salvarea s-a oprit pentru această configurație și nu va reporni singură. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă și reia modificările acolo.",
    finishTitle: "Finisaj",
    finishLabels: {
      white: "Alb mat",
      oak: "Stejar",
      clay: "Lut",
      sage: "Salvie",
      graphite: "Grafit",
    },
    finishNote: "Doar combinațiile material + culoare validate apar aici.",
    handleTitle: "Mâner",
    handleLabels: {
      steel: "Bară inox",
      black: "Bară neagră",
      push: "Push-to-open",
    },
    /** §6.5: a body on the top module line ships push-to-open with its handles built and hidden,
     *  so the chip is marked without anything having been chosen. The note says why. */
    handleDefaultNote: (label: string) =>
      `Implicit pentru acest corp: ${label}.`,
    widthTitle: "Lățime",
    widthValue: (widthMm: number) => `${String(widthMm)} mm`,
    /** ADR 0035 decision 1's stepper labels. The `−` is U+2212 MINUS SIGN rather than a hyphen, so
     *  the two buttons are the same optical width and a screen reader reads "minus" rather than
     *  "hyphen". */
    widthStepLabels: { narrower: "−50 mm", wider: "+50 mm" },
    /** The buttons read `−50 mm` / `+50 mm`, which says the size of the step and not what it does to.
     *  The accessible name says both. */
    widthStepAriaLabels: {
      narrower: "Micșorează lățimea cu 50 mm",
      wider: "Mărește lățimea cu 50 mm",
    },
    /** §9's width note, **rewritten again in wave 5D2c** — it is the third version, and each
     *  rewrite has been for the same reason: it described a surface that had changed.
     *
     *  M4 shipped "nu este încă disponibilă în această versiune", which wave 5D made a lie the
     *  moment the chips became clickable. Wave 5D replaced it with ADR 0031's rule and the clause
     *  "Sub 300 mm nu se coboară" — true of most cabinetry and **false as a universal**: ADR 0026's
     *  bottle cargo goes to 200, ADR 0017's sink column floors at 560, and since wave 5D2b a hood
     *  floors its column at its own width. Three different floors, none of them 300 everywhere.
     *
     *  So this version states only what is true of every selection — the step, and where the space
     *  comes from — and leaves the floor to the disabled `−50`, which carries the engine's own
     *  sentence for the floor that actually applies to *this* column. That is ADR 0032's
     *  arrangement: the reason belongs on the control that refuses, not in a note above it. */
    widthStepNote:
      "Lățimea se schimbă din 50 în 50 mm, mutând granița coloanei în spațiul liber alăturat — întâi în dreapta, apoi în stânga. Când un buton este gri, sub el scrie de ce.",
    /** ADR 0035 decision 3's other control. **It says "coloana", not "corpul", and that is the fix for a sentence that was false on two of
     *  the three selections it renders on** (5D2c product-logic review B2). The three are `p1`,
     *  `p12` and `p18`, and only `p1` is the dishwasher niche — `p12` is an open shelf built 300-800
     *  and `p18` a wall cabinet built 200-800. Both were shown two chips under a sentence asserting
     *  *this body* is made only in those. Neither is; the constraint is `p1`'s niche, one level down
     *  the same column (ADR 0034: the chips are the column's).
     *
     *  The second sentence exists because ADR 0035 decision 6 squares the whole column up, so
     *  picking 450 here resizes the dishwasher too — which nothing said.
     *
     *  It says "doar în lățimile afișate" without naming a
     *  cause, because the cause is not always an appliance: `base-bottle-cargo` is cabinetry and is
     *  discrete for ADR 0026's own reason, that the proportion is the product. A note claiming an
     *  electrocasnic would be false on it. */
    widthChoiceNote:
      "Coloana asta se face doar în lățimile afișate, așa că alegi una dintre ele în loc să reglezi din 50 în 50 mm. Alegerea schimbă lățimea întregii coloane, nu doar a acestui corp.",
    /** §11 row 16 and §13.1: a corner return offers nothing at all, so no refusal is ever produced
     *  to carry the explanation. Without this the panel is a header, an empty body and "Gata", and
     *  the rule is satisfied by having deleted the question. Keyed by the reason the catalogue
     *  entry declares, so a second structural case adds copy rather than a branch. */
    structuralTitle: "Corp structural",
    structuralReasons: {
      corner:
        "Colțul ține legătura dintre cei doi pereți, așa că nu poate fi înlocuit, șters sau redimensionat. Alege un corp de lângă el.",
    },
  },
  /** The price surfaces: frames 2A / D2A's bar and frame 2C / D2C's unchanged label, plus
   *  ADR 0065 decision 7b's flagged total.
   *
   *  **Labels only — never an amount.** ADR 0062's third prohibition puts every figure, tier and
   *  delta in the price book, so a number appearing in this section would be copy that happens to
   *  agree with a price rather than a price rendered. */
  price: {
    /** [ADR 0001](../../../docs/decisions/0001-initial-product-and-stack.md) decision 4 and the
     *  mockups' presentation rule: every displayed figure is prefixed *De la* and rounded up to the
     *  thousand MDL. Frames 2A and D2A render it above the total; §9 item 7's footer does the same.
     *  The mockups set it in uppercase through `text-transform`, so the string itself is written as
     *  it reads. */
    startingPrefix: STARTING_PREFIX,
    /** While a refusal stands, the figure is labelled unchanged — on the price bar and in §9's
     *  footer alike. **Owner, 2026-09-03**, and it closes ADR 0024's third frame-2C requirement:
     *  the one M4 closed unmet because there was no total to leave unmoved.
     *
     *  **One string for both shells, and no separator.** Frames D2C and 2C spell it two ways —
     *  *"De la · neschimbat"* with a middle dot on desktop, *"De la, neschimbat"* with a comma on
     *  mobile. A wave may not reconcile ruled copy on its own, so wave 6C shipped both verbatim and
     *  raised the difference; the owner then ruled that the word stays and **neither punctuation
     *  mark does**. Both mockup spellings are superseded by this one.
     *
     *  It is a single constant deliberately: one ruled string stored twice is how two spellings
     *  come back. */
    startingPrefixUnchanged: "De la neschimbat",
    /** [ADR 0065](../../../docs/decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)
     *  decision 7b, owner 2026-09-03. **The owner's own phrasing: verbatim, punctuation included,
     *  and not to be tidied.**
     *
     *  **Unchanged by the re-ruling of the same day.** This string said *dulapuri* where the scene
     *  warning said *corpuri*; wave 6C raised the inconsistency rather than tidying it, and the
     *  owner chose *dulapuri* in both. So the **scene warning's** wording moved and this one did
     *  not. That warning is wave 6M's and is in no code yet — when it lands it reads
     *  *"Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap."*,
     *  and the superseded *corpuri* form is struck through in place at ADR 0065 decision 7b. */
    overflowingTotalWarning:
      "Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări",
  },
  /** Frames 2D / D2D's breakdown: *"De ce acest preț"*, the sheet on mobile and the popover on
   *  desktop.
   *
   *  **A section of its own, held to the same rules as `price` by the same single guard.** The
   *  split is organisation and nothing more: `starting-price.adversarial.test.ts` flattens both
   *  sections to their leaf strings and sweeps them together, so *"labels only, never an amount"*
   *  and *"no string claims the lines add up to the total"* mean here exactly what they mean there.
   *  The disclaimer and the note below are excluded from the sum sweep **by identity, as literals,
   *  at the guard** — they are the two ruled sentences containing a sum word, and each uses it to
   *  say the opposite of an equality claim: no sum here is final, every amount was rounded on its
   *  own. Re-word either and that guard goes red rather than inheriting its exception.
   *
   *  **Amounts are still absent here** (ADR 0062's third prohibition), including *"inclus"*, which
   *  names what a zero-amount tier costs the customer rather than stating a number. */
  priceBreakdown: {
    /** Frames 2D and D2D's heading, and frames 2A and D2A's control that opens it — **one string**,
     *  because the button and the sheet it opens name the same thing and a second copy is how two
     *  spellings come back (`startingPrefixUnchanged` records that lesson). The mockups draw a
     *  chevron beside the control; it is decoration and lives in the component, not here. */
    title: "De ce acest preț",
    /** Frame 2D, and the wave's own acceptance criterion: transport, worktop and appliances are
     *  excluded, and the final sum follows an on-site measurement.
     *
     *  **The worktop clause does double duty.**
     *  [ADR 0036](../../../docs/decisions/0036-a-declared-dimension-is-the-finished-cabinet.md)
     *  decision 3 makes the worktop an external part that influences *neither geometry nor price* —
     *  so this sentence is also why wave 6K's depth control adds no price line. Weakening it
     *  weakens that, in a place nobody would think to look.
     *
     *  **Frame D2D stops at *electrocasnice* and drops the measurement clause.** The fuller mobile
     *  sentence ships in both shells: the milestone's copy table rules this string by frame **2D**,
     *  and its acceptance criterion names the measurement clause outright. One string, two shells,
     *  as §10.1 requires of every other forked spelling. */
    disclaimer:
      "Preț de pornire, rotunjit în sus la mia de lei. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
    /** Frame 2D's footnote, and **the sentence that carries the non-summing rule**: every amount on
     *  this surface is rounded up on its own, so the lines a customer adds up do not reach the
     *  total beneath them. Wave 6C's criterion names this string as what carries it, and no surface
     *  may add an equality claim, a subtotal or a *total* row beside it. */
    note: "Toate sumele sunt prețuri de pornire, rotunjite în sus. Nu constituie ofertă comercială.",
    /** Frames 2D and D2D's own close action. The mobile sheet needs one (it covers the bar it was
     *  opened from); the desktop popover carries the same one rather than a second wording. */
    close: "Închide",
    /** *"Nișă mașină de spălat vase 600"* — one placement line, exactly as frame 2D draws every one
     *  of them: the body, then the width it is built at.
     *
     *  **Both halves come from the projection's entry and neither is derived here.** The name is
     *  `describeBodyLabelAt`'s answer ([ADR 0033](../../../docs/decisions/0033-door-count-is-derived-from-width-not-declared.md)),
     *  which is why a *Corp suspendat* reads *2 uși* at 600 and *1 ușă* at 300 on this surface, in
     *  §9's header and in the offer list alike; the width is the entry's `widthMm`. The mockup's own
     *  names predate that merge, so the shape is the frame's and the words are the catalogue's.
     *
     *  **Frame 2D's *"Etajeră deschisă 600 · stejar"* also names a finish.** The wave's criterion
     *  asks for the body and its width, and no decision rules how a per-cabinet finish reads on a
     *  price line — so it is left off rather than invented. */
    placementLabel: (bodyLabel: string, widthMm: number) =>
      `${bodyLabel} ${String(widthMm)}`,
    /** *"Perete A · bază"* — one group's heading. The wall letter and the band are **the
     *  projection's**, read off the group it produced; this composes the ruled words around them,
     *  exactly as `panel.headerMeta` composes §9's header line. */
    groupHeading: (wall: string, bandWord: string) =>
      `Perete ${wall} · ${bandWord}`,
    /** The band as a **group of bodies** reads in frames 2D and D2D — plural, and keyed by the
     *  normalised band because that is what the projection groups on.
     *
     *  Deliberately not `panel.bandWords`: those count bodies mid-sentence (*"5 corpuri bază de
     *  600"*) and read *coloană* where a heading over two of them reads *coloane*. Two grammatical
     *  roles, two sets of words, and merging them would make one of the two ungrammatical. */
    bandHeadings: { base: "bază", wall: "suspendate", column: "coloane" },
    /** *"Feronerie · Hettich"* — a whole-kitchen line. The tier's own name is **book data**
     *  (ADR 0062: a tier is data rendered, never copy that happens to agree with a number); only
     *  the category word in front of it is copy. */
    wholeKitchenLabel: (categoryWord: string, tierName: string) =>
      `${categoryWord} · ${tierName}`,
    /** Keyed by the price line's kind, so a third whole-kitchen rule added to the book arrives as a
     *  key here rather than as a branch in the component. */
    wholeKitchenCategories: { hardware: "Feronerie", material: "Material" },
    /** Frame 2E, and frame 2D's material row: a tier that costs nothing extra reads *inclus*, never
     *  `0`. A zero is a number a customer reads as a price; this says what it means. */
    included: "inclus",
  },
  /** Frames 2E / D2E: the whole-kitchen settings sheet on mobile, the popover under the chips on
   *  desktop.
   *
   *  **Labels only, and swept with `price` and `priceBreakdown` by the same guard**
   *  (`starting-price.adversarial.test.ts`), because this section carries a delta badge and is
   *  therefore price copy. ADR 0062's third prohibition in full: every tier's name, its one-line
   *  description and its delta are **book data rendered**, so nothing here names a tier, states an
   *  amount, or says what one costs.
   *
   *  **What is deliberately absent.** Frames 2E and D2E draw the material warning as *"Schimbarea
   *  materialului recalculează întreaga estimare **și poate limita unele finisaje per corp**"*. The
   *  second clause describes wave 6F's filter, which has not shipped, so it is **omitted rather
   *  than greyed out**: a warning about behaviour that does not exist is decoration, which is the
   *  defect M4's Finisaj section shipped and `docs/STATUS.md` records. It comes back with 6F, in
   *  the mockups' own words. */
  globalSettings: {
    /** The control that opens the sheet, standing beside the chips it controls. **One string for
     *  both shells**: frame D2E spells it *"Setări globale"* and frame 2E's strip spells it
     *  *"Schimbă global"*, and §10.1 admits no copy fork per viewport — `startingPrefixUnchanged`
     *  records what two spellings of one ruled string cost. The mockups draw a chevron beside it;
     *  that is decoration and lives in the component. */
    open: "Setări globale",
    /** Frames 2E and D2E's heading. Distinct from `open` on purpose: the control names the thing it
     *  opens, the sheet names what it is about, and both frames draw them differently. */
    title: "Setări pentru toată bucătăria",
    /** Frames 2E / D2E's second line, and the wave's first criterion: **how many bodies this applies
     *  to, and that it is not set per cabinet.** The count is `projectDesignForDisplay`'s — voids and
     *  empty columns are not bodies — and is derived rather than written, exactly as §9's count line
     *  is. */
    appliesTo: (bodyCount: number) =>
      `Se aplică ${everyBodyPhrase(bodyCount)}. Nu se setează pe fiecare corp în parte.`,
    /** The two section headings, in the frames' own words, keyed by the book's group.
     *
     *  Deliberately **not** `priceBreakdown.wholeKitchenCategories`, which those frames also use:
     *  there the word labels one line of a list (*"Material · PAL melaminat"*, and the chips beside
     *  the control below reuse exactly that composition); here it heads a column of choices and the
     *  frames spell the material one out as *"Material corp și fronturi"*. Two roles, two sets of
     *  words — the same split `priceBreakdown.bandHeadings` keeps from `panel.bandWords`. */
    groupHeadings: {
      material: "Material corp și fronturi",
      hardware: "Feronerie",
    },
    /** **What each group's deltas are measured against**, in words a customer can act on rather
     *  than in arithmetic.
     *
     *  The anchor is the book's **default** tier — the one a kitchen that chose nothing is priced at
     *  — and not what the design currently carries. Without this line the two are indistinguishable
     *  on screen, and they differ the moment a customer applies anything: having chosen veneer, they
     *  would read *inclus* against the melamine that would make their kitchen cheaper, and
     *  *de la +18 000* against the veneer they already own. Neither figure is wrong; nothing said
     *  what they were differences *from*.
     *
     *  One line per group rather than one for the sheet, because the anchor is per group and the two
     *  could later differ. **Named in the product's own words** — the tier that is included — never
     *  as the subtraction that produced it: *"diferența față de tariful standard"* is developer text
     *  wearing Romanian. */
    groupAnchors: {
      material: "Față de materialul inclus",
      hardware: "Față de feroneria inclusă",
    },
    /** *"de la +9 000"* against a tier that costs extra. The amount arrives already rounded and
     *  signed from `starting-price.ts`, the one site that formats a figure; these are the two words
     *  around it, and they are `startingPrefix`'s own so the badge and the total cannot come to
     *  spell them differently. A tier that adds nothing reads `priceBreakdown.included` instead —
     *  never `0`. */
    tierDelta: (addedAmount: string) =>
      `${STARTING_PREFIX.toLowerCase()} ${addedAmount}`,
    /** Frames 2E / D2E's note, less its 6F clause — see this section's own comment. */
    materialWarning: "Schimbarea materialului recalculează întreaga estimare.",
    /** Frame 2E's single action, and frame D2E's pair. Both shells carry both: this surface holds
     *  uncommitted state, so a customer who opened it must be able to leave without applying. */
    apply: "Aplică",
    cancel: "Renunță",
  },
  webglUnavailable: {
    titleMobile: "Dispozitivul acesta nu poate afișa 3D",
    titleDesktop: "Browserul acesta nu poate afișa 3D",
    bodyMobile:
      "Configurarea se face direct în model, așa că nu putem continua fără 3D. Deschide configuratorul pe alt telefon sau pe calculator — sau lasă-ne datele și îl configurăm împreună.",
    bodyDesktop:
      "Configurarea se face direct în model, așa că nu putem continua fără 3D. Încearcă alt browser sau activează accelerarea grafică — ori lasă-ne datele și îl configurăm împreună.",
    emailLink: "Trimite-mi linkul pe e-mail",
    contactLink: "Vreau să mă contactați",
    noFakePreview:
      "Nu afișăm o previzualizare statică falsă: fără 3D nu există configurare reală, deci nici preț.",
  },
  designLoadError: {
    title: "Nu am putut deschide acest link",
    bodyNotFound:
      "Linkul acesta nu mai corespunde niciunei configurații salvate. Poate a fost șters sau adresa este greșită.",
    bodyInvalid:
      "Configurația salvată la acest link nu poate fi citită. Ne pare rău pentru inconvenient.",
    startOver: "Pornește o configurare nouă",
  },
  contactPlaceholder: {
    title: "Formularul de contact urmează",
    body: "Pasul de contact nu este încă disponibil în această versiune a configuratorului.",
    back: "Înapoi la configurare",
  },
} as const;
