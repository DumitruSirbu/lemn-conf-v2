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
     *  one at this width. */
    noOffersTooNarrow: (widthMm: number, minWidthMm: number) =>
      `Deschiderea are ${String(widthMm)} mm, mai puțin decât cel mai îngust corp din catalog (${String(minWidthMm)} mm). Spațiul poate rămâne gol; se închide când lărgești corpul de lângă el.`,
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
     * Read-only reached the **other** way: the load believed this browser could write, the panel
     * rendered fully interactive, the customer edited — and the save came back 403.
     *
     * That window is real and is not closed on purpose. `/d/{id}` cannot know about the write cookie
     * from its own request, so it hydrates `"unknown"` and the panel stays interactive until the
     * probe answers; disabling everything meanwhile would tell a design's own author they may not
     * edit their own kitchen. The cost is that an edit made inside the window is applied on screen
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
     *  bottle cargo goes to 200, ADR 0017's sink column floors at 600, and since wave 5D2b a hood
     *  floors its column at its own width. Three different floors, none of them 300 everywhere.
     *
     *  So this version states only what is true of every selection — the step, and where the space
     *  comes from — and leaves the floor to the disabled `−50`, which carries the engine's own
     *  sentence for the floor that actually applies to *this* column. That is ADR 0032's
     *  arrangement: the reason belongs on the control that refuses, not in a note above it. */
    widthStepNote:
      "Lățimea se schimbă din 50 în 50 mm, mutând granița coloanei în spațiul liber alăturat — întâi în dreapta, apoi în stânga. Când un buton este gri, sub el scrie de ce.",
    /** ADR 0035 decision 3's other control. It says "doar în lățimile de mai jos" without naming a
     *  cause, because the cause is not always an appliance: `base-bottle-cargo` is cabinetry and is
     *  discrete for ADR 0026's own reason, that the proportion is the product. A note claiming an
     *  electrocasnic would be false on it. */
    widthChoiceNote:
      "Acest corp se face doar în lățimile de mai jos, așa că alegi una dintre ele în loc să reglezi din 50 în 50 mm.",
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
