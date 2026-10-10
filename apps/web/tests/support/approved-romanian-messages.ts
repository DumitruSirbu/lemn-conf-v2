import { isDeepStrictEqual } from "node:util";

// Gate O1: the sole Romanian wording corpus: approved copy plus the drafted leaves it has to carry (grep `drafted`).
// The lock is a deep equality against `ro.json`, so a leaf missing here fails it. Carrying a leaf is not approval.
export const APPROVED_ROMANIAN_MESSAGES = {
  brand: "Lemnaria",
  meta: {
    title: "{brand} — configurator bucătărie",
    description: "Configurează-ți bucătăria direct în model.",
  },
  configure: {
    step: "Pasul {step, number} din {totalSteps, number}",
    stepPill: "{step, number}/{totalSteps, number}",
    title: "Configurare",
    locale: "RO",
    localeMenu: "Limba interfeței: română. Schimbă limba",
    back: "Cameră",
    orbitHint: "Atinge un dulap pentru a-l edita · trage pentru a roti",
    cameraGroupLabel: "Vedere cameră",
    cameraPresets: {
      overview: "Vedere generală",
      wallA: "Perete A",
      wallB: "Perete B",
      wallC: "Perete C",
    },
    loading: "Se încarcă modelul 3D…",
    overflowWarning:
      "Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.",
    backAction: "Înapoi",
    // Owner's wording for the confirmation both back links open.
    backConfirm: {
      title: "Modificările vor fi pierdute",
      body: "Dacă te întorci la pasul anterior, modificările efectuate vor fi pierdute. Ești sigur că dorești să reconfigurezi mărimea bucătăriei?",
      confirm: "Înapoi la cameră",
      stay: "Rămân aici",
    },
    reviewCta: "Verifică designul",
  },
  // Frame 1A's or 1B's wording as written, except `cornerQuestion` (the owner's) and `wallLabel.wallC` (drafted: no
  // frame draws a U's third wall).
  room: {
    title: "Cameră",
    shapeQuestion: "Ce formă are camera?",
    shapeLead: "Alege conturul pereților pe care va sta bucătăria.",
    shapes: {
      linear: {
        name: "Liniară",
        detail: "Un singur perete",
        short: "Liniară",
      },
      L: {
        name: "În formă de L",
        detail: "Doi pereți, un colț",
        short: "În L",
      },
      U: {
        name: "În formă de U",
        detail: "Trei pereți",
        short: "În U",
      },
    },
    dimensionsLater: "Dimensiunile se cer după ce alegi forma.",
    planCaption: "Plan de sus · previzualizare",
    // Whole millimetres, the unit the fields take: a departure from frame 1B's *"A · 3,60 m"* (ADR 0126).
    planWallLabel: "{wall} · {millimetres, number, ::group-off} mm",
    // The owner's wording, a departure from frame 1B's *"Încotro merge cotul?"*.
    cornerQuestion: "În care parte se află colțul bucătăriei?",
    cornerHint: "nu se deduce din lățimi",
    cornerLeft: "La stânga",
    cornerRight: "La dreapta",
    wallLabel: {
      wallA: "Perete A",
      wallB: "Perete B",
      wallC: "Perete C",
    },
    // Drafted, not frame wording: frame 1B draws neither a hint nor a help control. The number is the run the customer
    // wants furnished, not the wall (ADR 0120 Amendments C1 and D1). In a room with a corner the length is measured
    // from it, corner cabinet included, so walls B and C say so and wall A says it in `cornerText`.
    lengthsHint: "Introdu lungimea dulapurilor dorite, nu lungimea peretelui.",
    lengthHelp: {
      wallA: {
        name: "Ce lungime introduc la Perete A?",
        text: "Lungimea pe care vrei să o ocupe dulapurile pe peretele A. Poate fi mai mică decât peretele, dacă vrei dulapuri doar pe o parte din el.",
        cornerText:
          "Lungimea pe care vrei să o ocupe dulapurile pe peretele A, măsurată de la colț (inclusiv dulapul de colț). Poate fi mai mică decât peretele, dacă vrei dulapuri doar pe o parte din el.",
      },
      wallB: {
        name: "Ce lungime introduc la Perete B?",
        text: "Lungimea pe care vrei să o ocupe dulapurile pe peretele B, măsurată de la colț (inclusiv dulapul de colț). Poate fi mai mică decât peretele, dacă vrei dulapuri doar pe o parte din el.",
      },
      wallC: {
        name: "Ce lungime introduc la Perete C?",
        text: "Lungimea pe care vrei să o ocupe dulapurile pe peretele C, măsurată de la colț (inclusiv dulapul de colț). Poate fi mai mică decât peretele, dacă vrei dulapuri doar pe o parte din el.",
      },
    },
    heightLabel: "Înălțimea camerei",
    // The box's suffix: the fields take whole millimetres, where frame 1B draws *m* (ADR 0126).
    unitMillimetres: "mm",
    back: "Înapoi",
    continue: "Continuă",
    // Sub-state 1C, owner-approved (the Russian in `ru.json` likewise). Departs from frame 1C: *"Acest perete"* is the
    // noun ADR 0120 Amendment C1 rules false, and the *"alege o formă liniară"* clause survives as `orChooseLinear`.
    // No leaf carries a digit, a unit or a bound (ADR 0120 decision 3); `unreadable` spells the unit out, never
    // abbreviating it (ADR 0126).
    issue: {
      wallTooShort:
        "Lungimea aceasta e mai mică decât putem mobila. Mărește valoarea.",
      wallTooLong:
        "Lungimea aceasta e mai mare decât putem mobila. Introdu doar porțiunea pe care vrei dulapuri.",
      heightTooLow:
        "La înălțimea aceasta nu încap dulapurile de sus. Verifică valoarea.",
      heightTooHigh:
        "Înălțimea aceasta e mai mare decât putem construi. Verifică valoarea.",
      roomTooSmall:
        "Cu lungimile acestea, după dulapul de colț nu mai rămâne loc pentru chiuvetă și plită. Mărește una dintre lungimi.",
      shapeNotBuildable:
        "Pentru forma aceasta nu putem propune încă o bucătărie. Alege altă formă.",
      orChooseLinear: "Sau alege o formă liniară.",
      unreadable: "Scrie valoarea în milimetri, doar cu cifre.",
    },
    // Frame 1C's plan label, *"B prea scurt"*; `tooLong` mirrors it.
    planWallIssue: {
      tooShort: "{wall} prea scurt",
      tooLong: "{wall} prea lung",
    },
    presetsAfterValid: "Presetele apar după ce toate valorile sunt valide.",
    // D1C's *Sugestii* card, as written (`Desktop.dc.html:248, 250`); its action is the *Liniară* chip's own handler.
    suggestion: {
      title: "Sugestii",
      switchToLinear: "Treci la formă liniară pe peretele A",
    },
    // Frame 1F's wording as written, with drafted leaves: `role.preparation` (no frame draws the worktop priority),
    // `rowLabel` (the separator belongs to the locale) and `failed` (says the composition did not complete, nothing
    // about the room; a room-level reason is 1C's sentence).
    // Owner ruling, verbatim: *"instead of așezat => inclus, related to 'nu încape' => nu poate fi inclus and to be
    // mentioned that walls size didnt provide enough space to fit all cabinets"* (ADR 0110 Amendment F). So
    // `status.placed`, `status.notPlaced`, `rule` and `dropped` follow it.
    // `stepsLabel`: owner wording *"not Ce includem but Ce este inclus"*; keep the passive *inclus* voice it
    // shares with `status.placed`. `noPresetNotice` keeps *nu încape*: its subject is a preset fitting the room,
    // not a cabinet.
    // Frame 1F's last sentence (*"Pragurile exacte sunt decizie de produs nefinalizată"*) is deliberately absent: it
    // announces a product decision since taken.
    compose: {
      title: "Preset",
      heading: "Ți-o construim pe a ta",
      roomSummary:
        "{shape} · {wallA, number, ::group-off} × {wallB, number, ::group-off} mm · h {height, number, ::group-off} mm",
      // Drafted, not approved: no frame draws a straight kitchen's 1F summary; `roomSummary`'s shape without the
      // wall B clause, the field `requiredFieldsFor("linear")` names.
      roomSummaryLinear:
        "{shape} · {wallA, number, ::group-off} mm · h {height, number, ::group-off} mm",
      // Drafted, not approved: `roomSummary`'s shape with a third length for the walls `wallsOf("U")` names. Only
      // numbers and separators, so the Russian is the same sentence with `мм`.
      roomSummaryU:
        "{shape} · {wallA, number, ::group-off} × {wallB, number, ::group-off} × {wallC, number, ::group-off} mm · h {height, number, ::group-off} mm",
      noPresetNotice:
        "Niciun preset gata făcut nu încape aici. Compunem una pe măsura camerei tale — durează puțin mai mult.",
      stepsLabel: "Ce este inclus, în ordinea priorității",
      role: {
        fridge: "Frigider",
        sink: "Chiuvetă",
        preparation: "Blat de lucru",
        hob: "Plită și cuptor",
        storage: "Depozitare",
      },
      // The sixth 1F row. Owner-approved wording, chosen over the short form (the Russian in `ru.json` likewise); a
      // departure from the mockup's five rows. No sentence explains *nu poate fi inclus*: the domain publishes no
      // reason (ADR 0113 decision 5).
      dishwasher: "Nișă mașină de spălat vase",
      rowLabel: "{role} · {extent}",
      rowWidth: "{millimetres, number, ::group-off}",
      storageExtent: "restul peretelui",
      status: {
        pending: "se calculează",
        placed: "inclus",
        notPlaced: "nu poate fi inclus",
      },
      rule: "Regula: pe pereți scurți păstrăm întâi chiuveta și gătitul, apoi depozitarea; ce nu poate fi inclus este scos și marcat, nu înghesuit.",
      busy: "Se compune…",
      dropped:
        "Dimensiunile pereților nu au lăsat destul spațiu pentru toate dulapurile, așa că nu am putut include: {roles}. Restul bucătăriei e compus pe măsura camerei tale.",
      failed:
        "Compunerea nu s-a putut finaliza. Întoarce-te la dimensiuni și încearcă din nou.",
      // Drafted, not approved: no frame draws a hand-off. `saveFailed` differs from `failed`: that one has no kitchen
      // behind it and sends the customer back to the dimensions, this one has the kitchen drawn and offers `retry`.
      saveFailed:
        "Bucătăria e gata, dar nu am putut-o deschide. Încearcă din nou.",
      // Drafted, not approved: the day's limit on new designs is reached. It says the limit returns tomorrow, names no
      // count and no address, and offers no retry, since the kitchen is composed and the room stays on screen.
      limitReached:
        "Astăzi nu se mai pot crea alte bucătării. Limita revine mâine, iar camera ta rămâne aici.",
      retry: "Încearcă din nou",
    },
  },
  panel: {
    close: "Închide panoul",
    done: "Gata",
    remove: "Elimină dulapul",
    headerMeta:
      "Perete {wall} · {bandLabel} · {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm",
    replaceTitleOccupied: "Înlocuiește",
    replaceTitleEmpty: "Adaugă aici un dulap",
    bandWords: {
      base: {
        one: "bază",
        many: "baze",
      },
      wall: {
        one: "suspendat",
        many: "suspendate",
      },
      column: {
        one: "coloană",
        many: "coloane",
      },
    },
    countForBody:
      "{count, plural, one {# dulap} few {# dulapuri} other {# dulapuri}} {bandWord} de {widthMm, number, ::group-off}",
    countForSlot:
      "{count, plural, one {# dulap} few {# dulapuri} other {# dulapuri}} intră în {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm",
    noOffersForBody:
      "Niciun alt dulap {bandWord} nu încape aici. Șterge dulapul actual, pentru a obține mai mult spațiu.",
    noOffersForSlot:
      "Niciun dulap din catalog nu intră în {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm. Șterge un dulap vecin ca să obții mai mult spațiu.",
    noOffersTooWide:
      "Spațiul liber are {widthMm, number, ::group-off} mm, mai mult decât cel mai lat dulap din catalog ({maxWidthMm, number, ::group-off} mm). Niciun dulap nu poate ocupa tot spațiul liber existent. O parte din spațiul liber poate rămâne goală, sau îl poți împărți adăugând un alt dulap lângă el.",
    noOffersTooNarrow:
      "Spațiul liber are {widthMm, number, ::group-off} mm, mai puțin decât cel mai îngust dulap din catalog ({minWidthMm, number, ::group-off} mm). Spațiul poate rămâne gol; se închide pe măsură ce lărgești dulapul de lângă el.",
    offerSize:
      "{widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm",
    currentBadge: "Actual",
    probeUnavailable:
      "Modelul 3D se pregătește — poți alege în câteva momente.",
    readOnlyNotice:
      "Poți vedea această configurație, dar nu o poți modifica din acest browser.",
    readOnlyReason: "Doar vizualizare",
    accessCheckingNotice:
      "Se verifică dacă poți modifica această configurație. Până atunci o poți doar vedea.",
    accessCheckingReason: "Se verifică accesul",
    accessUncheckableNotice:
      "Nu am reușit să verific dacă poți modifică această configurație. Până când verificarea reușește o poți doar vizualiza — o modificare făcută acum nu s-ar salva.",
    accessUncheckableReason: "Acces neverificat",
    accessRetryLabel: "Încearcă din nou",
    saveConflictNotice:
      "Această configurație a fost modificată în altă filă sau pe alt dispozitiv, așa că modificarea ta nu a fost salvată. Reîncarcă pentru a vedea versiunea salvată — se pierde ce ai schimbat aici — sau înlocuiește cu ce vezi acum, iar cealaltă versiune se pierde.",
    saveConflictReloadLabel: "Reîncarcă versiunea salvată",
    saveConflictOverwriteLabel: "Înlocuiește cu ce vezi acum",
    readOnlyRefusedNotice:
      "Modificarea nu a fost salvată: acest browser nu poate modifica această configurație. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă dacă vrei să faci modificări pe care le poți salva.",
    saveFailedNotice:
      "Modificarea este aplicată pe ecran și încercăm în continuare să o salvăm. Nu o schimba și nu reîncărca pagina: o reîncărcare acum ar șterge versiunea care așteaptă să fie salvată.",
    saveStoppedNotice:
      "Salvarea s-a oprit pentru această configurație și nu va reporni singură. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă și reia modificările acolo.",
    finishTitle: "Finisaje",
    finishApproximationNote:
      "Culoarea de pe ecran și cea din vizualizare sunt orientative — nuanța finală se alege pe mostra fizică.",
    finishPickerLabel: "Alege culoarea",
    handleTitle: "Mâner",
    handleLabels: {
      steel: "Bară inox",
      black: "Bară neagră",
      push: "Push-to-open",
    },
    handleDefaultNote: "Implicit pentru acest dulap: {label}.",
    widthTitle: "Lățime",
    widthValue: "{widthMm, number, ::group-off} mm",
    widthStepLabels: {
      narrower: "−50 mm",
      wider: "+50 mm",
    },
    widthStepAriaLabels: {
      narrower: "Micșorează lățimea cu 50 mm",
      wider: "Mărește lățimea cu 50 mm",
    },
    widthStepNote:
      "Lățimea se schimbă din 50 în 50 mm, mutând latura dulapului din contul spațiului liber alăturat — întâi spre dreapta, apoi spre stânga. Când un buton este gri, sub el scrie de ce.",
    // The mirrored sentence for a right-hand room, otherwise word for word.
    widthStepNoteRight:
      "Lățimea se schimbă din 50 în 50 mm, mutând latura dulapului din contul spațiului liber alăturat — întâi spre stânga, apoi spre dreapta. Când un buton este gri, sub el scrie de ce.",
    widthChoiceNote:
      "Coloana e formată din lățimile afișate, așa că alegi una dintre ele în loc să reglezi din 50 în 50 mm. Alegerea schimbă lățimea întregii coloane, nu doar a acestui dulap.",
    structuralTitle: "Dulap structural",
    structuralReasons: {
      corner:
        "Dulapul din colț nu poate fi înlocuit, șters sau redimensionat. Alege un dulap de lângă el.",
    },
    finishFollowsKitchen: "Preia culoarea bucătăriei",
  },
  price: {
    startingPrefix: "De la",
    amountWithCurrency: "{amount} MDL",
    overflowingTotalWarning:
      "Prețul include și dulapurile ce depășesc mărimea peretelui și necesită ajustări",
    emptyKitchenPrompt:
      "Pentru a afișa un preț estimativ adaugă-ți cel puțin un dulap din catalog",
  },
  priceBreakdown: {
    title: "De ce acest preț?",
    disclaimer:
      "Prețul afișat este estimativ. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
    note: "Pretul afișat este estimativ. Nu reprezintă o ofertă comercială finală. Oferta comercială finală se stabilește doar după măsurarile exacte.",
    close: "Închide",
    placementLabel: "{bodyLabel} {widthMm, number, ::group-off}",
    groupHeading: "Perete {wall} · {bandWord}",
    bandHeadings: {
      base: "bază",
      wall: "suspendate",
      column: "coloane",
    },
    wholeKitchenLabel: "{categoryWord} · {tierName}",
    wholeKitchenCategories: {
      accessory: "Accesorii",
      hardware: "Feronerie",
      material: "Material",
    },
    included: "inclus",
    notIncluded: "nu este inclus",
  },
  // Frames 3A and 3B as written; the room line gives millimetres where the frame draws metres (ADR 0126).
  review: {
    title: "Verifică designul",
    roundedUpNote: "Preț de pornire, rotunjit în sus.",
    bodyCount:
      "{bodyCount, plural, one {# dulap} few {# dulapuri} other {# dulapuri}}",
    roomLine: {
      linear: "{shape} · {wallA, number, ::group-off} mm · {bodies}",
      L: "{shape} · {wallA, number, ::group-off} × {wallB, number, ::group-off} mm · {corner} · {bodies}",
      U: "{shape} · {wallA, number, ::group-off} × {wallB, number, ::group-off} × {wallC, number, ::group-off} mm · {bodies}",
      cornerLeft: "cot la stânga",
      cornerRight: "cot la dreapta",
    },
    refusalReasons: {
      PRICING_FAILED:
        "Nu am putut calcula prețul acestei bucătării, așa că oferta nu poate fi cerută acum.",
      NO_CABINET:
        "Adaugă cel puțin un dulap în bucătărie înainte să ceri oferta.",
      BODIES_PAST_WALL:
        "Unele dulapuri depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap înainte să ceri oferta.",
    },
  },
  reviewScreen: {
    callToAction: "Cere oferta",
    editGroup: "Editează",
    changeSettings: "Schimbă",
    view3d: "Vezi în 3D",
    saving:
      "Se salvează modificările tale. Poți cere oferta imediat ce salvarea se termină.",
    conflict:
      "Bucătăria a fost modificată în altă filă sau pe alt dispozitiv, așa că modificarea ta nu a fost salvată. Alege în editor ce versiune păstrezi, apoi cere oferta.",
    openEditor: "Deschide editorul",
    topBarTitle: "Verificare",
  },
  globalSettings: {
    open: "Setări globale",
    title: "Setări pentru toată bucătăria",
    appliesTo:
      "Se aplică {bodyCount, plural, one {singurului dulap din bucătărie} few {tuturor celor # dulapuri} other {tuturor celor # dulapuri}}. Nu se setează pentru fiecare dulap în parte.",
    groupHeadings: {
      material: "Materialul dulapului și al fronturilor",
      hardware: "Feronerie",
    },
    groupAnchors: {
      material: "Față de materialul inclus",
      hardware: "Față de feroneria inclusă",
    },
    tierDelta: "de la {addedAmount}",
    materialWarning: "Schimbarea materialului recalculează întreaga estimare.",
    depthHeading: "Adâncimea dulapurilor",
    depthOption: "{cabinetDepthMm, number, ::group-off} mm",
    depthWarning:
      "Schimbarea adâncimii blatului reconstruiește toate dulapurile și schimbă prețul acestora.",
    depthNote:
      "Adâncimea blatului nu schimbă prețul bucătăriei — doar dimensiunile dulapurilor.",
    colourHeading: "Culoarea bucătăriei",
    colourNote:
      "Culoarea nu schimbă prețul bucătăriei. Dulapurile cu o culoare individuală la modificarea culorii pentru întreagă bucătărie își păstrează culoarea.",
    colourWarning:
      "Fiecare material are propriile culori, așa că la schimbarea materialului culoarea bucătăriei preia culoarea implicită a materialului nou.",
    apply: "Aplică",
    cancel: "Renunță",
    materialResetConfirm: {
      title: "Culorile alese se vor pierde",
      body: "Ai ales alte culori pentru {chosenCount, plural, one {# dulap} few {# dulapuri} other {# dulapuri}}. Fiecare material are propriile culori disponibile, iar la modificarea lui e setată culoarea implicită a materialului nou.",
      globalBody:
        "Ai ales o culoare pentru toată bucătăria. Fiecare material are propriile culori disponibile, iar la modificarea lui e setată culoarea implicită a materialului nou.",
      confirm: "Schimbă materialul",
      back: "Păstrează culorile",
    },
    applyRefused:
      "Nu am putut aplica „{settingName}”: {reason} Nimic nu a fost schimbat.",
    pillMaterial: "{tierName}",
    pillColourValue: "{colourValue}",
    pillHardware: "{categoryWord} {tierName}",
    pillDepth: "Adâncime {cabinetDepthMm, number, ::group-off}",
    pillNameAllSettings: "{openLabel}: {settings}",
    pillNameJoin: ", ",
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
      "Linkul acesta nu mai corespunde niciunei configurații salvate. Posibil că a fost ștearsă sau linkul este invalid.",
    bodyInvalid:
      "Linkul acesta nu poate întoarce nici o configurare validă. Ne pare rău.",
    // Drafted, approved as drafted (ADR 0113); the owner may reword later.
    bodyUnavailable:
      "Această configurație nu este disponibilă în acest browser. Se deschide doar în browserul în care a fost creată.",
    startOver: "Începe o configurare nouă",
    // Drafted, not approved: the sentence of the page a refused read is answered with, on any page the interceptor
    // counts. It names no count and no address, and tells the customer to try again soon.
    tooManyRequests:
      "Prea multe cereri într-un timp scurt. Încearcă din nou peste puțin timp.",
    // Drafted, not approved: the label of the one link on that page, the same words as the share control's own.
    tryAgain: "Încearcă din nou",
  },
  // Drafted, approved as drafted (ADR 0113); the owner may reword later.
  share: {
    title: "Link de vizualizare",
    description:
      "Oricine are linkul poate vedea designul, dar nu îl poate modifica.",
    create: "Creează link",
    reissue: "Creează un link nou",
    active: "Un link de vizualizare este activ.",
    reissueWarning: "Linkul vechi nu va mai funcționa.",
    shownOnce: "Copiază linkul acum — nu îl vom mai putea afișa.",
    copy: "Copiază",
    copied: "Copiat",
    revoke: "Dezactivează linkul",
    revoked: "Linkul a fost dezactivat.",
    error: "Nu am putut actualiza linkul. Încearcă din nou.",
    // No other approved label to borrow for the retry after a failed status read, so it has its own.
    retry: "Încearcă din nou",
  },
  contactPlaceholder: {
    title: "Formularul de contact urmează",
    body: "Pagina de contact nu este încă disponibilă în această versiune a configuratorului.",
    back: "Înapoi la configurare",
  },
  // Drafted, not approved: the shop's notice, whose language is the owner's to rule (Q34).
  leadNotice: {
    subject: "Cerere din configurator {reference}",
    line: "{label}: {value}",
    figure: "{label} {amount}",
    labels: {
      reference: "Referință",
      locale: "Limba clientului",
      name: "Nume",
      phone: "Telefon",
      locality: "Localitate",
      channel: "Canal preferat",
      email: "E-mail",
      room: "Cameră",
      price: "Preț",
    },
    channels: {
      phone: "Apel telefonic",
      whatsapp: "WhatsApp",
      email: "E-mail",
    },
    callbackLine: "Cerere de apel, fără bucătărie configurată.",
    emptyValue: "—",
  },
  band: {
    base: "bază",
    wall: "suspendat",
    top: "rând de sus",
    column: "coloană",
  },
  finish: {
    pal: {
      alb: "Alb",
      "stejar-bardolino": "Stejar Bardolino Natur",
      "stejar-halifax": "Stejar Halifax Natur",
      antracit: "Antracit",
      "gri-havanna": "Gri Havanna",
      "nuc-warmia": "Nuc Warmia Maro",
    },
    veneer: {
      stejar: "Stejar",
      nuc: "Nuc",
    },
  },
  // Relocated byte for byte from `sample-price-book.ts` (ADR 0106): owner-authored, locked at the wording it shipped
  // with, so a reword is an unapproved change. The two brand tiers name no `name` leaf on purpose: *Hettich* and
  // *Blum* render from the book's own field in every locale.
  priceBook: {
    hardware: {
      standard: {
        name: "Standard",
        description: "Balamale și glisiere fără amortizare, închidere simplă.",
      },
      "soft-close": {
        description: "Balamale și glisiere cu amortizare, de la Hettich.",
      },
      premium: {
        description: "Balamale și glisiere cu amortizare, de la Blum.",
      },
    },
    material: {
      melamine: {
        name: "PAL melaminat",
        description: "Materialul standard al bucătăriei.",
      },
      "painted-mdf": {
        name: "MDF vopsit mat",
        description: "Fronturi din MDF vopsit mat, pentru toată bucătăria.",
      },
      veneer: {
        name: "Furnir natural",
        description: "Fronturi furniruite natural, pentru toată bucătăria.",
      },
    },
    accessory: {
      "sink-protective-cover": {
        name: "Protecție de aluminiu pentru dulapul chiuvetei",
        description:
          "Montată în dulapul chiuvetei, împotriva umidității și a scurgerilor.",
      },
      "dish-drying-rack": {
        name: "Uscător de vase",
        description: "Montat în dulapul suspendat deasupra chiuvetei.",
      },
    },
  },
  catalog: {
    emptySlot: "Spațiu liber",
    unknownKind: "Dulap",
    bodyLabelWithDoors:
      "{name} {doors, plural, one {# ușă} few {# uși} other {# uși}}",
    kinds: {
      base_cabinet: "Dulap bază",
      dishwasher_housing: "Nișă mașină de spălat vase",
      induction_cooktop: "Plită cu inducție",
      tall_unit: "Coloană",
      fridge_housing: "Nișă frigider integrat",
      fridge_freestanding: "Frigider",
      wall_cabinet: "Dulap suspendat",
      open_shelf_unit: "Etajeră deschisă",
      extractor_hood: "Hotă",
      corner_base_x: "Dulap bază de colț",
      corner_base_return: "Racord bază de colț",
      corner_wall_return: "Dulap suspendat de colț",
      corner_wall_return_top: "Dulap de colț {rowWord}",
    },
    entries: {
      "base-cabinet": "Dulap bază",
      "base-3drawer": "Dulap bază 3 sertare",
      "base-panbank": "Sertare pentru oale",
      "base-hob-2drawer": "Dulap plită și 2 sertare",
      "base-hob-oven": "Dulap plită și cuptor",
      "base-bottle-cargo": "Cargo îngust pentru sticle",
      "base-sink": "Dulap pentru chiuvetă",
      "base-dishwasher": "Nișă mașină de spălat vase",
      "wall-cabinet": "Dulap suspendat",
      "wall-lift": "Dulap suspendat rabatabil",
      "open-shelf": "Etajeră deschisă",
      hood: "Hotă",
      "tall-pantry": "Coloană cămară",
      "tall-oven-tower": "Coloană cuptor + microunde",
      "tall-fridge-housing": "Nișă frigider integrat",
      "fridge-free": "Frigider, liber",
    },
  },
  rejection: {
    VOID_SELECTED: "Aici nu se află niciun dulap.",
    TARGET_NOT_FOUND:
      "Selecția nu mai există. Alege din nou un dulap sau un spațiu liber.",
    INVALID_OCCURRED_AT:
      "Momentul modificării nu este valid, așa că nu am salvat nimic.",
    BODY_PROBE_UNAVAILABLE:
      "Modelul 3D nu este încă pregătit, așa că nu pot adăuga un dulap. Încearcă din nou în câteva momente.",
    ACCESSORY_NOT_DELETABLE:
      "„{label}” face parte din dulapul de sub ea și nu poate fi ștearsă separat.",
    NOT_DELETABLE:
      "„{label}” face parte din structura bucătăriei și nu poate fi șters.",
    NOT_IN_LIBRARY: "Dulapul acesta nu există în catalog.",
    NOT_INSERTABLE:
      "„{label}” face parte din configurația inițială și nu poate fi adăugat din catalog.",
    TARGET_NOT_REPLACEABLE:
      "„{label}” face parte din structura bucătăriei și nu poate fi înlocuit.",
    BAND_MISMATCH:
      "{slotBand, select, base {„{label}” este un dulap suspendat: nu are soclu și nici blat, deci nu poate sta pe podea.} other {„{label}” este un dulap de bază și nu poate fi montat pe perete. Doar coloanele pot depăși un nivel.}}",
    WIDTH_TOO_LARGE:
      "„{label}” are {requiredMm, number, ::group-off} mm lățime, iar spațiul liber are doar {availableMm, number, ::group-off} mm.",
    WIDTH_TOO_SMALL:
      "„{label}” are nevoie de cel puțin {requiredMm, number, ::group-off} mm lățime, iar spațiul liber are doar {availableMm, number, ::group-off} mm.",
    WIDTH_TOO_SMALL_UNKNOWN_FLOOR:
      "„{label}” nu poate fi adăugat: lățimea minimă din catalog nu este o valoare validă.",
    WIDTH_NOT_SUPPORTED_NO_WIDTH:
      "„{label}” nu poate fi construit la nicio lățime pe care o acceptă și dulapurile de deasupra.",
    WIDTH_NOT_SUPPORTED_COLUMN:
      "„{label}” este într-o coloană care suportă o lățime {widthsMadeClause}, iar acum are {availableMm, number, ::group-off} mm.",
    WIDTH_NOT_SUPPORTED_BODY:
      "„{label}” se face {widthsMadeClause}, iar spațiul liber are {availableMm, number, ::group-off} mm.",
    OPENING_TOO_SHORT:
      "Spațiul liber are doar {availableMm, number, ::group-off} mm înălțime; sub {minimumMm, number, ::group-off} mm nu se poate încadra un dulap.",
    HEIGHT_EXCEEDS_LEVEL:
      "„{label}” are {requiredMm, number, ::group-off} mm înălțime și nu încape pe acest nivel de {availableMm, number, ::group-off} mm. Doar coloanele pot depăși un nivel.",
    HEIGHT_TOO_LARGE:
      "„{label}” are {requiredMm, number, ::group-off} mm înălțime, iar spațiul liber are {availableMm, number, ::group-off} mm.",
    NO_SNAP_POSITION:
      "„{label}” nu poate fi adăugat la nici un nivel al acestei coloane. Verifică dacă înălțimea este corectă și dacă spațiul liber are suficientă înălțime.",
    BUILT_SIZE_MISMATCH:
      "„{label}” s-a construit la {builtMm, number, ::group-off} mm în loc de {requiredMm, number, ::group-off} mm, așa că nu l-am așezat.",
    MEASUREMENT_UNUSABLE:
      "Nu am putut măsura dulapul „{label}” după ce a fost construit, așa că nu l-am adăugat.",
    COLUMN_MISMATCH:
      "„{label}” ar ieși înafara coloanei în care a fost adăugat.",
    NOT_RESIZABLE: "„{label}” nu își poate schimba lățimea.",
    WIDTH_UNCHANGED:
      "„{label}” are deja {widthMm, number, ::group-off} mm lățime.",
    NO_EMPTY_SPACE:
      "„{label}” nu poate ajunge la {requestedMm, number, ::group-off} mm: coloana ar mai avea nevoie de {deltaMm, number, ::group-off} mm, dar {sides}.",
    COLUMN_MEMBER_NOT_RESIZABLE:
      "„{label}” nu poate fi redimensionat: în aceeași coloană există „{memberLabel}”, care nu își poate schimba lățimea.",
    RESIZE_OPENS_GAP: "„{label}” nu poate fi redimensionat aici: {sides}.",
    COLUMN_KEY_COLLISION:
      "„{label}” nu poate ajunge la {requestedMm, number, ::group-off} mm: {sides}.",
    COLUMN_HOOD_FLOOR:
      "„{label}” nu poate coborî la {requestedMm, number, ::group-off} mm: hota de deasupra are {hoodWidthMm, number, ::group-off} mm.",
    NON_INTEGER_MILLIMETRES:
      "Dimensiunea calculată ({field}: {valueMm} mm) nu este un număr întreg de milimetri.",
    FINISH_NOT_SUPPORTED:
      "„{label}” nu are uși, deci nu i se poate schimba finisajul.",
    FINISH_NOT_OFFERED:
      "Culoarea selectată nu e disponibilă pentru materialul ales. Alege din culorile disponibile sau schimbă materialul.",
    HANDLE_NOT_SUPPORTED: "„{label}” nu are mânere.",
    UNKNOWN_MATERIAL_TIER:
      "Materialul ales nu mai este disponibil. Alege altă variantă.",
    UNKNOWN_HARDWARE_TIER:
      "Feroneria aleasă nu mai este disponibilă. Alege altă variantă.",
    UNKNOWN_CABINET_DEPTH:
      "Adâncimea aleasă nu este disponibilă. Alege una dintre adâncimile oferite.",
    parts: {
      emptySpaceSide:
        "{sideReason, selectordinal, =0 {în dreapta nu este spațiu liber} =1 {în dreapta spațiul liber este insuficient} =2 {în dreapta s-ar obține un spațiu liber peste alte dulapuri} =3 {în dreapta dulapul nu se încadrează în acestă coloană} =4 {în stânga nu este spațiu liber} =5 {în stânga spațiul liber este insuficient} =6 {în stânga s-ar obține un spațiu liber peste alte dulapuri} other {în stânga dulapul nu se încadrează în acestă coloană}}",
      sidesJoin: ", iar ",
      widthsMadeBetween:
        "între {minMm, number, ::group-off} și {maxMm, number, ::group-off} mm",
      widthsMadeAt: "la {minMm, number, ::group-off} mm",
      widthsMadeList: "doar în {sizes} mm",
      widthsJoin: " sau ",
    },
    DEPENDENT_MEMBER_NOT_REBUILDABLE:
      "„{label}” nu poate fi adăugat aici: „{memberLabel}”, care stă deasupra, nu poate fi reconstruit la adâncimea coloanei.",
  },
} as const;

export function isRomanianCopyApproved(actual: unknown): boolean {
  return isDeepStrictEqual(actual, APPROVED_ROMANIAN_MESSAGES);
}
