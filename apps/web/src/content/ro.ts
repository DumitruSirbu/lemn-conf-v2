/** Every customer-visible string on the screens this milestone ships. Kept in one module so the
 *  localisation system that arrives with the contact and review steps has a single place to take
 *  over from, rather than a scatter of literals inside components. */
export const ro = {
  brand: "Lemnaria",
  configure: {
    step: "Pasul 2 din 4",
    back: "‹ Cameră",
    orbitHint: "Trage pentru a roti modelul · apropie pentru zoom",
    cameraGroupLabel: "Vedere cameră",
    cameraPresets: {
      overview: "Vedere generală",
      wallA: "Perete A",
      wallB: "Perete B",
    },
    loading: "Se încarcă modelul 3D…",
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
