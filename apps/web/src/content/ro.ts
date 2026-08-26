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
    offerSize: (widthMm: number, heightMm: number) =>
      `${String(widthMm)} × ${String(heightMm)} mm`,
    currentBadge: "Actual",
    /** The one reason a row can be offered and still be unclickable: the scene has not mounted, so
     *  nothing can be measured yet. Shown on the row rather than after a tap, per §9. */
    probeUnavailable:
      "Modelul 3D se pregătește — poți alege în câteva momente.",
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
    /** M5 owns §5.4's boundary move. Until it lands the other chips are genuinely unsatisfiable,
     *  so they render blocked — and this note says so rather than describing a donor rule that no
     *  code implements yet. */
    widthNote:
      "Lățimea se schimbă mutând granița cu vecinul. Nu este încă disponibilă în această versiune.",
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
