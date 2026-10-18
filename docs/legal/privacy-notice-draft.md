# Privacy notice — best-practice DRAFT (not legal advice)

Status: **DRAFT, not published, not owner-approved.** Prepared 2026-10-18 from public primary sources by an AI
research agent. Nothing in this file is in force.

> **This is not legal advice.** It is a best-practice draft compiled from the GDPR text, EDPB/WP29 guidance, ICO
> guidance, the CNPDCP's own leaflet and vendor documentation. Before publication, a lawyer or the CNPDCP should
> confirm only these points: (1) the Moldovan transfer rules under Law 195/2024 for US processors; (2) whether an
> EU representative (GDPR Art. 27) is required; (3) the legal basis chosen for staff viewing unsent drafts and for
> the contact form; (4) that Turnstile may run without consent; (5) the retention horizon for sent kitchens.

> **Owner note, 2026-10-18 (added by the scribe):** the owner accepted this file as the **working draft only**, and ruled
> that all mail, account mail and the shop's notices, will be sent and received on `@lemnaria.md` through the domain
> provider (ADR 0169 Amendment E; direction, nothing built; Gmail stays the working sender during development and the
> no-processor-contract blocker below stands until cutover). Where the draft names Google/Gmail as the mail processor
> (§5, §6, §(d)), read it as the domain provider (name PLACEHOLDER) once Gmail is retired; the text below is not yet
> changed. Launch gates: `docs/milestones/M8B-login-register-plan.md` §10.

Evidence labels used throughout:

- **[doc]** — quoted (short quote) from the cited URL or file, fetched 2026-10-18. Quotes from web pages came through
  a summarising fetcher, so re-open the URL before relying on exact wording.
- **[src]** — read in this repository's code or decision records at the commit checked out on 2026-10-18.
- **[sec]** — stated by a secondary source (law firm, vendor blog), not by the law or the authority.
- **[inf]** — inference by the drafter; says what would change it.
- **[not verified]** — looked for and not found; the owner must check.

---

## 0. Launch gate — read before publishing anything

The notice may only state what is **true on the day it is published**. Several statements the owner asked for are
**intentions that the code does not yet carry out** [src, `docs/decisions/0169-…md`]:

| Statement in the draft                                   | State in the repository today                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafts deleted after 1 year (365 days)                   | **Deferred** — ADR 0169 table: "Retention: drafts 365 days, sent kept — Deferred" (plan §12 "Retention job")                                                         |
| Unverified accounts deleted after 30 days                | **Deferred** — ADR 0169: "Q-F3-7: unverified accounts deleted after 30 days — Deferred"                                                                              |
| Erasure on request removes everything incl. sent kitchens | **Deferred** — ADR 0169: "The notice text, processors list, export, erasure and the Moldovan check are deferred"                                                      |
| Data export (portability)                                | **Deferred** — same line                                                                                                                                             |
| Sessions and tokens have a deletion horizon              | **None exists** — ADR 0169: "Retention: no horizon exists for sessions or tokens … expired rows accumulate"                                                           |
| The notice version shown at registration is recorded     | Column exists (`accounts.privacy_notice_version`, check `^[a-z0-9.-]{1,32}$`, migration 0012) [src]; no value is wired in `apps/web/src` yet [src: grep found none]   |
| Backups rotate in 14 days                                | Owner's figure; not checked here [not verified]                                                                                                                      |
| Shop notices sent by e-mail are erased on request        | **Not true today [inf]:** ADR 0164 says "The sending account's *Sent* folder keeps every notice". A manual or scripted purge of the Gmail *Sent* folder must exist.   |
| Erasure also reaches the shop's own copies               | **Not defined [inf]:** the shop's **receiving** inbox holds every notice (name, phone, locality); the shop's WhatsApp holds whatever a customer sent there (ADR 0163). An erasure procedure must cover both, or the notice must say these copies are kept and for how long. |
| Designs made without an account are deleted at some point | **Nothing deletes them [src]:** ADR 0114's dated note quotes ADR 0019 (2026-09-15): "Nothing deletes a design automatically". The visitor cookie expires in 30 days, but the row stays. The owner must set a horizon (§7 row is a placeholder). |

**Contact form — decide before launch.** The contact form already validates a **consent** field (ADR 0150 d1:
"name, phone and its E.164 normal form, locality, channel, a conditional e-mail, consent" [src]). This draft uses
Art. 6(1)(b) (steps at the person's request) as the basis, which is the usual choice for "call me back about an
offer". Pick one ⚑: (i) keep 6(1)(b) and relabel the checkbox as "Am citit politica de confidențialitate" (an
acknowledgement, not consent); or (ii) make consent the basis — then §8 must explain withdrawal and what happens to
a request already sent. Do not describe the same processing as both.

Checked and **not** personal data: the CSP report table (migration 0009) stores no address, user agent, cookie, id
or token — "Nothing in it comes from … an address, a bucket key, a user agent, a cookie, an id, a token" [src] — and
is a ring of at most 10 000 rows. Not mentioned in the notice.

**Rule:** if a row is still "deferred" at launch, either finish it or change the notice text to what really happens.
A notice that promises deletion that does not occur is itself a transparency breach (GDPR Art. 5(1)(a), 12).

---

## (a) Checklist — mandatory contents (GDPR Art. 13) mapped to this product

Source for every item: GDPR Art. 13, <https://gdpr-info.eu/art-13-gdpr/> [doc]. Art. 13 applies because all data
here is collected **from the person directly** ("at the time when personal data are obtained" [doc]). Art. 14
(data from third parties) does not apply [inf: nothing is bought or received from third parties; the contact
request is typed by the person themself].

| #   | Art. 13 item                                                     | This product                                                                                                                                                                                                                                                                                                                                                                          | Where in draft | Status                       |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------- |
| 1   | 13(1)(a) Controller identity + contact                           | [LEGAL ENTITY NAME], IDNO [IDNO], [REGISTERED ADDRESS], [CONTACT E-MAIL]                                                                                                                                                                                                                                                                                                              | §1             | PLACEHOLDER                  |
| 1b  | 13(1)(a) EU representative (Art. 27), if any                     | Art. 3(2)(a) covers a non-EU controller "offering of goods or services, irrespective of whether a payment … is required" [doc, <https://gdpr-info.eu/art-3-gdpr/>]; Art. 27(1) "the controller … shall designate in writing a representative in the Union" [doc, <https://gdpr-info.eu/art-27-gdpr/>]. Exemption 27(2)(a) is for "occasional" low-risk processing — an always-on accounts service is unlikely to be occasional [inf]. | §1             | PLACEHOLDER — lawyer to confirm |
| 2   | 13(1)(b) DPO contact, if any                                     | Probably not mandatory (no large-scale systematic monitoring, no special categories) [inf]; CNPDCP recommends one anyway: "este totuși recomandat să fie desemnat" [doc, CNPDCP leaflet]                                                                                                                                                                                              | §1             | PLACEHOLDER (or "none")      |
| 3   | 13(1)(c) Purposes **and** legal basis per purpose                | Account; designs; anonymous designs; contact request; account e-mails; bot check & rate limits; staff access; backups                                                                                                                                                                                                                                                                  | §3 table       | Drafted; 2 bases flagged     |
| 4   | 13(1)(d) Legitimate interests, named, where 6(1)(f) used         | Security/abuse prevention (Turnstile, rate limits); staff viewing designs [PURPOSE]; backups                                                                                                                                                                                                                                                                                           | §3             | Drafted; staff purpose = PLACEHOLDER |
| 5   | 13(1)(e) Recipients or categories                                | Vercel (hosting), Neon (database), Google (Gmail SMTP), Cloudflare (Turnstile; also an independent controller for its own improvement use), the shop's staff, Meta/WhatsApp only when the user chooses that hand-off                                                                                                                                                               | §5             | Drafted                      |
| 6   | 13(1)(f) Third-country transfers + safeguard + how to get a copy | US (Vercel primary facilities, Cloudflare, Google; Neon by region). EU side: SCCs / DPF. Moldovan side: unknown                                                                                                                                                                                                                                                                         | §6             | Partly — see (d), (e)        |
| 7   | 13(2)(a) Retention period or criteria                            | Drafts 1 y; sent kitchens until erasure (flagged); unverified accounts 30 d; backups 14 d; sessions 90 d / 7 d; contact requests [PLACEHOLDER]                                                                                                                                                                                                                                        | §7             | Drafted; see launch gate     |
| 8   | 13(2)(b) Rights: access, rectification, erasure, restriction, objection, portability | All listed; portability only where basis is contract or consent (Art. 20) [inf from Art. 20 text]                                                                                                                                                                                                                                                                         | §8             | Drafted                      |
| 9   | 13(2)(c) Right to withdraw consent                               | Only where consent is the basis — the optional phone (if owner keeps consent as its basis)                                                                                                                                                                                                                                                                                             | §8             | Drafted                      |
| 10  | 13(2)(d) Right to complain to a supervisory authority            | CNPDCP (Moldova) **and** the EU authority of the person's residence (GDPR Art. 77)                                                                                                                                                                                                                                                                                                    | §9             | Drafted                      |
| 11  | 13(2)(e) Statutory/contractual requirement; consequence of not providing | E-mail + password needed for an account; name + phone needed for a contact request; phone in account optional                                                                                                                                                                                                                                                                  | §2             | Drafted                      |
| 12  | 13(2)(f) Automated decision-making / profiling                   | None. Turnstile's bot score is not a decision with legal or similarly significant effect on the person [inf]                                                                                                                                                                                                                                                                           | §10            | Drafted                      |
| 13  | 13(3) Further processing for a new purpose → inform first        | Covered by the version policy (c)                                                                                                                                                                                                                                                                                                                                                      | §12, (c)       | Drafted                      |
| —   | Art. 12 form: "concise, transparent, intelligible and easily accessible … clear and plain language" | Layered: short summary on top, details below; Romanian + Russian (app ships `ro` and `ru` [src `apps/web/src/i18n/routing.ts`])                                                                                                                                                            | whole notice   | **Russian translation open** |
| —   | ICO: "provide privacy information to individuals at the time you collect their personal data" [doc, ICO] | Link at register, login, contact form and in the footer; register records the version shown                                                                                                                                                                                                                                          | (c)            | Wiring open                  |

ICO source: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/>
— also: "You must bring any new uses of an individual's personal data to their attention before you start the
processing" [doc]. WP260 rev.01 (layering): "the use of layered privacy notices can help resolve the tension between
completeness and understanding" [sec quoting WP260; primary PDF: <https://www.edpb.europa.eu/system/files/2023-09/wp260rev01_en.pdf>].

---

## (b) DRAFT privacy notice — Romanian (primary)

> Text to be placed at `/ro/confidentialitate` (path is a suggestion). `[PLACEHOLDER]` = a fact only the owner
> knows. `⚑` = a choice the owner (or a lawyer) must confirm before publishing. Remove all markers before launch.

### Politica de confidențialitate — Configuratorul de bucătării Lemnaria

**Versiunea:** [YYYY-MM-DD] · **În vigoare de la:** [YYYY-MM-DD] · [Versiunile anterioare](#)

#### Pe scurt

- Folosim datele tale ca să-ți putem păstra contul și proiectele de bucătărie și ca să te putem contacta când ne
  ceri o ofertă.
- Nu vindem datele tale, nu facem marketing, nu trimitem SMS-uri și nu folosim cookie-uri de publicitate sau
  de analiză.
- Folosim doar cookie-uri strict necesare funcționării site-ului.
- Personalul nostru poate vedea proiectele tale, inclusiv cele netrimise (ciorne).
- Poți cere oricând o copie a datelor, corectarea sau ștergerea lor, scriindu-ne la [CONTACT E-MAIL].

#### 1. Cine suntem

Operatorul datelor este **[LEGAL ENTITY NAME]**, IDNO [IDNO], cu sediul în [REGISTERED ADDRESS], Republica Moldova
(„Lemnaria”, „noi”).
Contact pentru protecția datelor: **[CONTACT E-MAIL]**, [PHONE, optional].
Responsabil cu protecția datelor: [DPO NAME + E-MAIL — sau „Nu am desemnat un responsabil cu protecția datelor;
scrie-ne la adresa de mai sus.”] ⚑
Reprezentant în Uniunea Europeană (art. 27 GDPR): [EU REPRESENTATIVE NAME + ADDRESS + E-MAIL — sau se elimină dacă
juristul confirmă că nu este necesar] ⚑

#### 2. Ce date colectăm

| Date                                                     | Când                                    | Obligatoriu?                                                       |
| -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Adresa de e-mail (o confirmăm printr-un link)            | La crearea contului                     | Da — fără ea nu putem crea contul                                  |
| Parola (o păstrăm doar ca amprentă (hash) ireversibilă)  | La crearea contului                     | Da                                                                 |
| Numărul de telefon (nu îl verificăm)                     | La crearea contului sau mai târziu      | Nu — îl folosim doar ca să te sunăm dacă ne ceri                   |
| Limba aleasă (română / rusă)                             | La crearea contului                     | Da                                                                 |
| [Numele și adresa — când vor fi adăugate] ⚑              | [Mai târziu, opțional]                  | Nu                                                                 |
| Proiectele de bucătărie (dimensiuni, module, materiale)  | Când lucrezi în configurator            | —                                                                  |
| Cererea de contact: nume, telefon, localitate, modul de contact preferat, e-mail (dacă alegi e-mail), proiectul trimis | Când trimiți o cerere magazinului | Da — fără nume și telefon nu te putem contacta |
| Date tehnice: adresa IP, tipul browserului, semnale tehnice pentru verificarea anti-robot | La înregistrare, autentificare, resetarea parolei; la limitarea cererilor abuzive | Da — fără ele nu putem proteja conturile |
| Jurnale tehnice ale serverului (adresa IP, pagina cerută, ora) | La orice vizită, prin furnizorul de găzduire | Da — sunt generate automat |

Nu colectăm date despre plăți, date despre sănătate sau alte categorii speciale de date.
[Serviciul nu este destinat copiilor sub [16] ani.] ⚑

#### 3. De ce folosim datele și pe ce temei legal

| Scop                                                                                   | Temei legal (art. 6 GDPR / art. 6 Legea nr. 195/2024)                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crearea și administrarea contului, autentificarea                                      | Executarea contractului (condițiile de utilizare a contului) — art. 6 alin. (1) lit. (b)                                                                                                                       |
| Păstrarea proiectelor tale și deschiderea lor pe orice dispozitiv                      | Executarea contractului — lit. (b)                                                                                                                                                                             |
| Păstrarea proiectelor create fără cont, în același browser                             | Executarea serviciului cerut de tine — lit. (b)                                                                                                                                                                |
| E-mailuri despre cont (confirmare, resetarea parolei, anunț că parola a fost schimbată) | Executarea contractului — lit. (b)                                                                                                                                                                             |
| Telefonul opțional din cont                                                            | ⚑ Consimțământul tău — lit. (a): îl poți retrage oricând ștergând numărul din cont                                                                                                                            |
| Trimiterea cererii tale de contact magazinului și răspunsul la ea                      | ⚑ Demersuri făcute la cererea ta înainte de încheierea unui contract — lit. (b)                                                                                                                               |
| Verificarea anti-robot (Cloudflare Turnstile) și limitarea numărului de cereri         | Interesul nostru legitim — lit. (f): să protejăm conturile și serviciul împotriva atacurilor automate (ghicirea parolelor, conturi false, abuz de e-mail)                                                     |
| Vizualizarea proiectelor, inclusiv a ciornelor, de către personalul nostru             | ⚑ Interesul nostru legitim — lit. (f): [PURPOSE — ex.: să te putem ajuta când ne contactezi și să pregătim o ofertă corectă]                                                                                  |
| Copii de siguranță (backup)                                                            | Interesul nostru legitim — lit. (f): să putem restaura serviciul după o defecțiune                                                                                                                            |

Când folosim interesul legitim, poți să te opui (vezi §8).

#### 4. Cine din echipa noastră vede datele

Operatorii și administratorii Lemnaria pot vedea proiectele clienților, **inclusiv proiectele încă netrimise
(ciorne)**, [PURPOSE]. Accesul are doar personalul cu cont de serviciu, iar sesiunile lor expiră mai repede decât
ale clienților. ⚑

#### 5. Cui transmitem datele

Nu vindem și nu închiriem datele tale. Le transmitem doar furnizorilor care ne ajută să funcționăm, pe baza unor
contracte de prelucrare a datelor:

| Furnizor                                    | Ce face                                                                  | Unde                              |
| ------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Vercel Inc.                                 | Găzduiește site-ul                                                       | [REGION] / SUA                    |
| Neon (Databricks)                           | Baza de date (conturi, proiecte, cereri)                                 | [NEON REGION]                     |
| Google (Gmail)                              | Trimite e-mailurile despre cont și anunțul cererii tale către magazin    | [REGION] / SUA ⚑                  |
| Cloudflare Inc. (Turnstile)                 | Verificarea anti-robot la înregistrare, autentificare, resetarea parolei | SUA / global                      |

**Cloudflare** folosește aceleași semnale tehnice (adresa IP, amprenta TLS, tipul browserului) și în nume propriu,
ca operator independent, pentru a-și îmbunătăți detectarea roboților, în baza interesului său legitim. Detalii:
<https://www.cloudflare.com/turnstile-privacy-policy/>.

**WhatsApp (Meta):** dacă alegi să trimiți proiectul pe WhatsApp-ul magazinului, mesajul pleacă din aplicația ta
WhatsApp și se aplică regulile Meta. Nu folosim WhatsApp dacă nu alegi tu această opțiune.

**Linkuri de partajare:** dacă creezi un link de vizualizare pentru un proiect, oricine are linkul poate vedea
proiectul (nu îl poate modifica). Poți dezactiva linkul oricând [din pagina proiectului — de verificat] ⚑. Anunțul
trimis magazinului conține un link de vizualizare a proiectului așa cum l-ai trimis.

Putem divulga date autorităților doar dacă legea ne obligă.

#### 6. Transferuri în afara Republicii Moldova și a UE

Unii furnizori prelucrează date în SUA. Pentru persoanele din UE, transferurile se bazează pe clauzele contractuale
standard aprobate de Comisia Europeană și/sau pe certificarea furnizorului în cadrul EU-U.S. Data Privacy Framework.
[Temeiul transferului conform Legii nr. 195/2024 — de confirmat cu CNPDCP] ⚑
Poți cere o copie a garanțiilor scriindu-ne la [CONTACT E-MAIL].

#### 7. Cât timp păstrăm datele

| Date                                                     | Cât timp                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Cont neconfirmat                                         | Șters după 30 de zile                                                                                         |
| Cont confirmat                                           | Cât timp ai contul; până ceri ștergerea                                                                       |
| Proiect netrimis (ciornă)                                | 1 an [de la ultima modificare ⚑ — punctul de pornire de confirmat]                                            |
| Proiect creat fără cont (în browser)                     | [PLACEHOLDER — ex. 1 an de la ultima salvare] ⚑                                                               |
| Jurnale tehnice ale serverului                           | [VERCEL LOG RETENTION — după planul Vercel] ⚑                                                                 |
| Copii ale cererii în căsuța de e-mail și pe WhatsApp-ul magazinului | [PLACEHOLDER — cât timp le păstrează magazinul] ⚑                                                  |
| Proiect trimis magazinului                               | ⚑ Până ceri ștergerea [sau: [N] ani de la ultima cerere de contact]                                           |
| Cererea de contact și anunțul trimis magazinului         | [PLACEHOLDER — aceeași durată ca proiectul trimis?] ⚑                                                         |
| Sesiunea de autentificare                                | Cel mult 90 de zile (clienți); se încheie mai devreme după 30 de zile de inactivitate sau la deconectare       |
| Date tehnice pentru limitarea cererilor                  | [PLACEHOLDER — durata ferestrei de limitare + curățare]                                                        |
| Copii de siguranță                                       | Se suprascriu în 14 zile; datele șterse dispar și din copii în cel mult 14 zile                               |

#### 8. Drepturile tale

Ai dreptul:

- să afli ce date avem despre tine și să primești o copie (**acces**);
- să ceri **corectarea** datelor greșite;
- să ceri **ștergerea** datelor — inclusiv a proiectelor trimise;
- să ceri **restricționarea** prelucrării;
- să primești datele într-un format structurat, ca să le poți muta (**portabilitate**), pentru datele din cont și
  proiecte;
- să te **opui** prelucrării bazate pe interesul nostru legitim;
- să îți **retragi consimțământul** (de ex. ștergând telefonul din cont), fără să afecteze ce am făcut înainte.

Scrie-ne la **[CONTACT E-MAIL]** [sau folosește butonul din cont]. Îți răspundem în cel mult **o lună**. Putem cere
să confirmi că adresa de e-mail e a ta.

#### 9. Plângeri

Dacă crezi că îți încălcăm drepturile, te rugăm să ne scrii mai întâi. Ai și dreptul să depui o plângere la:

- **Centrul Național pentru Protecția Datelor cu Caracter Personal** (CNPDCP), Republica Moldova —
  [ADDRESS, verify on datepersonale.md], <https://datepersonale.md>;
- dacă locuiești în UE: autoritatea de protecție a datelor din țara ta (lista:
  <https://www.edpb.europa.eu/about-edpb/about-edpb/members_ro>).

#### 10. Decizii automate

Nu luăm decizii automate cu efecte juridice asupra ta și nu îți facem profiluri. Verificarea anti-robot doar
decide dacă un formular poate fi trimis; dacă e respinsă, poți încerca din nou.

#### 11. Cookie-uri

Folosim doar cookie-uri strict necesare. Nu folosim cookie-uri de analiză, publicitate sau rețele sociale, de aceea
nu îți cerem acordul pentru ele.

| Cookie                         | Scop                                                                          | Durată                                       |
| ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `__Host-lemnaria_session`      | Te ține autentificat                                                          | Cel mult 90 de zile (personal: 7 zile)       |
| `__Host-lemnaria_visitor`      | Recunoaște browserul în care ai creat proiecte fără cont                      | 30 de zile, reînnoit la fiecare salvare      |
| `lemnaria_write_token_<id>`    | Permite doar browserului tău să modifice proiectul respectiv                  | 30 de zile, reînnoit la fiecare salvare      |
| `NEXT_LOCALE`                  | Ține minte limba aleasă (română / rusă)                                       | Până închizi browserul                       |

Pe paginile de înregistrare, autentificare și resetare a parolei, **Cloudflare Turnstile** rulează o verificare
în browser (citește semnale tehnice ale browserului). [Turnstile nu setează cookie-uri în configurația noastră —
de verificat la lansare] ⚑

#### 12. Modificări

Când schimbăm această politică publicăm o versiune nouă, cu data ei, și păstrăm versiunile vechi la [LINK ARHIVĂ].
Dacă schimbarea e importantă (scop nou, date noi, furnizor nou, alte termene), te anunțăm prin e-mail sau la
următoarea autentificare **înainte** să intre în vigoare.

---

## (b) DRAFT privacy notice — English reference

> Reference translation for the owner and a reviewer. The Romanian text is the one to publish. Markers as above.

### Privacy notice — Lemnaria kitchen configurator

**Version:** [YYYY-MM-DD] · **Effective from:** [YYYY-MM-DD] · [Previous versions](#)

**In short.** We use your data to keep your account and kitchen designs and to contact you when you ask for an
offer. We do not sell data, do no marketing, send no SMS, and use no advertising or analytics cookies — only
strictly necessary ones. Our staff can see your designs, including unsent drafts. You can ask for a copy,
correction or deletion at [CONTACT E-MAIL].

**1. Who we are.** Controller: [LEGAL ENTITY NAME], IDNO [IDNO], [REGISTERED ADDRESS], Republic of Moldova. Contact:
[CONTACT E-MAIL]. DPO: [DPO or "none appointed"] ⚑. EU representative (GDPR Art. 27): [NAME/ADDRESS or remove] ⚑.

**2. What we collect.** E-mail (verified by link; required for an account); password (stored only as a one-way
hash; required); phone (optional, not verified, used only to call you); language; [name and address — later,
optional] ⚑; kitchen designs; contact request (name, phone, locality, preferred channel, e-mail if you choose
e-mail, the design sent — name and phone required); technical data (IP address, browser type, bot-check signals)
on register, login, password reset and for rate limiting; hosting server logs (IP, page, time) on every visit. No payment data, no special categories. [Not intended
for children under [16].] ⚑

**3. Purposes and legal bases.** Account and sign-in — contract, Art. 6(1)(b). Storing designs and opening them on
any device — contract. Anonymous designs in the same browser — service you requested, 6(1)(b). Account e-mails
(confirmation, reset, password-changed notice) — contract. Optional phone — ⚑ consent, 6(1)(a), withdrawn by
deleting it. Sending your contact request to the shop — ⚑ steps at your request before a contract, 6(1)(b). Bot
check (Cloudflare Turnstile) and rate limits — legitimate interest, 6(1)(f): protecting accounts and the service
from automated attacks (password guessing, fake accounts, mail abuse). Staff viewing designs incl. drafts — ⚑
legitimate interest: [PURPOSE]. Backups — legitimate interest: restoring the service after a failure.

**4. Staff access.** Lemnaria operators and administrators can see clients' designs, **including unsent drafts**,
[PURPOSE]. Only staff accounts have this access; their sessions expire sooner. ⚑

**5. Recipients.** Vercel (hosting), Neon/Databricks (database), Google/Gmail (account e-mails and the shop's
notice) ⚑, Cloudflare (Turnstile). Cloudflare also uses the same signals as an independent controller to improve
bot detection, on its legitimate interest. WhatsApp (Meta) only if you choose to send your design to the shop's
WhatsApp, from your own app. Share links: anyone holding a view link can see the design; you can switch it off
[where — to verify] ⚑; the shop's notice carries a view link to the design as sent. Authorities only where the law
requires.

**6. Transfers.** Some providers process data in the US. For people in the EU: EU Standard Contractual Clauses
and/or the provider's EU-U.S. Data Privacy Framework certification. [Basis under Moldovan Law 195/2024 — to confirm
with CNPDCP] ⚑. Copy of safeguards on request.

**7. Retention.** Unverified account: 30 days. Verified account: until you delete it. Draft: 1 year after last
change ⚑. Design made without an account: [PLACEHOLDER] ⚑. Sent design: ⚑ until you ask for erasure [or N years].
Contact request and shop notice: [PLACEHOLDER] ⚑. Copies in the shop's inbox and WhatsApp: [PLACEHOLDER] ⚑. Server
logs: [VERCEL LOG RETENTION] ⚑.
Session: max 90 days (clients), ends after 30 days idle or at logout. Rate-limit data: [PLACEHOLDER]. Backups:
overwritten within 14 days; erased data leaves backups within 14 days.

**8. Your rights.** Access, rectification, erasure (incl. sent designs), restriction, portability (account and
designs), objection to legitimate-interest processing, withdrawal of consent. Write to [CONTACT E-MAIL]; we reply
within one month and may ask you to confirm the e-mail is yours.

**9. Complaints.** CNPDCP, Republic of Moldova (<https://datepersonale.md>); if you live in the EU, your national
data protection authority.

**10. Automated decisions.** None with legal effect; no profiling. The bot check only decides whether a form may be
submitted; you can retry.

**11. Cookies.** Only strictly necessary cookies (table in §11 / (f)). Turnstile runs a browser check on register,
login and password reset. ⚑

**12. Changes.** New dated version for every change; old versions archived at [ARCHIVE LINK]; material changes
announced by e-mail or at next sign-in **before** they take effect.

---

## (c) Version policy

**Identifier format: `YYYY-MM-DD`**, the date the version takes effect (e.g. `2026-11-01`). A second publication on
the same day appends `.N` (`2026-11-01.2`). This fits the existing database check
`privacy_notice_version ~ '^[a-z0-9.-]{1,32}$'` [src, `packages/persistence/src/migrations/0012_create_accounts.sql:97`],
so **no migration is needed**. Romanian and Russian texts of one version share the identifier.

**When to bump** — every published change to the text gets a new identifier; what differs is the notification:

| Change                                                                                                                                                       | Material? | Action                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------ |
| New purpose; new data category; new processor or recipient category; new transfer country; change of controller identity; longer retention; change in how rights are exercised; new legal basis | **Yes**   | New version; tell account holders **before** it takes effect (e-mail and/or a notice at next sign-in); give an effective date after the notice. |
| Shorter retention, a processor replaced by one of the same kind and region, clarified wording that changes no practice                                       | Usually no | New version; changelog entry; no active push required, but recommended                                       |
| Typos, formatting, broken link                                                                                                                               | No        | New version (`.N` if same day); changelog entry                                                              |

Basis: WP260 rev.01 — changes "should always be communicated to data subjects" when they include "a change in
processing purpose; a change to the identity of the controller; or a change as to how data subjects can exercise
their rights", and substantial changes should be pushed "through means such as email, hard copy letter, pop-up on
a webpage" [sec quoting WP260; primary: <https://www.edpb.europa.eu/system/files/2023-09/wp260rev01_en.pdf>].
GDPR Art. 13(3): a new purpose requires informing the person "prior to that further processing" [doc, gdpr-info Art.
13]. No re-consent is needed because no core purpose relies on consent [inf; changes if the owner makes consent a
basis for anything beyond the optional phone].

**Archive rule:**

1. Each version is an immutable file in git: `docs/legal/privacy-notice/<id>.ro.md` (+ `.ru.md`, `.en.md`
   reference). Never edit a published file; publish a new one.
2. Each version stays reachable at a stable URL (e.g. `/ro/confidentialitate/<id>`), linked from the current page.
3. `CHANGELOG.md` beside it: id, effective date, material yes/no, one-line summary, how users were told.
4. The account row records the version shown at registration (column exists; wiring open [src]). Recommended
   addition: record the version a signed-in user was shown when a material change was announced [inf].
5. Keep every version for as long as any account references it, plus [LIMITATION PERIOD — owner/lawyer] ⚑ —
   in practice, never delete.

---

## (d) Processors — contract and transfer mechanism to verify

GDPR Art. 28 and Law 195/2024 art. 28 require a contract with each processor; the CNPDCP leaflet: "Un contract sau o
clauză clară te protejează" [doc, CNPDCP leaflet].

| Processor            | Role / data                                                                      | DPA (what was found)                                                                                                                                                                                         | Transfer mechanism (EU side)                                                                                                                       | Owner to verify                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Inc.**      | Hosting, request logs (IP)                                                       | <https://vercel.com/legal/dpa> — "shall become legally binding upon Customer entering into the Agreement" [doc]; sub-processors at <https://security.vercel.com> [doc]                                       | 2021 SCCs, deemed signed with the Agreement [doc]; "Vercel's primary processing facilities are in the United States" [doc]. DPF not mentioned on the page | Plan covers the DPA (Hobby vs Pro terms) [not verified]; function region; log retention; subscribe to sub-processor notices (privacy@vercel.com [doc])            |
| **Neon (Databricks)** | Database: accounts, designs, contact requests, backups                          | <https://neon.com/dpa> fetched — the page is a schedule that amends "the DPA", not the DPA itself [doc]; a PDF exists at <https://neon.tech/pdf/DPA.pdf> [not opened]; sub-processors <https://neon.com/subprocessors> (Salesforce, Grafana, AWS, Azure; updated 2 Mar 2026) [sec summary of that page] | **[not verified]**                                                                                                                                 | Which DPA applies to the plan; SCCs/DPF; **the project's region** (choose an EU region, e.g. AWS eu-central-1 Frankfurt [sec], if not already) — do not read `DATABASE_URL` to find out, read the Neon console |
| **Google (Gmail SMTP)** | Sends verification / reset / password-changed mail and the shop's notice (customer name, phone, design link) | Google's Cloud Data Processing Addendum is incorporated into agreements for "Google Cloud Platform, Google Workspace, or Cloud Identity" [sec summary of <https://workspace.google.com/terms/dpa_terms.html>]. **A consumer @gmail.com account has no processor terms** [sec, not confirmed from Google] | Workspace: SCCs/DPF per Google terms [not verified]                                                                                               | **BLOCKING [inf]:** ADR 0164 speaks of "a consumer account" limit and an app password [src]. If the sender is consumer Gmail, there is no Art. 28 contract — move to Google Workspace (accept the DPA in Admin console) or a provider with a DPA. Also: the *Sent* folder keeps every notice — define a purge |
| **Cloudflare Inc. (Turnstile)** | Bot check: "client IP address, TLS Fingerprint, User-Agent Header and Sitekey" [doc] | <https://www.cloudflare.com/cloudflare-customer-dpa/> — "forms part of the Main Agreement" [doc]; whether it covers a free Turnstile account [not verified]. Sub-processors <https://www.cloudflare.com/gdpr/subprocessors/> [doc] | "transfers … made under the Data Privacy Framework shall not be a Restricted Transfer"; SCCs as fallback (cl. 6.2, 6.4) [doc] | Accept the DPA in the dashboard if it is not automatic; disclose Cloudflare's **controller** role: "Cloudflare is a data controller of Signals that we process to improve Turnstile's bot detection capabilities" [doc, <https://www.cloudflare.com/turnstile-privacy-policy/>] |
| *Meta / WhatsApp*    | Not a processor [inf]: the user sends from their own WhatsApp to the shop's number (ADR 0163 [src]) | — | — | The shop's handling of WhatsApp messages is the shop's own processing; mention it in the notice (done) |

Also keep a **record of processing activities** (Art. 30; CNPDCP leaflet "Ține o evidență a activităților de
prelucrare (art. 30)" with a field list [doc]). The Art. 30(5) small-business exemption does not apply to
processing that is "not occasional" [inf from GDPR Art. 30(5) wording — not fetched this session].

---

## (e) Moldova-specific duties

Only first-party Moldovan source obtained: the CNPDCP leaflet
<https://datepersonale.md/wp-content/uploads/2026/03/Legea-nr.1952024.pdf> [doc]. Full law text:
<https://www.legis.md/cautare/downloadpdf/144681> (the download returned an HTML page, not the PDF — **not read**).

| Duty / fact                                                                                         | Evidence                                                                                                                                                                                           | Status                                  |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Law 195/2024 is in force                                                                            | Leaflet title: "Legea nr. 195/2024 privind protecția datelor cu caracter personal (în vigoare din 23 august 2026)" [doc]; Moldpres: applies from "August 23, 2026" [doc]                          | Confirmed                               |
| It replaces Law 133/2011                                                                            | "From that day the old Law 133/2011 is repealed" [sec, <https://ecom.md/en/blog/protectia-datelor-lege-195-2024>]                                                                                 | Owner to verify with CNPDCP             |
| It transposes the GDPR                                                                              | "transposes into national legislation the General Data Protection Regulation (GDPR)" [doc, CNPDCP conference page <https://datepersonale.md/en/national-conference-new-era-of-data-protection-implementation-of-gdpr/>] | Confirmed                               |
| Transparency (art. 12): what, why, how long, which rights; plain language                           | "Nu este necesară informarea prin texte juridice ample. Este suficient un mesaj clar, direct și formulat cu bună-credință" [doc, leaflet]                                                         | Confirmed — the draft follows it        |
| Rights requests answered within one month (art. 13–22)                                              | "Acest termen este de cel mult o lună de la primirea cererii" [doc, leaflet]                                                                                                                     | Confirmed                               |
| Records of processing (art. 30)                                                                     | Leaflet lists the fields [doc]                                                                                                                                                                     | Confirmed — owner must create it        |
| DPO (art. 37–39): mandatory only in some cases; recommended otherwise                               | Leaflet [doc]                                                                                                                                                                                      | Whether mandatory here: owner to verify |
| **No registration / notification to CNPDCP**                                                        | Register abolished under the old law by Law 175/2021 (in force 10 Jan 2022) [sec]; "There is no duty to register the store as a controller or notify the Centre" under 195/2024 [sec, ecom.md]     | **Owner to verify with CNPDCP**         |
| Breach notification to CNPDCP within 72 h; inform users if high risk (art. 33–34)                   | Leaflet names art. 33–34 [doc]; "within 72 hours" [sec, ecom.md]                                                                                                                                  | 72 h figure: owner to verify            |
| Transfers to the US (Vercel, Cloudflare, Google, maybe Neon)                                         | Old-law adequacy list (2022) did not include the US [sec]; no 195/2024 list found                                                                                                                 | **Owner to verify with CNPDCP**         |
| Cookie rule in Moldova                                                                              | "Law 195/2024 does not contain the word 'cookie'"; duties said to come from Law 284/2004 on e-commerce [sec, ecom.md]                                                                             | **Owner to verify** (all cookies here are strictly necessary, so exposure is low [inf]) |
| Fines phased: 10 % yr 1, 40 % yr 2, 100 % yr 3                                                      | [sec, ecom.md, clym.io]; CNPDCP: the law "is not built around fines" [doc, Moldpres]                                                                                                               | Owner to verify                         |
| Language of the notice (Romanian; Russian because the app ships `ru`)                                | [inf]                                                                                                                                                                                              | Owner to verify consumer-law language rules |

---

## (f) Cookie table (and similar technologies)

ePrivacy Directive 2002/58/EC Art. 5(3) (consolidated text,
<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219>): storage or access is allowed "only
… on condition that the subscriber or user concerned has given his or her consent", but this "shall not prevent any
technical storage or access … strictly necessary in order for the provider of an information society service
explicitly requested by the subscriber or user to provide the service" [doc]. WP29 Opinion 04/2012 (WP194) treats
authentication/session cookies and "user-centric security cookies" (e.g. detecting repeated failed logins) as
exempt when used only for that purpose with a minimal lifetime [sec: Proskauer, JISC summaries of WP194]. EDPB
Guidelines 2/2023 v2.0 (7 Oct 2024) extend Art. 5(3) beyond cookies to other reads of the device, e.g. scripts
[sec summary; primary: <https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf>].

| Name                          | Set by          | Purpose                                                       | Lifetime                                                                                     | Category                 | Evidence                                                                                          |
| ----------------------------- | --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `__Host-lemnaria_session`     | Lemnaria        | Keeps a signed-in user signed in; HttpOnly, Secure, SameSite=Lax | `Max-Age` = absolute session life: clients 90 d (idle end 30 d, server-side), staff 7 d (idle 12 h) | Strictly necessary (authentication) | [src] ADR 0169 D3; `apps/web/src/lib/server/account/session-cookie.ts`, `session-lifetimes.ts` |
| `__Host-lemnaria_visitor`     | Lemnaria        | Marks the browser that owns anonymous designs                 | 30 d, sliding on each save                                                                   | Strictly necessary (the user asked to keep a design) | [src] `apps/web/src/lib/server/visitor.ts:17,24`; ADR 0114                                   |
| `lemnaria_write_token_<id>`   | Lemnaria        | Lets only the owning browser edit that design; one per design, path-scoped | 30 d, sliding                                                                                | Strictly necessary       | [src] `apps/web/src/lib/server/write-token.ts:18,20`                                             |
| `NEXT_LOCALE`                 | Lemnaria (next-intl) | Remembers the chosen language; set only when it differs from the browser's language | Session (no `Max-Age` in next-intl 4.14.2 config or app config)                             | Strictly necessary / UI preference requested by the user [inf] | [src] `apps/web/src/i18n/routing.ts`; `next-intl/dist/esm/development/routing/config.js`, `middleware/syncCookie.js` |
| Turnstile challenge (no cookie in widget mode [inf]) | Cloudflare | Reads browser signals ("client IP address, TLS Fingerprint, User-Agent Header and Sitekey" [doc]) on register, login, reset | Per challenge                                                                                | Strictly necessary per Cloudflare: "The Signals collected by Turnstile are strictly necessary for this purpose" [doc] — see note | <https://www.cloudflare.com/turnstile-privacy-policy/>; <https://developers.cloudflare.com/turnstile/> |
| `cf_clearance`                | Cloudflare      | Only if **Pre-Clearance** is enabled: "stores the proof of challenge passed" [doc] | Not stated on Cloudflare's page [doc]; third parties report 30 min default [sec]            | Strictly necessary per Cloudflare's cookie page [doc] | <https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/> — **owner: confirm Pre-Clearance is off; then drop this row** |

No analytics, advertising or social cookies were found [src: grep for `@vercel/analytics`, `speed-insights`,
`localStorage`, `sessionStorage` in `apps/web/src` and `package.json` returned none other than the locale config].
Result: **no consent banner is required** for the cookies above [inf], but the table must be in the notice.

**Turnstile note [inf].** The processor function (blocking bots on the three forms the user asked to use) fits the
"strictly necessary … explicitly requested" exemption, and WP194's security-cookie reasoning supports it. The weak
point is Cloudflare's **own** use of the same signals to improve its product, which is not necessary for the
user's request. Mitigations already in place or recommended: load Turnstile only on register, login and reset
(ADR 0169 D5 [src]); disclose Cloudflare's controller role (done in §5). A lawyer should confirm (item 4 of the box
at the top). ADR 0169 already lists this as an M9 launch-gate line [src].

---

## Sources (fetched 2026-10-18)

Primary / authority:
- GDPR Art. 3, 13, 27 — <https://gdpr-info.eu/art-3-gdpr/>, <https://gdpr-info.eu/art-13-gdpr/>, <https://gdpr-info.eu/art-27-gdpr/>
- ePrivacy Directive consolidated — <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219>
- WP260 rev.01 (Transparency) — <https://www.edpb.europa.eu/system/files/2023-09/wp260rev01_en.pdf> (cited via summaries; PDF not parsed)
- EDPB Guidelines 2/2023 v2.0 — link above (cited via summary)
- ICO, Right to be informed — <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/>
- CNPDCP leaflet on Law 195/2024 — <https://datepersonale.md/wp-content/uploads/2026/03/Legea-nr.1952024.pdf> (read in full)
- CNPDCP conference page — <https://datepersonale.md/en/national-conference-new-era-of-data-protection-implementation-of-gdpr/>
- Moldpres (state agency) — <https://moldpres.md/eng/society/new-rules-on-personal-data-protection-enter-into-force-in-moldova-as-of-august-23>
- Cloudflare Turnstile Privacy Addendum — <https://www.cloudflare.com/turnstile-privacy-policy/>; Turnstile docs — <https://developers.cloudflare.com/turnstile/>; Cloudflare cookies — <https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/>; Cloudflare DPA — <https://www.cloudflare.com/cloudflare-customer-dpa/>
- Vercel DPA — <https://vercel.com/legal/dpa>; Neon schedule — <https://neon.com/dpa>

Secondary (used only where labelled [sec]):
- ECOM Moldova on Law 195/2024 — <https://ecom.md/en/blog/protectia-datelor-lege-195-2024>
- Clym on Law 195/2024 — <https://www.clym.io/regulations/law-no-195-2024-republic-of-moldova>
- Register abolition under Law 175/2021 — <https://monitorul.fisc.md/en/editorial/nimicirea-ireversibila-a-informatiei-din-registrul-de-evidenta-al-operatorilor-de-date-cu-caracter-personal.html>
- Old-law transfers page — <https://datepersonale.md/en/data-controller/data-transfers/>
- WP194 summaries — <https://privacylaw.proskauer.com/2012/06/articles/data-privacy-laws/european-data-protection-authorities-publish-guidelines-clarifying-exemptions-to-cookie-consent-requirement/>, <https://regulatorydevelopments.jiscinvolve.org/wp/?p=763>
- Neon sub-processors — <https://neon.com/subprocessors>; Google DPA scope — <https://workspace.google.com/terms/dpa_terms.html>
