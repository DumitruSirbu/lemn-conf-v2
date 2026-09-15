import { isDeepStrictEqual } from "node:util";

// Gate O1: this inline literal is the sole approved Romanian wording corpus.
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
    },
    loading: "Se încarcă modelul 3D…",
    overflowWarning:
      "Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.",
    backAction: "Înapoi",
    reviewCta: "Verifică designul",
  },
  // Step 1's screen, approved by ADR 0113 decision 2 in the wave that adds it. Every leaf is frame
  // 1A's or 1B's wording used as written; `wallLabel.wallC` is the one drafted leaf, because no
  // frame draws a U's third wall.
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
    planWallLabel: "{wall} · {metres} m",
    cornerQuestion: "Încotro merge cotul?",
    cornerHint: "nu se deduce din lățimi",
    cornerLeft: "La stânga",
    cornerRight: "La dreapta",
    wallLabel: {
      wallA: "Perete A",
      wallB: "Perete B",
      wallC: "Perete C",
    },
    heightLabel: "Înălțimea camerei",
    unitMetres: "m",
    back: "Înapoi",
    continue: "Continuă",
    // Sub-state 1F, wave 7F4a. Frame 1F's wording used as written, with three drafted leaves called
    // out because no frame supplies them:
    //
    //   - `role.preparation` — the frame draws three rows and a dropped fridge, and never the
    //     worktop priority `GENERATION_PRIORITIES` carries.
    //   - `rowLabel` — the structural leaf that joins a role to its extent. `room.planWallLabel`'s
    //     own shape, and for its reason: the separator belongs to the locale, not to a component
    //     putting two spans side by side.
    //   - `failed` — no frame draws a composition that did not finish. It says the composition did
    //     not complete and **nothing about the room**: a room-level reason is 7F2's sentence, shown
    //     at 1C where the customer can act on it (wave 7F4 ruling R16).
    //
    // **Three leaves depart from the frame on the owner's 2026-09-15 ruling, and it is the reason
    // they are here in this wording rather than the frame's.** The ruling, verbatim: *"instead of
    // așezat => inclus, related to 'nu încape' => nu poate fi inclus and to be mentioned that walls
    // size didnt provide enough space to fit all cabinets"*. So `status.placed` and
    // `status.notPlaced` carry the owner's two words, `rule` follows them into its running text —
    // the paragraph restates the `notPlaced` status and must not restate it in the word the owner
    // replaced — and `dropped` names the wall sizes as the reason. `dropped` was the one leaf
    // nobody had approved (question Q7F4-1, ADR 0110 Amendment F's instruction to confirm it); the
    // same ruling settles it, so it is approved copy like every other leaf in this file.
    //
    // Frame 1F's last sentence — *"Pragurile exacte sunt decizie de produs nefinalizată"* — is
    // deliberately **not** here (ruling R18): it announces an unfinished product decision that has
    // since been taken, and telling a customer a threshold is undecided is not copy.
    compose: {
      title: "Preset",
      heading: "Ți-o construim pe a ta",
      roomSummary: "{shape} · {wallA} × {wallB} m · h {height} m",
      noPresetNotice:
        "Niciun preset gata făcut nu încape aici. Compunem una pe măsura camerei tale — durează puțin mai mult.",
      stepsLabel: "Ce așezăm, în ordinea priorității",
      role: {
        fridge: "Frigider",
        sink: "Spălător",
        preparation: "Blat de lucru",
        hob: "Plită și cuptor",
        storage: "Depozitare",
      },
      rowLabel: "{role} · {extent}",
      rowWidth: "{millimetres, number, ::group-off}",
      storageExtent: "restul peretelui",
      status: {
        pending: "se calculează",
        placed: "inclus",
        notPlaced: "nu poate fi inclus",
      },
      rule: "Regula: pe pereți scurți păstrăm întâi spălătorul și gătitul, apoi depozitarea; ce nu poate fi inclus este scos și marcat, nu înghesuit.",
      busy: "Se compune…",
      dropped:
        "Dimensiunile pereților nu au lăsat destul spațiu pentru toate dulapurile, așa că nu am putut include: {roles}. Restul bucătăriei e compus pe măsura camerei tale.",
      failed:
        "Compunerea nu s-a putut finaliza. Întoarce-te la dimensiuni și încearcă din nou.",
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
  globalSettings: {
    open: "Setări globale",
    title: "Setări pentru toată bucătăria",
    appliesTo:
      "Se aplică {bodyCount, plural, one {singurului dulap din bucătărie} few {tuturor celor # dulapuri} other {tuturor celor # dulapuri}}. Nu se setează pentru fiecare dulap în parte.",
    groupHeadings: {
      material: "Material corp și fronturi",
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
    startOver: "Începe o configurare nouă",
  },
  contactPlaceholder: {
    title: "Formularul de contact urmează",
    body: "Pagina de contact nu este încă disponibilă în această versiune a configuratorului.",
    back: "Înapoi la configurare",
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
  // Wave 6B-f2 relocated these 14 leaves from `sample-price-book.ts`, byte for byte, under ADR 0095
  // Amendment B and ADR 0106. **Not new copy**: every string below was owner-authored in the book
  // and is locked here at the wording it shipped with, so a reword is an unapproved change in the
  // same way any other leaf's is. The two brand tiers name no `name` leaf on purpose — *Hettich*
  // and *Blum* are proper nouns and render from the book's own field in every locale.
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
        name: "Protecție de aluminiu pentru corpul spălătorului",
        description:
          "Montată în corpul spălătorului, împotriva umidității și a scurgerilor.",
      },
      "dish-drying-rack": {
        name: "Uscător de vase",
        description: "Montat în corpul suspendat de deasupra spălătorului.",
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
      "base-sink": "Dulap spălător",
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
