# Gate O2 — the Russian, read beside its Romanian source

**What this is.** Every one of the **235** leaves of `apps/web/src/messages/ru.json` beside the
Romanian it was translated from, grouped by namespace and in the catalogues' own key order. It is
the review aid for Gate O2 (`docs/milestones/M6B-internationalization.md`, § *Gate O2*), produced by
wave 6B-i.

**What you are asked to check: the Russian wording, and only that.** Not the keys, not the ICU
syntax, not the plural categories, not the switcher's mechanics — those are engineering and they are
gated by tests. Read the right-hand column as sentences a customer will see, against the left-hand
column as the sentence they were meant to be.

> ## Gate O2 is CLOSED — approved by the owner, 2026-09-11
>
> In the owner's words: *"russian I checked looks ok, if in future I will found something to fix I
> will do this."*
>
> **The 235 leaves are approved as drafted.** That approval carries **F1** (the `other` branch names
> only fractions), **F2** (`globalSettings.appliesTo` phrased differently in the two languages),
> **F3** (`panel.countForSlot` reordered) and **F5** (the eleven deliberately identical leaves) — all
> four were Russian-wording questions and all four stand as written.
>
> **Two flags were product questions rather than translation ones, and they were put to the owner
> separately before this approval was recorded: F4** and **F6** (the eight translated decor names).
> Both were left as drafted.
>
> **F4 names a key that no longer exists, and the row below it is stale.** F4 was written against
> `configure.localeSwitch`, 6B-i's accessible name for the *link* to the other locale. ADR 0107
> decision 1 replaced that link with a dropdown built for N locales, and the key with
> **`configure.localeMenu`** — *"Limba interfeței: română. Schimbă limba"* / *"Язык интерфейса:
> русский. Сменить язык"*. The table below still shows the retired sentence. What the owner approved
> is **the key that ships**, `configure.localeMenu`, read in the running product; the stale row is
> recorded under *Consequences* in ADR 0107 and is one of the five listed there.
>
> **F6 is a live product risk rather than a closed one.** A customer or a supplier matching a decor
> against a printed sample works from the manufacturer's own name, and those names are now
> translated in Russian. **Re-open F6 if a supplier ever reads the Russian quote**; nothing
> automatic will catch it, as `docs/i18n/ro-catalogue-notes.md` already records.
>
> The wording below is now **approved copy, not a draft**. Changing a Russian value remains a value
> edit; changing a Romanian one remains O1-class, on the terms in *How to record a change*.

**How this file read while the gate was open.** No agent marked the Russian approved, and no agent
edited the Romanian to make a translation easier. Where the Romanian turned out not to translate
cleanly, it is flagged below rather than changed — the owner owns both languages and decided which
of the two bends.

**How to record a change.** Say the key and the new sentence. A Russian change is a value edit and
touches nothing else. **A Romanian change is an O1-class change**: the copy lock is updated in the
same commit, the golden-output harness is re-baselined for exactly those keys, and the Russian is
re-translated.

---

## What the wave changed, and what it is flagging

### Fixed — structural, and no rendered sentence moved

**Five Russian plurals were missing CLDR's `many` category.** Russian counts in four categories —
`one` (1, 21, 31…), `few` (2–4, 22–24…), `many` (0, 5–20, 25–30…) and `other` (fractions) — where
Romanian has three. All five Russian leaves carried Romanian's three, so every count from 5 upward
fell through to `other`. The repair is **purely additive**: each gained a `many` branch carrying the
exact text `other` was already resolving for those counts, so no sentence a customer can reach
changed. The affected keys are the five marked **F1**.

The catalogue parity gate had been *requiring* the defect — it asserted that both locales declare the
same branch list, which a correct Russian plural cannot. It now asserts that each locale declares
exactly its **own** locale's CLDR categories, and compares message bodies only for the categories the
two languages share.

**No other ICU defect was found.** Every Russian leaf carries the same arguments, the same number and
date formats, the same `select` branches and the same exact-value (`=0`, `=1`, …) branches as its
Romanian source, over all 235 leaves.

### Flagged — for you, not changed

**F1 — the `other` branch of every Russian plural now names only fractions, and still reads as a
plural.** With `many` present, `other` is reached only by a fractional count (1.5, 2.5). Russian
wants the genitive *singular* there — `1,5 шкафа`, not `1,5 шкафов`. Nothing in this product ever
passes a fractional count, so the branch is unreachable today and was left exactly as drafted rather
than reworded on an agent's judgement. Change it if you want it right on paper.

**F2 — `globalSettings.appliesTo` says something slightly different in the two languages.** The
Romanian singular branch names no number — *"Se aplică singurului dulap din bucătărie"* — while the
Russian one does: *"Применяется к 1 шкафу на кухне"*. Both are correct sentences; they are not the
same sentence. Confirm which you want.

**F3 — `panel.countForSlot` reorders the sentence.** Romanian leads with the count
(*"2 dulapuri intră în 900 × 720 mm"*); the Russian leads with the opening
(*"В проём 900 × 720 мм помещаются 2 шкафа"*). That is idiomatic Russian rather than a mistake, but
it is a translator's choice and it is yours to keep or reject.

**F4 — `configure.localeSwitch` is new copy, in both languages, written by this wave.** The language
control needed an accessible name; `RO` read aloud names neither the language of the page nor the
language the link leads to. **Its Romanian has not been through Gate O1** — please read it as O1 copy
as well as reading the Russian.

**F5 — eleven leaves are byte-identical in the two files, and every one is deliberate**: the wordmark
`Lemnaria`, the hardware brand names, `Push-to-open`, and eight leaves that are pure ICU templates
with no words in them at all (`{amount} MDL`, `{step, number}/{totalSteps, number}`, the settings
pill's joins). They are marked so their sameness reads as a decision rather than as an omission.

**F6 — the decor names are translated, and that is the one open product question in this file.**
`Stejar Bardolino Natur` became `Дуб Бардолино натуральный`, `Gri Havanna` became `Серый Гавана`, and
so on for all eight. These are the board manufacturer's own product names, not descriptions — a
customer or a supplier matching a decor against a sample or an order works from the printed name.
Three answers are possible and only you can pick one: translate (as drafted), transliterate, or keep
the manufacturer's Latin name in both languages. `docs/i18n/ro-catalogue-notes.md` already recorded
that these names sit outside every automatic check.

---

## The 235 leaves

### brand — the wordmark

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `brand` | Lemnaria | Lemnaria | F5 |

### meta — the page title and description

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `meta.title` | {brand} — configurator bucătărie | {brand} — конфигуратор кухни |  |
| `meta.description` | Configurează-ți bucătăria direct în model. | Настрой свою кухню прямо в модели. |  |

### configure — the configurator screen and its top bar

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `configure.step` | Pasul {step, number} din {totalSteps, number} | Шаг {step, number} из {totalSteps, number} |  |
| `configure.stepPill` | {step, number}/{totalSteps, number} | {step, number}/{totalSteps, number} | F5 |
| `configure.title` | Configurare | Конфигуратор |  |
| `configure.locale` | RO | RU |  |
| `configure.localeSwitch` | Limba interfeței: română. Comută în rusă | Язык интерфейса: русский. Переключить на румынский | F4 |
| `configure.back` | Cameră | Комната |  |
| `configure.orbitHint` | Atinge un dulap pentru a-l edita · trage pentru a roti | Коснись шкафа, чтобы изменить его · проведи пальцем, чтобы повернуть |  |
| `configure.cameraGroupLabel` | Vedere cameră | Вид комнаты |  |
| `configure.cameraPresets.overview` | Vedere generală | Общий вид |  |
| `configure.cameraPresets.wallA` | Perete A | Стена A |  |
| `configure.cameraPresets.wallB` | Perete B | Стена B |  |
| `configure.loading` | Se încarcă modelul 3D… | Загрузка 3D-модели… |  |
| `configure.overflowWarning` | Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap. | Отмеченные шкафы выходят за пределы стены. Измени их ширину или удали один из шкафов. |  |
| `configure.backAction` | Înapoi | Назад |  |
| `configure.reviewCta` | Verifică designul | Проверить дизайн |  |

### panel — §9's editor sheet

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `panel.close` | Închide panoul | Закрыть панель |  |
| `panel.done` | Gata | Готово |  |
| `panel.remove` | Elimină dulapul | Удалить шкаф |  |
| `panel.headerMeta` | Perete {wall} · {bandLabel} · {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm | Стена {wall} · {bandLabel} · {widthMm, number, ::group-off} × {heightMm, number, ::group-off} мм |  |
| `panel.replaceTitleOccupied` | Înlocuiește | Заменить |  |
| `panel.replaceTitleEmpty` | Adaugă aici un dulap | Добавить сюда шкаф |  |
| `panel.bandWords.base.one` | bază | нижнего типа |  |
| `panel.bandWords.base.many` | baze | нижнего типа |  |
| `panel.bandWords.wall.one` | suspendat | навесного типа |  |
| `panel.bandWords.wall.many` | suspendate | навесного типа |  |
| `panel.bandWords.column.one` | coloană | типа «колонна» |  |
| `panel.bandWords.column.many` | coloane | типа «колонна» |  |
| `panel.countForBody` | {count, plural, one {# dulap} few {# dulapuri} other {# dulapuri}} {bandWord} de {widthMm, number, ::group-off} | {count, plural, one {# шкаф} few {# шкафа} many {# шкафов} other {# шкафов}} {bandWord} шириной {widthMm, number, ::group-off} | F1 |
| `panel.countForSlot` | {count, plural, one {# dulap} few {# dulapuri} other {# dulapuri}} intră în {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm | В проём {widthMm, number, ::group-off} × {heightMm, number, ::group-off} мм {count, plural, one {помещается # шкаф} few {помещаются # шкафа} many {помещаются # шкафов} other {помещаются # шкафов}} | F1, F3 |
| `panel.noOffersForBody` | Niciun alt dulap {bandWord} nu încape aici. Șterge dulapul actual, pentru a obține mai mult spațiu. | Здесь не помещается ни один другой шкаф {bandWord}. Удали текущий шкаф, чтобы освободить больше места. |  |
| `panel.noOffersForSlot` | Niciun dulap din catalog nu intră în {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm. Șterge un dulap vecin ca să obții mai mult spațiu. | В проём {widthMm, number, ::group-off} × {heightMm, number, ::group-off} мм не помещается ни один шкаф из каталога. Удали соседний шкаф, чтобы освободить больше места. |  |
| `panel.noOffersTooWide` | Spațiul liber are {widthMm, number, ::group-off} mm, mai mult decât cel mai lat dulap din catalog ({maxWidthMm, number, ::group-off} mm). Niciun dulap nu poate ocupa tot spațiul liber existent. O parte din spațiul liber poate rămâne goală, sau îl poți împărți adăugând un alt dulap lângă el. | Свободное пространство имеет ширину {widthMm, number, ::group-off} мм — это больше ширины самого широкого шкафа в каталоге ({maxWidthMm, number, ::group-off} мм). Ни один шкаф не может занять всё имеющееся свободное пространство. Часть пространства можно оставить пустой или разделить его, добавив рядом ещё один шкаф. |  |
| `panel.noOffersTooNarrow` | Spațiul liber are {widthMm, number, ::group-off} mm, mai puțin decât cel mai îngust dulap din catalog ({minWidthMm, number, ::group-off} mm). Spațiul poate rămâne gol; se închide pe măsură ce lărgești dulapul de lângă el. | Свободное пространство имеет ширину {widthMm, number, ::group-off} мм — это меньше ширины самого узкого шкафа в каталоге ({minWidthMm, number, ::group-off} мм). Пространство можно оставить пустым; оно закроется по мере увеличения ширины соседнего шкафа. |  |
| `panel.offerSize` | {widthMm, number, ::group-off} × {heightMm, number, ::group-off} mm | {widthMm, number, ::group-off} × {heightMm, number, ::group-off} мм |  |
| `panel.currentBadge` | Actual | Текущий |  |
| `panel.probeUnavailable` | Modelul 3D se pregătește — poți alege în câteva momente. | 3D-модель подготавливается — через несколько секунд ты сможешь сделать выбор. |  |
| `panel.readOnlyNotice` | Poți vedea această configurație, dar nu o poți modifica din acest browser. | Ты можешь просматривать эту конфигурацию, но не можешь изменять её в этом браузере. |  |
| `panel.readOnlyReason` | Doar vizualizare | Только просмотр |  |
| `panel.accessCheckingNotice` | Se verifică dacă poți modifica această configurație. Până atunci o poți doar vedea. | Проверяем, можешь ли ты изменять эту конфигурацию. Пока её можно только просматривать. |  |
| `panel.accessCheckingReason` | Se verifică accesul | Проверка доступа |  |
| `panel.accessUncheckableNotice` | Nu am reușit să verific dacă poți modifică această configurație. Până când verificarea reușește o poți doar vizualiza — o modificare făcută acum nu s-ar salva. | Не удалось проверить, можешь ли ты изменять эту конфигурацию. Пока проверка не завершится успешно, её можно только просматривать — внесённое сейчас изменение не сохранится. |  |
| `panel.accessUncheckableReason` | Acces neverificat | Доступ не проверен |  |
| `panel.accessRetryLabel` | Încearcă din nou | Попробовать снова |  |
| `panel.saveConflictNotice` | Această configurație a fost modificată în altă filă sau pe alt dispozitiv, așa că modificarea ta nu a fost salvată. Reîncarcă pentru a vedea versiunea salvată — se pierde ce ai schimbat aici — sau înlocuiește cu ce vezi acum, iar cealaltă versiune se pierde. | Эта конфигурация была изменена в другой вкладке или на другом устройстве, поэтому твоё изменение не сохранилось. Перезагрузи страницу, чтобы увидеть сохранённую версию — тогда внесённые здесь изменения будут потеряны. Или замени сохранённую версию тем, что сейчас видишь на экране, — тогда будет потеряна другая версия. |  |
| `panel.saveConflictReloadLabel` | Reîncarcă versiunea salvată | Загрузить сохранённую версию |  |
| `panel.saveConflictOverwriteLabel` | Înlocuiește cu ce vezi acum | Заменить тем, что сейчас на экране |  |
| `panel.readOnlyRefusedNotice` | Modificarea nu a fost salvată: acest browser nu poate modifica această configurație. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă dacă vrei să faci modificări pe care le poți salva. | Изменение не сохранено: этот браузер не может изменять данную конфигурацию. То, что ты видишь на экране, не сохранено и будет потеряно, если закрыть или перезагрузить страницу. Открой конфигуратор в новой вкладке, если хочешь внести изменения, которые можно сохранить. |  |
| `panel.saveFailedNotice` | Modificarea este aplicată pe ecran și încercăm în continuare să o salvăm. Nu o schimba și nu reîncărca pagina: o reîncărcare acum ar șterge versiunea care așteaptă să fie salvată. | Изменение применено на экране, и мы продолжаем попытки сохранить его. Не вноси новых изменений и не перезагружай страницу: перезагрузка сейчас удалит версию, ожидающую сохранения. |  |
| `panel.saveStoppedNotice` | Salvarea s-a oprit pentru această configurație și nu va reporni singură. Ce vezi pe ecran nu este salvat și se pierde dacă închizi sau reîncarci pagina. Deschide configuratorul într-o filă nouă și reia modificările acolo. | Сохранение этой конфигурации остановлено и не возобновится автоматически. То, что ты видишь на экране, не сохранено и будет потеряно, если закрыть или перезагрузить страницу. Открой конфигуратор в новой вкладке и повтори изменения там. |  |
| `panel.finishTitle` | Finisaje | Отделка |  |
| `panel.finishApproximationNote` | Culoarea de pe ecran și cea din vizualizare sunt orientative — nuanța finală se alege pe mostra fizică. | Цвета на экране и в визуализации являются ориентировочными — окончательный оттенок выбирается по физическому образцу. |  |
| `panel.finishPickerLabel` | Alege culoarea | Выбрать цвет |  |
| `panel.handleTitle` | Mâner | Ручка |  |
| `panel.handleLabels.steel` | Bară inox | Ручка-рейлинг из нержавеющей стали |  |
| `panel.handleLabels.black` | Bară neagră | Чёрная ручка-рейлинг |  |
| `panel.handleLabels.push` | Push-to-open | Push-to-open | F5 |
| `panel.handleDefaultNote` | Implicit pentru acest dulap: {label}. | По умолчанию для этого шкафа: {label}. |  |
| `panel.widthTitle` | Lățime | Ширина |  |
| `panel.widthValue` | {widthMm, number, ::group-off} mm | {widthMm, number, ::group-off} мм |  |
| `panel.widthStepLabels.narrower` | −50 mm | −50 мм |  |
| `panel.widthStepLabels.wider` | +50 mm | +50 мм |  |
| `panel.widthStepAriaLabels.narrower` | Micșorează lățimea cu 50 mm | Уменьшить ширину на 50 мм |  |
| `panel.widthStepAriaLabels.wider` | Mărește lățimea cu 50 mm | Увеличить ширину на 50 мм |  |
| `panel.widthStepNote` | Lățimea se schimbă din 50 în 50 mm, mutând latura dulapului din contul spațiului liber alăturat — întâi spre dreapta, apoi spre stânga. Când un buton este gri, sub el scrie de ce. | Ширина меняется с шагом 50 мм: боковая стенка шкафа сдвигается за счёт соседнего свободного пространства — сначала справа, затем слева. Если кнопка неактивна, причина указана под ней. |  |
| `panel.widthChoiceNote` | Coloana e formată din lățimile afișate, așa că alegi una dintre ele în loc să reglezi din 50 în 50 mm. Alegerea schimbă lățimea întregii coloane, nu doar a acestui dulap. | Шкаф-колонна доступен только в указанных вариантах ширины, поэтому выбери один из них вместо регулировки с шагом 50 мм. Выбор изменит ширину всей колонны, а не только этого шкафа. |  |
| `panel.structuralTitle` | Dulap structural | Шкаф — часть конструкции |  |
| `panel.structuralReasons.corner` | Dulapul din colț nu poate fi înlocuit, șters sau redimensionat. Alege un dulap de lângă el. | Угловой шкаф нельзя заменить, удалить или изменить его размер. Выбери соседний шкаф. |  |
| `panel.finishFollowsKitchen` | Culoarea bucătăriei | Цвет кухни |  |

### price — the price bar

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `price.startingPrefix` | De la | От |  |
| `price.amountWithCurrency` | {amount} MDL | {amount} MDL | F5 |
| `price.overflowingTotalWarning` | Prețul include și dulapurile ce depășesc mărimea peretelui și necesită ajustări | Цена также включает шкафы, которые выходят за пределы стены и требуют корректировки |  |
| `price.emptyKitchenPrompt` | Pentru a afișa un preț estimativ adaugă-ți cel puțin un dulap din catalog | Чтобы увидеть ориентировочную цену, добавь хотя бы один шкаф из каталога |  |

### priceBreakdown — the itemised breakdown

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `priceBreakdown.title` | De ce acest preț? | Почему такая цена? |  |
| `priceBreakdown.disclaimer` | Prețul afișat este estimativ. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare. | Указанная цена является ориентировочной. Она не включает доставку, столешницу и бытовую технику — окончательная сумма определяется после замеров. |  |
| `priceBreakdown.note` | Pretul afișat este estimativ. Nu reprezintă o ofertă comercială finală. Oferta comercială finală se stabilește doar după măsurarile exacte. | Указанная цена является ориентировочной и не представляет собой окончательное коммерческое предложение. Окончательное коммерческое предложение составляется только после точных замеров. |  |
| `priceBreakdown.close` | Închide | Закрыть |  |
| `priceBreakdown.placementLabel` | {bodyLabel} {widthMm, number, ::group-off} | {bodyLabel} {widthMm, number, ::group-off} | F5 |
| `priceBreakdown.groupHeading` | Perete {wall} · {bandWord} | Стена {wall} · {bandWord} |  |
| `priceBreakdown.bandHeadings.base` | bază | нижние шкафы |  |
| `priceBreakdown.bandHeadings.wall` | suspendate | навесные шкафы |  |
| `priceBreakdown.bandHeadings.column` | coloane | шкафы-колонны |  |
| `priceBreakdown.wholeKitchenLabel` | {categoryWord} · {tierName} | {categoryWord} · {tierName} | F5 |
| `priceBreakdown.wholeKitchenCategories.accessory` | Accesorii | Аксессуары |  |
| `priceBreakdown.wholeKitchenCategories.hardware` | Feronerie | Фурнитура |  |
| `priceBreakdown.wholeKitchenCategories.material` | Material | Материал |  |
| `priceBreakdown.included` | inclus | включено |  |

### globalSettings — the settings pill and its sheet

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `globalSettings.open` | Setări globale | Общие настройки |  |
| `globalSettings.title` | Setări pentru toată bucătăria | Настройки всей кухни |  |
| `globalSettings.appliesTo` | Se aplică {bodyCount, plural, one {singurului dulap din bucătărie} few {tuturor celor # dulapuri} other {tuturor celor # dulapuri}}. Nu se setează pentru fiecare dulap în parte. | Применяется {bodyCount, plural, one {к # шкафу} few {к # шкафам} many {к # шкафам} other {к # шкафам}} на кухне. Не настраивается отдельно для каждого шкафа. | F1, F2 |
| `globalSettings.groupHeadings.material` | Material corp și fronturi | Материал корпуса и фасадов |  |
| `globalSettings.groupHeadings.hardware` | Feronerie | Фурнитура |  |
| `globalSettings.groupAnchors.material` | Față de materialul inclus | По сравнению с включённым материалом |  |
| `globalSettings.groupAnchors.hardware` | Față de feroneria inclusă | По сравнению с включённой фурнитурой |  |
| `globalSettings.tierDelta` | de la {addedAmount} | от {addedAmount} |  |
| `globalSettings.materialWarning` | Schimbarea materialului recalculează întreaga estimare. | При смене материала вся предварительная стоимость будет пересчитана. |  |
| `globalSettings.depthHeading` | Adâncimea dulapurilor | Глубина шкафов |  |
| `globalSettings.depthOption` | {cabinetDepthMm, number, ::group-off} mm | {cabinetDepthMm, number, ::group-off} мм |  |
| `globalSettings.depthWarning` | Schimbarea adâncimii blatului reconstruiește toate dulapurile și schimbă prețul acestora. | Изменение глубины столешницы перестроит все шкафы и изменит их цену. |  |
| `globalSettings.depthNote` | Adâncimea blatului nu schimbă prețul bucătăriei — doar dimensiunile dulapurilor. | Глубина столешницы не влияет на цену кухни — меняются только размеры шкафов. |  |
| `globalSettings.colourHeading` | Culoarea bucătăriei | Цвет кухни |  |
| `globalSettings.colourNote` | Culoarea nu schimbă prețul bucătăriei. Dulapurile cu o culoare aleasă rămân neschimbate. | Цвет не меняет цену кухни. Шкафы с выбранным цветом остаются без изменений. |  |
| `globalSettings.colourWarning` | Fiecare material are propriile culori, așa că la schimbarea materialului culoarea bucătăriei devine cea implicită a materialului nou. | У каждого материала свои цвета, поэтому при смене материала цвет кухни становится цветом нового материала по умолчанию. |  |
| `globalSettings.apply` | Aplică | Применить |  |
| `globalSettings.cancel` | Renunță | Отмена |  |
| `globalSettings.materialResetConfirm.title` | Culorile alese se vor pierde | Выбранные цвета будут потеряны |  |
| `globalSettings.materialResetConfirm.body` | Ai ales alte culori pentru {chosenCount, plural, one {# dulap} few {# dulapuri} other {# dulapuri}}. Fiecare material are propriile culori disponibile, iar la modificarea lui e setată culoarea implicită a materialului nou. | Для {chosenCount, plural, one {# шкафа} few {# шкафов} many {# шкафов} other {# шкафов}} выбраны другие цвета. Для каждого материала доступны свои цвета, а при его изменении устанавливается цвет нового материала по умолчанию. | F1 |
| `globalSettings.materialResetConfirm.globalBody` | Ai ales o culoare pentru toată bucătăria. Fiecare material are propriile culori disponibile, iar la modificarea lui e setată culoarea implicită a materialului nou. | Ты выбрал цвет для всей кухни. Для каждого материала доступны свои цвета, а при его изменении устанавливается цвет нового материала по умолчанию. |  |
| `globalSettings.materialResetConfirm.confirm` | Schimbă materialul | Сменить материал |  |
| `globalSettings.materialResetConfirm.back` | Păstrează culorile | Сохранить цвета |  |
| `globalSettings.applyRefused` | Nu am putut aplica „{settingName}”: {reason} Nimic nu a fost schimbat. | Не удалось применить «{settingName}»: {reason} Ничего не изменено. |  |
| `globalSettings.pillMaterial` | {tierName} | {tierName} | F5 |
| `globalSettings.pillColourValue` | {colourValue} | {colourValue} | F5 |
| `globalSettings.pillHardware` | {categoryWord} {tierName} | {categoryWord} {tierName} | F5 |
| `globalSettings.pillDepth` | Adâncime {cabinetDepthMm, number, ::group-off} | Глубина {cabinetDepthMm, number, ::group-off} |  |
| `globalSettings.pillNameAllSettings` | {openLabel}: {settings} | {openLabel}: {settings} | F5 |
| `globalSettings.pillNameJoin` | ,  | ,  | F5 |

### webglUnavailable — the no-3D notice

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `webglUnavailable.titleMobile` | Dispozitivul acesta nu poate afișa 3D | Это устройство не поддерживает отображение 3D |  |
| `webglUnavailable.titleDesktop` | Browserul acesta nu poate afișa 3D | Этот браузер не поддерживает отображение 3D |  |
| `webglUnavailable.bodyMobile` | Configurarea se face direct în model, așa că nu putem continua fără 3D. Deschide configuratorul pe alt telefon sau pe calculator — sau lasă-ne datele și îl configurăm împreună. | Настройка выполняется прямо в модели, поэтому без 3D продолжить невозможно. Открой конфигуратор на другом телефоне или компьютере — либо оставь свои контактные данные, и мы настроим кухню вместе. |  |
| `webglUnavailable.bodyDesktop` | Configurarea se face direct în model, așa că nu putem continua fără 3D. Încearcă alt browser sau activează accelerarea grafică — ori lasă-ne datele și îl configurăm împreună. | Настройка выполняется прямо в модели, поэтому без 3D продолжить невозможно. Попробуй другой браузер или включи аппаратное ускорение — либо оставь свои контактные данные, и мы настроим кухню вместе. |  |
| `webglUnavailable.emailLink` | Trimite-mi linkul pe e-mail | Отправить мне ссылку по электронной почте |  |
| `webglUnavailable.contactLink` | Vreau să mă contactați | Хочу, чтобы вы со мной связались |  |
| `webglUnavailable.noFakePreview` | Nu afișăm o previzualizare statică falsă: fără 3D nu există configurare reală, deci nici preț. | Мы не показываем фиктивное статичное изображение: без 3D нельзя по-настоящему настроить кухню, а значит, нельзя рассчитать цену. |  |

### designLoadError — a shared link that will not open

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `designLoadError.title` | Nu am putut deschide acest link | Не удалось открыть эту ссылку |  |
| `designLoadError.bodyNotFound` | Linkul acesta nu mai corespunde niciunei configurații salvate. Posibil că a fost ștearsă sau linkul este invalid. | Эта ссылка больше не соответствует ни одной сохранённой конфигурации. Возможно, она была удалена или ссылка недействительна. |  |
| `designLoadError.bodyInvalid` | Linkul acesta nu poate întoarce nici o configurare validă. Ne pare rău. | По этой ссылке невозможно получить корректную конфигурацию. Нам очень жаль. |  |
| `designLoadError.startOver` | Începe o configurare nouă | Начать новую конфигурацию |  |

### contactPlaceholder — the contact step placeholder

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `contactPlaceholder.title` | Formularul de contact urmează | Форма обратной связи появится позже |  |
| `contactPlaceholder.body` | Pagina de contact nu este încă disponibilă în această versiune a configuratorului. | Страница обратной связи пока недоступна в этой версии конфигуратора. |  |
| `contactPlaceholder.back` | Înapoi la configurare | Вернуться к конфигурации |  |

### band — the four cabinet rows

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `band.base` | bază | нижний ряд |  |
| `band.wall` | suspendat | навесной ряд |  |
| `band.top` | rând de sus | верхний ряд |  |
| `band.column` | coloană | шкаф-колонна |  |

### finish — the decor and veneer names

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `finish.pal.alb` | Alb | Белый | F6 |
| `finish.pal.stejar-bardolino` | Stejar Bardolino Natur | Дуб Бардолино натуральный | F6 |
| `finish.pal.stejar-halifax` | Stejar Halifax Natur | Дуб Галифакс натуральный | F6 |
| `finish.pal.antracit` | Antracit | Антрацит | F6 |
| `finish.pal.gri-havanna` | Gri Havanna | Серый Гавана | F6 |
| `finish.pal.nuc-warmia` | Nuc Warmia Maro | Орех Вармия коричневый | F6 |
| `finish.veneer.stejar` | Stejar | Дуб | F6 |
| `finish.veneer.nuc` | Nuc | Орех | F6 |

### priceBook — the price book's own prose

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `priceBook.hardware.standard.name` | Standard | Стандарт |  |
| `priceBook.hardware.standard.description` | Balamale și glisiere fără amortizare, închidere simplă. | Петли и направляющие без доводчика, обычное закрывание. |  |
| `priceBook.hardware.soft-close.description` | Balamale și glisiere cu amortizare, de la Hettich. | Петли и направляющие с доводчиком, от Hettich. |  |
| `priceBook.hardware.premium.description` | Balamale și glisiere cu amortizare, de la Blum. | Петли и направляющие с доводчиком, от Blum. |  |
| `priceBook.material.melamine.name` | PAL melaminat | ЛДСП |  |
| `priceBook.material.melamine.description` | Materialul standard al bucătăriei. | Стандартный материал кухни. |  |
| `priceBook.material.painted-mdf.name` | MDF vopsit mat | МДФ, матовая покраска |  |
| `priceBook.material.painted-mdf.description` | Fronturi din MDF vopsit mat, pentru toată bucătăria. | Фасады из МДФ с матовой покраской, для всей кухни. |  |
| `priceBook.material.veneer.name` | Furnir natural | Натуральный шпон |  |
| `priceBook.material.veneer.description` | Fronturi furniruite natural, pentru toată bucătăria. | Фасады из натурального шпона, для всей кухни. |  |
| `priceBook.accessory.sink-protective-cover.name` | Protecție de aluminiu pentru corpul spălătorului | Алюминиевая защита для корпуса мойки |  |
| `priceBook.accessory.sink-protective-cover.description` | Montată în corpul spălătorului, împotriva umidității și a scurgerilor. | Устанавливается в корпусе мойки, защищает от влаги и протечек. |  |
| `priceBook.accessory.dish-drying-rack.name` | Uscător de vase | Сушилка для посуды |  |
| `priceBook.accessory.dish-drying-rack.description` | Montat în corpul suspendat de deasupra spălătorului. | Устанавливается в навесном шкафу над мойкой. |  |

### catalog — cabinet names

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `catalog.emptySlot` | Spațiu liber | Свободное место |  |
| `catalog.unknownKind` | Dulap | Шкаф |  |
| `catalog.bodyLabelWithDoors` | {name} {doors, plural, one {# ușă} few {# uși} other {# uși}} | {name} {doors, plural, one {с # дверцей} few {с # дверцами} many {с # дверцами} other {с # дверцами}} | F1 |
| `catalog.kinds.base_cabinet` | Dulap bază | Нижний шкаф |  |
| `catalog.kinds.dishwasher_housing` | Nișă mașină de spălat vase | Ниша для посудомоечной машины |  |
| `catalog.kinds.induction_cooktop` | Plită cu inducție | Индукционная варочная панель |  |
| `catalog.kinds.tall_unit` | Coloană | Шкаф-колонна |  |
| `catalog.kinds.fridge_housing` | Nișă frigider integrat | Ниша для встроенного холодильника |  |
| `catalog.kinds.fridge_freestanding` | Frigider | Холодильник |  |
| `catalog.kinds.wall_cabinet` | Dulap suspendat | Навесной шкаф |  |
| `catalog.kinds.open_shelf_unit` | Etajeră deschisă | Открытый стеллаж |  |
| `catalog.kinds.extractor_hood` | Hotă | Вытяжка |  |
| `catalog.kinds.corner_base_x` | Dulap bază de colț | Угловой нижний шкаф |  |
| `catalog.kinds.corner_base_return` | Racord bază de colț | Угловая нижняя примыкающая секция |  |
| `catalog.kinds.corner_wall_return` | Dulap suspendat de colț | Угловой навесной шкаф |  |
| `catalog.kinds.corner_wall_return_top` | Dulap de colț {rowWord} | Угловой шкаф, {rowWord} |  |
| `catalog.entries.base-cabinet` | Dulap bază | Нижний шкаф |  |
| `catalog.entries.base-3drawer` | Dulap bază 3 sertare | Нижний шкаф с 3 ящиками |  |
| `catalog.entries.base-panbank` | Sertare pentru oale | Ящики для кастрюль |  |
| `catalog.entries.base-hob-2drawer` | Dulap plită și 2 sertare | Шкаф под варочную панель с 2 ящиками |  |
| `catalog.entries.base-hob-oven` | Dulap plită și cuptor | Шкаф под варочную панель и духовку |  |
| `catalog.entries.base-bottle-cargo` | Cargo îngust pentru sticle | Узкая бутылочница (карго) |  |
| `catalog.entries.base-sink` | Dulap spălător | Шкаф под мойку |  |
| `catalog.entries.base-dishwasher` | Nișă mașină de spălat vase | Ниша для посудомоечной машины |  |
| `catalog.entries.wall-cabinet` | Dulap suspendat | Навесной шкаф |  |
| `catalog.entries.wall-lift` | Dulap suspendat rabatabil | Навесной шкаф с подъёмным фасадом |  |
| `catalog.entries.open-shelf` | Etajeră deschisă | Открытый стеллаж |  |
| `catalog.entries.hood` | Hotă | Вытяжка |  |
| `catalog.entries.tall-pantry` | Coloană cămară | Шкаф-колонна для хранения |  |
| `catalog.entries.tall-oven-tower` | Coloană cuptor + microunde | Шкаф-колонна для духовки и микроволновой печи |  |
| `catalog.entries.tall-fridge-housing` | Nișă frigider integrat | Ниша для встроенного холодильника |  |
| `catalog.entries.fridge-free` | Frigider, liber | Отдельностоящий холодильник |  |

### rejection — every refusal sentence

| Key | Romanian (approved) | Russian (draft) | ⚑ |
| --- | --- | --- | --- |
| `rejection.VOID_SELECTED` | Aici nu se află niciun dulap. | Здесь нет шкафа. |  |
| `rejection.TARGET_NOT_FOUND` | Selecția nu mai există. Alege din nou un dulap sau un spațiu liber. | Выбранный элемент больше не существует. Снова выбери шкаф или свободное место. |  |
| `rejection.INVALID_OCCURRED_AT` | Momentul modificării nu este valid, așa că nu am salvat nimic. | Время изменения указано некорректно, поэтому мы ничего не сохранили. |  |
| `rejection.BODY_PROBE_UNAVAILABLE` | Modelul 3D nu este încă pregătit, așa că nu pot adăuga un dulap. Încearcă din nou în câteva momente. | 3D-модель ещё не готова, поэтому добавить шкаф пока невозможно. Повтори попытку через несколько секунд. |  |
| `rejection.ACCESSORY_NOT_DELETABLE` | „{label}” face parte din dulapul de sub ea și nu poate fi ștearsă separat. | «{label}» является частью расположенного под ней шкафа, поэтому её нельзя удалить отдельно. |  |
| `rejection.NOT_DELETABLE` | „{label}” face parte din structura bucătăriei și nu poate fi șters. | «{label}» является частью конструкции кухни, поэтому его нельзя удалить. |  |
| `rejection.NOT_IN_LIBRARY` | Dulapul acesta nu există în catalog. | Этого шкафа нет в каталоге. |  |
| `rejection.NOT_INSERTABLE` | „{label}” face parte din configurația inițială și nu poate fi adăugat din catalog. | «{label}» является частью исходной конфигурации, поэтому его нельзя добавить из каталога. |  |
| `rejection.TARGET_NOT_REPLACEABLE` | „{label}” face parte din structura bucătăriei și nu poate fi înlocuit. | «{label}» является частью конструкции кухни, поэтому его нельзя заменить. |  |
| `rejection.BAND_MISMATCH` | {slotBand, select, base {„{label}” este un dulap suspendat: nu are soclu și nici blat, deci nu poate sta pe podea.} other {„{label}” este un dulap de bază și nu poate fi montat pe perete. Doar coloanele pot depăși un nivel.}} | {slotBand, select, base {«{label}» — навесной шкаф: у него нет ни цоколя, ни столешницы, поэтому его нельзя поставить на пол.} other {«{label}» — нижний шкаф, и его нельзя установить на стену. Только шкафы-колонны могут занимать больше одного уровня.}} |  |
| `rejection.WIDTH_TOO_LARGE` | „{label}” are {requiredMm, number, ::group-off} mm lățime, iar spațiul liber are doar {availableMm, number, ::group-off} mm. | Ширина «{label}» составляет {requiredMm, number, ::group-off} мм, а ширина свободного пространства — всего {availableMm, number, ::group-off} мм. |  |
| `rejection.WIDTH_TOO_SMALL` | „{label}” are nevoie de cel puțin {requiredMm, number, ::group-off} mm lățime, iar spațiul liber are doar {availableMm, number, ::group-off} mm. | Для «{label}» требуется ширина не менее {requiredMm, number, ::group-off} мм, а ширина свободного пространства — всего {availableMm, number, ::group-off} мм. |  |
| `rejection.WIDTH_TOO_SMALL_UNKNOWN_FLOOR` | „{label}” nu poate fi adăugat: lățimea minimă din catalog nu este o valoare validă. | Невозможно добавить «{label}»: минимальная ширина в каталоге указана неверно. |  |
| `rejection.WIDTH_NOT_SUPPORTED_NO_WIDTH` | „{label}” nu poate fi construit la nicio lățime pe care o acceptă și dulapurile de deasupra. | «{label}» невозможно изготовить ни в одной ширине, которая также поддерживается расположенными выше шкафами. |  |
| `rejection.WIDTH_NOT_SUPPORTED_COLUMN` | „{label}” este într-o coloană care se face {widthsMadeClause}, iar acum are {availableMm, number, ::group-off} mm. | Колонна с «{label}» изготавливается {widthsMadeClause}, а сейчас имеет ширину {availableMm, number, ::group-off} мм. |  |
| `rejection.WIDTH_NOT_SUPPORTED_BODY` | „{label}” se face {widthsMadeClause}, iar spațiul liber are {availableMm, number, ::group-off} mm. | «{label}» изготавливается {widthsMadeClause}, а ширина свободного пространства составляет {availableMm, number, ::group-off} мм. |  |
| `rejection.OPENING_TOO_SHORT` | Spațiul liber are doar {availableMm, number, ::group-off} mm înălțime; sub {minimumMm, number, ::group-off} mm nu se poate încadra un dulap. | Высота свободного пространства — всего {availableMm, number, ::group-off} мм; в проём высотой менее {minimumMm, number, ::group-off} мм шкаф не помещается. |  |
| `rejection.HEIGHT_EXCEEDS_LEVEL` | „{label}” are {requiredMm, number, ::group-off} mm înălțime și nu încape pe acest nivel de {availableMm, number, ::group-off} mm. Doar coloanele pot depăși un nivel. | Высота «{label}» составляет {requiredMm, number, ::group-off} мм, поэтому он не помещается на этом уровне высотой {availableMm, number, ::group-off} мм. Только шкафы-колонны могут занимать больше одного уровня. |  |
| `rejection.HEIGHT_TOO_LARGE` | „{label}” are {requiredMm, number, ::group-off} mm înălțime, iar spațiul liber are {availableMm, number, ::group-off} mm. | Высота «{label}» составляет {requiredMm, number, ::group-off} мм, а высота свободного пространства — {availableMm, number, ::group-off} мм. |  |
| `rejection.NO_SNAP_POSITION` | „{label}” nu poate fi adăugat la nici un nivel al acestei coloane. Verifică dacă înălțimea este corectă și dacă spațiul liber are suficientă înălțime. | «{label}» нельзя добавить ни на один уровень этой колонны. Проверь правильность высоты и убедись, что свободного пространства по высоте достаточно. |  |
| `rejection.BUILT_SIZE_MISMATCH` | „{label}” s-a construit la {builtMm, number, ::group-off} mm în loc de {requiredMm, number, ::group-off} mm, așa că nu l-am așezat. | После создания размер «{label}» составил {builtMm, number, ::group-off} мм вместо {requiredMm, number, ::group-off} мм, поэтому мы его не разместили. |  |
| `rejection.MEASUREMENT_UNUSABLE` | Nu am putut măsura dulapul „{label}” după ce a fost construit, așa că nu l-am adăugat. | Не удалось измерить шкаф «{label}» после создания, поэтому мы его не добавили. |  |
| `rejection.COLUMN_MISMATCH` | „{label}” ar ieși înafara coloanei în care a fost adăugat. | «{label}» вышел бы за пределы колонны, в которую его добавили. |  |
| `rejection.NOT_RESIZABLE` | „{label}” nu își poate schimba lățimea. | Ширину «{label}» нельзя изменить. |  |
| `rejection.WIDTH_UNCHANGED` | „{label}” are deja {widthMm, number, ::group-off} mm lățime. | Ширина «{label}» уже составляет {widthMm, number, ::group-off} мм. |  |
| `rejection.NO_EMPTY_SPACE` | „{label}” nu poate ajunge la {requestedMm, number, ::group-off} mm: coloana ar mai avea nevoie de {deltaMm, number, ::group-off} mm, dar {sides}. | Ширину «{label}» нельзя увеличить до {requestedMm, number, ::group-off} мм: колонне не хватает ещё {deltaMm, number, ::group-off} мм, но {sides}. |  |
| `rejection.COLUMN_MEMBER_NOT_RESIZABLE` | „{label}” nu poate fi redimensionat: în aceeași coloană există „{memberLabel}”, care nu își poate schimba lățimea. | Размер «{label}» нельзя изменить: в той же колонне находится «{memberLabel}», ширину которого изменить невозможно. |  |
| `rejection.RESIZE_OPENS_GAP` | „{label}” nu poate fi redimensionat aici: {sides}. | Размер «{label}» здесь нельзя изменить: {sides}. |  |
| `rejection.COLUMN_KEY_COLLISION` | „{label}” nu poate ajunge la {requestedMm, number, ::group-off} mm: {sides}. | Ширину «{label}» нельзя изменить до {requestedMm, number, ::group-off} мм: {sides}. |  |
| `rejection.COLUMN_HOOD_FLOOR` | „{label}” nu poate coborî la {requestedMm, number, ::group-off} mm: hota de deasupra are {hoodWidthMm, number, ::group-off} mm. | Ширину «{label}» нельзя уменьшить до {requestedMm, number, ::group-off} мм: ширина вытяжки над ним составляет {hoodWidthMm, number, ::group-off} мм. |  |
| `rejection.NON_INTEGER_MILLIMETRES` | Dimensiunea calculată ({field}: {valueMm} mm) nu este un număr întreg de milimetri. | Расчётный размер ({field}: {valueMm} мм) не является целым числом миллиметров. |  |
| `rejection.FINISH_NOT_SUPPORTED` | „{label}” nu are uși, deci nu i se poate schimba finisajul. | У «{label}» нет дверей, поэтому изменить его отделку невозможно. |  |
| `rejection.FINISH_NOT_OFFERED` | Culoarea selectată nu e disponibilă pentru materialul ales. Alege din culorile disponibile sau schimbă materialul. | Выбранный цвет недоступен для указанного материала. Выбери один из доступных цветов или смени материал. |  |
| `rejection.HANDLE_NOT_SUPPORTED` | „{label}” nu are mânere. | У «{label}» нет ручек. |  |
| `rejection.UNKNOWN_MATERIAL_TIER` | Materialul ales nu mai este disponibil. Alege altă variantă. | Выбранный материал больше недоступен. Выбери другой вариант. |  |
| `rejection.UNKNOWN_HARDWARE_TIER` | Feroneria aleasă nu mai este disponibilă. Alege altă variantă. | Выбранная фурнитура больше недоступна. Выбери другой вариант. |  |
| `rejection.UNKNOWN_CABINET_DEPTH` | Adâncimea aleasă nu este disponibilă. Alege una dintre adâncimile oferite. | Выбранная глубина недоступна. Выбери один из предложенных вариантов. |  |
| `rejection.parts.emptySpaceSide` | {sideReason, selectordinal, =0 {în dreapta nu este spațiu liber} =1 {în dreapta spațiul liber este insuficient} =2 {în dreapta s-ar obține un spațiu liber peste alte dulapuri} =3 {în dreapta dulapul nu se încadrează în acestă coloană} =4 {în stânga nu este spațiu liber} =5 {în stânga spațiul liber este insuficient} =6 {în stânga s-ar obține un spațiu liber peste alte dulapuri} other {în stânga dulapul nu se încadrează în acestă coloană}} | {sideReason, selectordinal, =0 {справа нет свободного пространства} =1 {справа недостаточно свободного пространства} =2 {справа образуется свободное пространство над другими шкафами} =3 {справа шкаф не помещается в эту колонну} =4 {слева нет свободного пространства} =5 {слева недостаточно свободного пространства} =6 {слева образуется свободное пространство над другими шкафами} other {слева шкаф не помещается в эту колонну}} |  |
| `rejection.parts.sidesJoin` | , iar  | , а  |  |
| `rejection.parts.widthsMadeBetween` | între {minMm, number, ::group-off} și {maxMm, number, ::group-off} mm | шириной от {minMm, number, ::group-off} до {maxMm, number, ::group-off} мм |  |
| `rejection.parts.widthsMadeAt` | la {minMm, number, ::group-off} mm | шириной {minMm, number, ::group-off} мм |  |
| `rejection.parts.widthsMadeList` | doar în {sizes} mm | только шириной {sizes} мм |  |
| `rejection.parts.widthsJoin` |  sau  |  или  |  |
| `rejection.DEPENDENT_MEMBER_NOT_REBUILDABLE` | „{label}” nu poate fi adăugat aici: „{memberLabel}”, care stă deasupra, nu poate fi reconstruit la adâncimea coloanei. | «{label}» нельзя добавить сюда: «{memberLabel}», который стоит сверху, невозможно перестроить под глубину колонны. |  |
