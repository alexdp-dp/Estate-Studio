# Estate Studio — Build 04.4.30 Delete Plan Data + Polygon

Build cumulativ peste 04.4.29.

## Planuri & apartamente — ștergere definitivă
În pagina `Planuri & apartamente` există două acțiuni noi:

### Șterge plan etaj
Șterge pentru etajul activ:
- referința către planul PNG;
- dimensiunile planului;
- toate apartamentele etajului;
- toate poligoanele;
- toate datele comerciale din acele apartamente;
- metadatele de flip/layout-copy ale planului.

Etajul ca structură rămâne.

### Șterge toate planurile
Rulează aceeași curățare pentru toate etajele din toate blocurile proiectului.
Blocurile și structura etajelor rămân.

Ambele sunt protejate prin confirmare de tip double opt-in: după apăsarea butonului apare un popup branded în care trebuie introdus exact `SIGUR`; butonul final este dezactivat până atunci.

## Editor poligoane
Lângă `Editează` și `Desenează nou` există acum `Șterge poligon`.

- șterge exclusiv poligonul apartamentului selectat;
- NU șterge apartamentul;
- NU șterge datele comerciale;
- folosește confirmare simplă `Nu / Da, șterge poligonul`;
- după ștergere editorul se golește și datele sunt reîncărcate.

`/api/version` => `04.4.30-delete-plan-data-polygon`

# Estate Studio — Build 04.4.29 Project Back Runtime Fix

Hotfix peste 04.4.28.

## Bug reparat
Când ieșeai dintr-un proiect cu `← Proiecte`, React încerca să execute ca funcție valoarea returnată de `useEffect(load, [id])`.

`load()` returna Promise-ul de la `api(...)`. Pentru React, orice valoare returnată direct de un `useEffect` este tratată drept cleanup function la unmount. La navigarea înapoi, React încerca astfel să "apeleze" Promise-ul, ceea ce producea runtime error-ul:

`TypeError: t is not a function`

Refresh-ul funcționa pentru că pagina pornea direct pe ruta Proiecte și componenta Project nu mai trebuia demontată.

## Fix
- `useEffect` nu mai returnează Promise-ul API;
- request-ul inițial este pornit în interiorul effect-ului;
- cleanup-ul este acum o funcție reală;
- este blocată actualizarea de state după unmount;
- `reload()` rămâne separat și funcționează pentru toate secțiunile proiectului.

Nu sunt modificate viewerul, wheel picker-ul, mappingul sau celelalte funcții.

`/api/version` => `04.4.29-project-back-runtime-fix`

# Estate Studio — Build 04.4.28 Wheel Spacing + Cues

Update rapid peste 04.4.27.

## Mobile wheel picker
- labelul principal (`Etaj 4`, `Bloc 2`) și informația secundară (`0 libere`, `02`) sunt aduse mai aproape de centrul pickerului;
- nu mai stau lipite de marginile stânga/dreapta;
- numele blocului din headerul pickerului este mai mare;
- `← Blocuri` / `← Ansamblu` este mai mare și mai ușor de apăsat/citit;
- adăugate două indicii vizuale `⌃` și `⌄` sus/jos, ca să fie clar că pickerul se derulează vertical.

Comportamentul din 04.4.27 rămâne: scroll-ul doar evidențiază, iar tap-ul explicit confirmă selecția.

`/api/version` => `04.4.28-wheel-spacing-cues`

# Estate Studio — Build 04.4.27 Wheel Tap Confirm

Hotfix peste 04.4.26.

## Comportament nou al wheel picker-ului
- scroll-ul vertical doar mută/highlight-uiește itemul din centru;
- oprirea scroll-ului NU mai intră automat în bloc sau etaj;
- itemul central devine doar selecția curentă din picker;
- pentru a intra, utilizatorul trebuie să dea tap pe itemul central;
- dacă dă tap pe un item care nu este încă în centru, primul tap doar îl aduce în centru;
- al doilea tap pe itemul centrat confirmă și intră în bloc / etaj.

Restul viewerului mobil rămâne neschimbat.

`/api/version` => `04.4.27-wheel-tap-confirm`

# Estate Studio — Build 04.4.26 Mobile Wheel Picker

Build cumulativ peste 04.4.25.

## Mobile selector
Selectorul orizontal cu carduri a fost înlocuit cu un **wheel picker vertical**, tip cilindru / iOS picker:

- bara rămâne compactă (~86 px);
- lista de blocuri se derulează vertical în aceeași bară;
- itemul central este mare și clar;
- itemurile de sus/jos sunt mai mici, estompate și ușor rotite în perspectivă;
- scroll-ul face snap pe fiecare item;
- după ce scroll-ul se oprește pe un bloc, acel bloc este selectat și bara trece automat la **Alege etajul**;
- etajele folosesc exact același wheel vertical;
- selectarea unui etaj deschide planul;
- în modul Etaje există back către **Blocuri**;
- din Blocuri există back către **Ansamblu**;
- tap pe un item îl aduce/selectează direct.

Modelul 3D rămâne aproape complet vizibil; nu se mai deschide niciun sheet mare.

`/api/version` => `04.4.26-mobile-wheel-picker`

# Estate Studio — Build 04.4.25 Mobile Inline Selector

Build cumulativ peste 04.4.24.

## Mobile navigation
Bottom-sheet-ul expansibil a fost eliminat complet pe telefon.

Tot fluxul de navigare se întâmplă acum într-o singură bară compactă:
- starea inițială: **Alege blocul**;
- blocurile sunt chips/butoane într-un rând cu scroll orizontal;
- selectarea unui bloc schimbă aceeași bară în **Alege etajul**;
- etajele sunt tot într-un rând cu scroll orizontal;
- selectarea unui etaj deschide planul;
- în modul Etaje există `‹` / `← Blocuri`;
- în modul Blocuri, dacă există un bloc selectat, `‹` / `← Ansamblu` revine la planul general;
- bara nu se mai ridică peste model și nu mai acoperă jumătate din scena 3D.

Selecția directă prin tap pe bloc / etaj în modelul 3D rămâne funcțională.

Desktop-ul și restul viewerului rămân neschimbate.

`/api/version` => `04.4.25-mobile-inline-selector`

# Estate Studio — Build 04.4.24 Plan Overlay Alignment Fix

Hotfix peste 04.4.23.

## Problema
Pe mobil, `plan-image-wrap` fusese făcut `min-height:100%` + `display:flex` pentru centrare. Imaginea PNG își păstra aspect ratio-ul real, dar SVG-ul cu poligoane ocupa întreaga înălțime a wrapperului. Rezultatul: planul și poligoanele nu se mai suprapuneau corect, atât la 100%, cât și la zoom.

## Fix
- wrapperul planului își ia din nou înălțimea strict din imagine;
- imaginea și SVG-ul au exact aceeași cutie;
- SVG-ul rămâne `absolute inset:0` peste PNG;
- zoom 100–150% mărește wrapperul complet, deci PNG + poligoane se scalează împreună;
- modalul rămâne centrat și fundalul rămâne alb;
- bottom-sheet-ul mobil, Helvetica și restul UX-ului din 04.4.23 rămân neschimbate.

`/api/version` => `04.4.24-plan-overlay-alignment-fix`

# Estate Studio — Build 04.4.23 Mobile Bottom Sheet + Helvetica

Build cumulativ peste 04.4.22.

## Mobile viewer
Pe ecrane de maximum 600px:
- panourile desktop `Plan general` + `Selectează etajul` nu mai stau simultan peste model;
- sunt înlocuite de o bară compactă jos;
- tap pe bară deschide un bottom sheet de maximum ~43% din viewport;
- bottom sheet-ul are taburi `Blocuri` / `Etaje`;
- alegerea unui bloc trece automat la tabul `Etaje`;
- alegerea unui etaj închide sheet-ul și deschide planul;
- după selectarea blocului poți închide sheet-ul și atinge direct etajul în modelul 3D;
- desktop/tablet behavior rămâne neschimbat.

## Text și font
- eliminat textul `O nouă perspectivă.`;
- fontul general este acum `Helvetica Neue / Helvetica / Arial`;
- textul normal folosește look light, iar titlurile/acțiunile folosesc look black/bold;
- numele proiectului din frontend folosește explicit Helvetica Black-style;
- nu sunt incluse font files; se folosesc fonturile sistemului/fallback.

## Backend
- adăugat spațiu vizual între `← Proiecte` și `PUBLICAT / DRAFT` în headerul proiectului.

## Paletă frontend
- eliminat bejul din `Plan general`;
- meniurile `Plan general` și `Selectează etajul` folosesc acum o paletă cool-white / sage / graphite, cu accent verde discret;
- aceeași paletă este folosită de bottom sheet-ul de mobil.

`/api/version` => `04.4.23-mobile-bottom-sheet-helvetica`

# Estate Studio — Build 04.4.22 Zoom Controls Left

Update rapid peste 04.4.21.

- controalele de zoom ale planului (`− / % / +`) sunt mutate pe partea stângă a viewportului;
- rămân în viewport când planul este mărit și scrollat;
- pe mobil sunt ancorate în stânga-sus, cu padding mic;
- restul viewerului rămâne neschimbat.

`/api/version` => `04.4.22-zoom-controls-left`

# Estate Studio — Build 04.4.21 Public Viewer UX

Build cumulativ peste 04.4.20; adminul, mappingul, copierea între blocuri și detectorul rămân neschimbate.

## Viewer public
- meniul **Etaje** se deschide imediat lângă meniul de **Blocuri**, ca extensie a lui;
- pe tabletă și mobil rămâne asociat vizual cu meniul de blocuri, nu în partea opusă a ecranului;
- meniurile UI au z-index mai mare decât etichetele HTML ale blocurilor din scena 3D;
- etichetele blocurilor nu mai pot acoperi meniurile.

## Popup plan etaj
- pe mobil este centrat în viewport;
- fundalul zonei planului este alb, inclusiv spațiul liber din jurul imaginii;
- eliminat aspectul de zonă gri sub plan;
- zoom plan între **100% și 150%**, în pași de 10%;
- controale `− / procent / +`;
- dublu-click pe plan comută rapid între 100% și 150%;
- la zoom, planul rămâne împreună cu poligoanele și zona devine scrollabilă.

`/api/version` => `04.4.21-public-viewer-ux`

# Estate Studio — Build 04.4.20 UI Buttons + Custom Dialogs

Build cumulativ peste 04.4.19. Funcționalitatea de copiere, mapping, editor, detector și viewer rămâne neschimbată.

## UI butoane
Butoanele contextuale care aveau styling diferit folosesc acum același component vizual:
- **Copiază doar structura**
- **Copiază blocul complet**
- **Detectează apartamente**
- **Copiază plan + mapare**
- acțiunile secundare din modalurile de copiere

Au aceeași înălțime, border, radius, font weight, hover și spacing ca restul interfeței. Acțiunea principală rămâne dark/primary.

## Confirmări în designul Estate Studio
Confirmările native de browser au fost eliminate din admin și înlocuite cu popup branded, în designul aplicației:
- copiere structură;
- copiere plan + mapare;
- copiere bloc complet;
- regenerare etaje;
- duplicare / ștergere proiect;
- ștergere bloc;
- ștergere apartament.

Popup-ul are overlay, card, titlu, explicație și butoane `Renunță` / acțiunea relevantă. Escape închide, Enter confirmă.

În editorul de poligoane, mesajele de eroare care foloseau `alert()` sunt afișate acum în zona de notice a editorului, fără browser alert.

`/api/version` => `04.4.20-ui-buttons-custom-dialogs`

# Estate Studio — Build 04.4.19 Copy Complete Building

Build cumulativ peste 04.4.18. Nu schimbă editorul de poligoane, detectorul PNG, viewerul 3D sau frontend-ul existent.

## Nou: Copiază blocul complet
În secțiunea **Etaje**, pe blocul sursă apare acțiunea **Copiază blocul complet**.

Pentru fiecare bloc țintă selectat, operația face automat:
- sincronizarea structurii tuturor etajelor după blocul sursă;
- copierea planului pentru fiecare etaj corespondent;
- copierea tuturor poligoanelor/mapării de pe fiecare etaj;
- crearea de apartamente NOI în fiecare țintă;
- ID-uri noi;
- coduri noi generate pentru bloc + etaj;
- denumiri noi `Apartament <cod>`;
- status nou `available` indiferent de statusul sursei.

### Date apartamente
Modalul permite:
- **Doar geometrie / poligoane**;
- **Geometrie + număr camere** — implicit;
- **Geometrie + toate datele comerciale**.

Identitatea și statusul nu se copiază în niciun mod.

### Orientare per bloc
Fiecare bloc țintă poate avea separat:
- Normal;
- Flip H;
- Flip V;
- Flip H + V.

Orientarea se aplică tuturor planurilor și poligoanelor copiate în acel bloc, păstrând coerența între PNG și mapping.

Funcțiile existente **Copiază doar structura** și **Copiază plan + mapare** pe etaje individuale rămân disponibile pentru excepții.

`/api/version` => `04.4.19-copy-complete-building`

# Estate Studio — Build 04.4.18 Cross-copy Floors & Layouts

Build cumulativ peste 04.4.17. Funcțiile existente de mapping/editare rămân păstrate.

## 1. Etaje — copiere structură între blocuri
În secțiunea **Etaje**, blocul selectat poate fi folosit ca sursă pentru unul sau mai multe blocuri țintă.

Se copiază:
- numărul de niveluri;
- denumirile etajelor;
- `floor_number` / `sort_order`;
- intervalele `height_from_m` / `height_to_m`;
- configurația de înălțimi a blocului.

Pe etajele țintă care există deja, planurile și apartamentele sunt păstrate. Nivelurile suplimentare față de sursă sunt eliminate.

## 2. Planuri & apartamente — copiere plan + mapare în mai multe etaje
Din etajul curent:
- selectezi unul sau mai multe etaje țintă din același proiect;
- planul este reutilizat;
- poligoanele sunt copiate;
- pe fiecare etaj țintă se generează **apartamente noi**;
- ID-urile sunt întotdeauna noi;
- codurile și titlurile sunt întotdeauna noi;
- statusul NU se copiază: noile apartamente sunt `available`.

Moduri pentru date:
- **Doar geometrie / poligoane**;
- **Geometrie + număr camere** (implicit);
- **Geometrie + toate datele comerciale** (camere, suprafețe, preț, monedă, descriere, imagine, URL), fără identitate și fără status.

Codurile se generează automat:
- Parter: `P01`, `P02`...
- Etaj 1: `101`, `102`...
- Etaj 2: `201`, `202`...
- dacă destinația este în alt bloc: `B2-101`, `B3-201` etc.;
- există și prefix custom opțional.

## Flip
Copierea layoutului poate aplica **Flip H**, **Flip V** sau ambele.
PlanEditor, frontend-ul public și detectorul PNG respectă flip-ul planului, iar poligoanele sunt transformate în aceleași coordonate.

`/api/version` => `04.4.18-cross-copy-floors-layouts`

# Estate Studio — Build 04.4.17 Copy / Flip / Paste & Move

Update peste 04.4.16.

## Clonare poligon pe același plan
- selectezi apartamentul sursă;
- **Copiază poligon**;
- selectezi alt apartament țintă, inclusiv direct prin click pe plan;
- opțional **Flip H**, **Flip V** sau ambele;
- **Lipește și mută**;
- noua geometrie intră în draft-ul apartamentului țintă, fără să copieze ID, cod, status sau alte date;
- după lipire, tragi direct de interiorul poligonului și se mută **toată forma**;
- poligonul este limitat în suprafața planului;
- salvarea în DB se face doar când apeși **Salvează poligon**.

Flip H/V este local, în jurul centrului geometriei copiate, astfel încât forma rămâne în aceeași zonă și poate fi mutată imediat către apartamentul țintă.

## În plus
- reparat istoricul Undo pentru operațiile care salvează snapshot-ul **înainte** de modificare (delete, insert, paste, draw);
- drag punct, drag latură, click-select, pan temporar și culorile pe tipologie rămân păstrate.

`/api/version` => `04.4.17-copy-flip-paste-move`

# Estate Studio — Build 04.4.16 Room Type Colors

Update rapid peste 04.4.15.

## Culori poligoane
Pentru apartamente **available**, culoarea depinde de numărul de camere:
- Studio / 1 cameră: **vernil** `#A8CFA3`
- 2 camere: **mov** `#8A73B8`
- 3 camere: **verde închis** `#356B57`
- 4+ camere: **petrol** `#3F7C87`

Pentru status:
- **reserved** rămâne galben;
- **sold** rămâne roșu;
- statusul are prioritate față de numărul de camere.

În frontend, hover-ul păstrează aceeași familie de culoare și doar o face mai intensă/închisă. Blend-ul `multiply` și lipsa chenarului rămân neschimbate.

În editorul de mapping din admin, poligoanele folosesc aceeași codificare cromatică.

`/api/version` => `04.4.16-room-type-colors`

# Estate Studio — Build 04.4.15 Click Select Polygon

Update peste 04.4.14.

## Nou
- în editorul de planuri/apartamente, apartamentul poate fi selectat direct prin **click pe poligonul lui din plan**;
- nu mai este obligatoriu să alegi apartamentul doar din lista din stânga;
- click-ul pe un poligon schimbă imediat apartamentul activ și intră în modul **Editează**;
- punctele și laturile poligonului selectat apar imediat pentru editare;
- hover-ul pe un poligon neselectat folosește cursor `pointer`;
- `Space + drag` / middle mouse pentru pan rămân compatibile;
- drag punct, drag latură, delete, undo și insert vertex rămân neschimbate.

`/api/version` => `04.4.15-click-select-polygon`

# Estate Studio — Build 04.4.14 Undo + Insert Vertex

Update peste 04.4.13, fără să schimb logica de drag/pan care funcționează.

## Nou
- **Undo general** pentru move point, move edge, delete point, add point și desenare;
- shortcut **Ctrl+Z / Cmd+Z**;
- istoric de până la 60 de pași;
- **dublu-click pe o latură** adaugă un punct exact în locul ales, proiectat matematic pe segment;
- buton **Adaugă punct pe latură** pentru latura selectată (inserează la mijloc);
- inserarea unui punct nu schimbă forma poligonului până nu muți noul vertex;
- delete + healing ortogonal, point drag, edge drag și pan temporar rămân din 04.4.13.

`/api/version` => `04.4.14-undo-insert-vertex`

# Estate Studio — Build 04.4.13 Point + Edge Drag

Update al editorului de poligoane, peste 04.4.12.

- mutarea punctelor nu mai folosește `Konva draggable`; folosește pointer gesture controlat de editor, ca să nu intre în conflict cu pan-ul temporar;
- click + drag pe un punct îl mută efectiv;
- laturile au hit-area proprie și pot fi trase cu totul;
- o latură orizontală se deplasează doar sus/jos;
- o latură verticală se deplasează doar stânga/dreapta;
- ambele capete ale laturii sunt mutate împreună, păstrând latura H/V;
- Space + drag și middle-mouse + drag rămân pan;
- ștergerea de punct cu vindecare ortogonală rămâne;
- viewerul public cu multiply rămâne neschimbat.

`/api/version` => `04.4.13-edge-drag`

# Estate Studio — Build 04.4.12 Temporary Pan

Update exclusiv pe UX-ul editorului de poligoane.

- eliminat butonul / modul separat **Pan**;
- în **Editează**, ține **Space + click stânga + drag** pentru pan temporar;
- alternativ, **butonul din mijloc / rotița + drag** face pan direct, fără tastă;
- după release revii automat la editarea punctelor;
- pan-ul mută viewport-ul imediat în Konva și sincronizează poziția la final;
- drag-ul vertex-urilor, ștergerea punctelor și închiderea ortogonală rămân din 04.4.11;
- scroll-ul continuă să facă zoom.

`/api/version` => `04.4.12-temp-pan`

# Estate Studio — Build 04.4.11 Editor Real Interactions

Fix concentrat exclusiv pe problema raportată în 04.4.10: mesajele de UI apăreau, dar geometria nu se modifica vizibil.

## Drag vertex
- drag-ul nu mai citește poziția din pointer + transform invers;
- folosește direct coordonata locală reală a `Circle`-ului Konva (`e.target.x()/y()`);
- node-ul este mutat imediat în `onDragMove`, apoi aceeași poziție este copiată în React state;
- planul, celelalte poligoane și line-ul selectat au `listening=false`, astfel încât vertex-urile sunt singurele hit targets în modul de editare;
- hit-area vertex-ului este mai mare.

## Ștergere vertex
04.4.10 putea șterge punctul și apoi îl recrea în exact aceeași poziție ca „elbow” ortogonal, deci vizual părea că nu se întâmplă nimic.

04.4.11:
- punctul selectat este eliminat efectiv;
- dacă vecinii împart deja X sau Y, sunt uniți direct;
- dacă ar rezulta o diagonală, este mutat minim unul dintre cei doi vecini ca să creeze o închidere la 90°;
- punctul eliminat NU poate fi recreat în aceeași poziție;
- mesajul confirmă și numărul vechi → nou de puncte.

Viewerul public `multiply`, detectorul și restul funcțiilor 04.4.x sunt păstrate.

`/api/version` => `04.4.11-editor-real-interactions`

# Estate Studio — Build 04.4.10 Editor Syntax Hotfix

Hotfix exact pentru eroarea de build din 04.4.9.

Cauza era în `PlanEditor.jsx`: helper-ele pentru ștergerea ortogonală fuseseră inserate accidental **în mijlocul semnăturii `applySnap()`**, iar secvența `={}){` ajunsese după helper-e. Vite/esbuild se oprea la linia 38 cu `Expected ")" but found "function"`.

În 04.4.10:
- semnătura `applySnap(raw, points, {...}={})` este reparată;
- helper-ele `cleanOrthogonalPoints()` și `deletePointOrthogonal()` sunt mutate în afara funcției, la nivel de modul;
- editorul stabil și ștergerea ortogonală din 04.4.9 rămân neschimbate ca logică;
- viewerul public cu `multiply` rămâne păstrat.

`/api/version` => `04.4.10-editor-syntax-hotfix`

# Estate Studio — Build 04.4.9 Stable Editor + Orthogonal Delete

Hotfix pentru regresia editorului din 04.4.8.

## Ce am schimbat
- am restaurat **integral PlanEditor-ul stabil din 03.8.3**, cel în care drag-ul vertex-urilor funcționa;
- peste acel editor stabil am adăugat MINIMAL doar selecția și ștergerea punctului;
- nu am rescris logica de drag / pointer transform / viewport;
- `Șterge punct` elimină vertex-ul selectat;
- Delete / Backspace / dublu-click / click dreapta fac același lucru;
- dacă vecinii au același X sau Y, poligonul se închide direct;
- dacă legătura directă ar fi diagonală, se introduce **un singur cot la 90°**, ales lângă punctul șters;
- apoi se elimină punctele coliniare redundante.

## Viewer public
Păstrează schimbarea din 04.4.7: overlay `multiply`, fără stroke, hover doar prin nuanță.

`/api/version` => `04.4.9-editor-stable-delete-ortho`

# Estate Studio — Build 04.4.7 Public Plan Multiply

Update exclusiv de UX pentru viewerul public al planului de etaj. Detectorul și editorul nu sunt modificate.

## Poligoane în viewerul public
- `mix-blend-mode: multiply` peste planul PNG;
- zonele negre ale planului rămân vizibile / negre prin overlay;
- fără chenar alb;
- fără chenar negru la hover;
- `stroke: none` permanent;
- la hover se schimbă doar nuanța / intensitatea culorii de status;
- culorile Available / Reserved / Sold rămân distincte;
- blend-ul este izolat în zona planului ca să nu afecteze restul UI-ului.

`/api/version` => `04.4.7-public-plan-multiply`

# Estate Studio — Build 04.4.6 Strict Orthogonal Corners

Build cumulativ peste 04.4.5. Detectorul / maparea apartamentelor NU este schimbată.

## Fix geometric
Pasul `Aliniază + colțuri 90°` face acum două lucruri după wall-center alignment:

- reconstruiește poligonul exclusiv din drepte **orizontale / verticale**;
- colțurile sunt intersecții H/V exacte, deci nu mai pot rezulta diagonale;
- elimină secvențe H-V-H / V-H-V scurte (dogleg / treaptă) când reprezintă aceeași axă de perete;
- elimină muchiile consecutive de aceeași orientare rezultate din zgomot raster;
- păstrează coordonatele canonice deja sincronizate pentru pereții comuni;
- dacă rectificarea ar deforma prea mult aria apartamentului, păstrează geometria detectată și marchează conturul pentru verificare în loc să inventeze o formă.

## Păstrat
- Apartamente / Zonă comună / Balcoane-terase;
- rectificarea Topology existentă;
- wall-center sampling pe PNG-ul original;
- limite comune sincronizate;
- fallback / revenire la conturul detectat.

`/api/version` => `04.4.6-strict-orthogonal-corners`

# Estate Studio — Build 04.4.5 Wall Center Alignment

Build cumulativ peste **04.4.4 Rectified Topology**. Detectorul de apartamente NU este înlocuit.

## Nou: `Aliniază pe centrul pereților`
După ce Topology a identificat apartamentele, rulează un post-proces separat pe PNG-ul original:

- fiecare latură este măsurată în mai multe secțiuni pe toată lungimea ei;
- se caută banda peretelui și se folosește centrul dintre marginile benzii;
- nu se alege pur și simplu cea mai apropiată linie neagră; candidații trebuie să fie consistenți longitudinal;
- mobilierul, arcele de ușă și simbolurile locale nu au suficient suport pe lungime și sunt respinse;
- două stroke-uri paralele apropiate pot fi tratate ca marginile aceleiași benzi / parapet;
- micile ocoluri de toc de ușă sunt eliminate numai dacă PNG-ul confirmă aceeași axă înainte și după gol;
- limitele comune care proveneau deja din aceeași frontieră Topology primesc o singură coordonată canonică;
- o latură cu încredere mică NU este mutată și apare punctat portocaliu pentru verificare;
- există `Revino la contur detectat` înainte de salvare.

## Workflow păstrat
- Apartamente
- Zonă comună
- Balcoane / terase
- Curat / Agresiv / Foarte agresiv
- Rectifică poligoanele
- editorul manual stabil

`/api/version` => `04.4.5-wall-center-alignment`

# Estate Studio — Build 04.4.4 Rectified Topology

IMPORTANT: acest build este făcut cumulativ peste **04.4.2 Balcony Seeds**.
04.4.3 a fost bazat accidental pe 04.4.0 și pierdea UI-ul introdus în 04.4.2.
04.4.4 corectează explicit acea regresie.

## UI care trebuie să existe
În Mod asistat:
- `Apartamente`
- `Zonă comună`
- `Balcoane / terase`

După generare apare și panoul:
- `Curat`
- `Agresiv`
- `Foarte agresiv`
- `Rectifică poligoanele`

## Rectificare geometrică
Rectificarea se face pe **harta comună de etichete**, înainte de vectorizare:
- numai muchii orizontale / verticale;
- nu urmărește arcul sau golul ușii;
- elimină run-uri scurte / notch-uri produse de uși, nișe și zgomot;
- coarse-grid mai puternic pe nivelurile 2 și 3;
- vecinii rămân tangențiali pentru că ambele apartamente folosesc aceeași frontieră comună;
- nu se mai face spike cleanup independent pe fiecare apartament.

## Balcoane
Tot ce exista în 04.4.2 rămâne:
- recuperare automată de balcon/terasă;
- fallback manual `Balcoane / terase`;
- click-ul de balcon devine seed suplimentar pentru același apartament, nu apartament separat.

`/api/version` => `04.4.4-rectified-topology`

# Estate Studio — Build 04.4.2 Balcony Seeds

Update peste 04.4.1 pentru cazul în care un balcon/terasă este desenat astfel încât
detectorul îl atribuie exteriorului.

## De ce 04.4.1 putea rata balconul
Pe unele planuri:
- fațada / tâmplăria dintre cameră și balcon este suficient de puternică încât seed-ul
  apartamentului nu ajunge în balcon;
- balustrada/conturul exterior este suficient de subțire încât exteriorul ajunge primul;
- din imagine singură nu există întotdeauna o regulă sigură care să spună că acel buzunar
  exterior este balcon și nu spațiu exterior real.

## Soluție V3.2
Modul asistat are acum 3 tipuri de puncte:

1. `Apartamente`
2. `Zonă comună`
3. `Balcoane / terase`

Un punct de balcon:
- NU creează un apartament nou;
- este legat automat de cel mai apropiat seed de apartament;
- intră în algoritm cu ACELAȘI label ca apartamentul;
- devine un al doilea punct de propagare pentru același poligon.

Exemplu:
`B2→5` = al doilea balcon marcat, atribuit apartamentului 5.

## Rezultatul final
Rămân toate regulile din 04.4.1:
- numai muchii la 90°;
- fără diagonale;
- fără contur după arcul ușii;
- grilă comună pentru toate apartamentele;
- vecini tangențiali;
- fără overlap produs de simplificări independente;
- spike cleanup.

Balcony seed este doar fallback. Recuperarea automată din 04.4.1 rămâne activă.

`/api/version` => `04.4.2-balcony-seeds`

# Estate Studio — Build 04.4.1 Balcony + Orthogonal + Tangent

Update peste 04.4.0, concentrat strict pe cele trei probleme observate în planul real.

## 1. Balcoane / terase
În 04.4.0 exteriorul concura cu apartamentele și putea intra prin golurile fine ale
balustradelor/fațadei, câștigând balconul.

În 04.4.1:
- construim separat un `enclosure mask`;
- închidem doar pentru analiza exteriorului golurile fine din fațadă/balustradă;
- detectăm buzunarele care erau marcate `exterior`, dar devin spații închise;
- dacă un astfel de buzunar are un singur apartament vecin dominant și nu aparține
  holului comun, este atașat acelui apartament;
- ușile rămân deschise în segmentarea principală.

## 2. Doar linii la 90°
Pentru Topology Guided nu mai folosim `architecturalPolygonize` / RDP / angle snapping.

Poligonul final este extras direct dintr-o grilă de etichete comună:
- toate segmentele sunt strict orizontale sau verticale;
- nu există muchii diagonale;
- nu mai urmărește arcul ușii;
- eliminăm punctele coliniare;
- eliminăm excursiile/spike-urile dreptunghiulare foarte scurte.

## 3. Apartamente tangențiale, fără overlap
Toate apartamentele sunt generate din aceeași partiție raster și din aceeași grilă
regularizată.

Asta înseamnă:
- un perete comun are o singură poziție geometrică;
- poligonul A și poligonul B folosesc exact aceeași limită comună;
- nu mai simplificăm fiecare apartament independent;
- nu ar trebui să apară suprapuneri sau fante între vecini.

## Regularizare
Înainte de vectorizare:
- etichetele sunt agregate pe o grilă comună;
- se face majority smoothing conservator;
- apoi se extrage conturul ortogonal.

## UI
Rezumatul detectorului arată și câte balcoane/terase au fost recuperate automat.

`/api/version` => `04.4.1-balcony-orthogonal-tangent`

# Estate Studio — Build 04.4.0 PNG Topology Guided

Detector PNG optimizat pentru planurile tehnice curate, alb-negru, cu pereți groși,
uși desenate și balcoane/terase — exact modelul folosit în proiect.

## Schimbarea principală
Vechiul Mod asistat pornea de la connected-components. Dacă toate apartamentele comunicau
prin uși cu holul comun, toate seed-urile ajungeau în aceeași componentă și detectorul
vedea un singur apartament.

În 04.4.0 Mod asistat folosește **multi-source geodesic topology**:

1. un seed pentru fiecare apartament;
2. unul sau mai multe seed-uri `C` pentru holul / zona comună;
3. exteriorul planșei este al treilea competitor;
4. pereții sunt bariere;
5. golurile reale de ușă rămân deschise;
6. seed-ul apartamentului se propagă prin dormitor, living, baie, bucătărie etc.;
7. seed-ul comun ocupă holul comun și oprește propagarea între apartamente;
8. balcoanele sunt incluse dacă sunt accesibile din apartament și închise de contur;
9. după segmentarea spațiului liber, grosimea pereților este împărțită până aproape de axa mediană.

## Wall mask pentru acest tip de plan
Detectorul combină:
- stroke-uri realmente groase (pereți);
- stroke-uri arhitecturale lungi, chiar dacă sunt mai subțiri (fațade, balcoane);
- mobilierul/textul rămân în mare parte insule locale și nu mai definesc apartamentul.

## UX Mod asistat
- este activ implicit;
- `Apartamente` → click câte unul în fiecare apartament;
- `Zonă comună` → click unul sau mai multe puncte în holul comun/casa scării;
- punctele comune apar roșu `C1`, `C2` etc.;
- dacă holul are ramuri, poți pune mai multe puncte C;
- regenerezi fără să redesenezi manual contururile.

## Editor manual
Rămân fixurile stabile:
- vertex-uri libere implicit;
- `Snap edit` separat;
- viewport blocat în timpul mutării unui punct;
- pan limitat, fără aruncarea planului în afara ecranului.

## Fără CAD
Nu există DWG/DXF, LibreDWG, cad-simple-viewer sau CadPlanImporter.

`/api/version` => `04.4.0-png-topology-guided`

# Estate Studio — 04.3.1 Hard PNG Rollback

This is a full snapshot of 03.8.4, before DWG/CAD work. A preinstall guard forcibly deletes CAD leftovers and rewrites the client dependencies/Vite config to PNG-only before Render installs the client.

`/api/version` => `04.3.1-hard-png-rollback`

# Estate Studio — Build 03.8.4 Detector Runtime Rollback

HOTFIX pentru crash-ul detectorului de apartamente.

## Ce am făcut
- am păstrat TOT buildul 03.8.3:
  - camera 03.7.16;
  - viewerul;
  - selecția bloc → etaj;
  - shade disabled;
  - editorul de poligoane cu mutare liberă și pan stabil;
  - toate fixurile cumulative.
- am scos din runtime stratul OCR/Tesseract introdus în 03.8.1/03.8.2;
- am restaurat detectorul `Architectural V2` din 03.8.0, ultima versiune înainte de ramura OCR;
- am eliminat `tesseract.js` din `client/package.json`.

Scopul acestui build este unul singur: detectorul să se deschidă și să ruleze din nou stabil.

Funcția cu AP.xx este TEMPORAR scoasă din hotfix. O reintroducem separat, după ce detectorul stabil este verificat, fără să mai punem în pericol tot modulul.

`/api/version` => `03.8.4-detector-runtime-rollback`

# Estate Studio — Build 03.8.3 Stable Free Polygon Editor

Fix concentrat pe editorul manual al poligoanelor.

## Puncte
- în modul `Editează`, vertex-urile se mișcă LIBER implicit;
- snap-ul nu mai trage punctul unde vrea algoritmul;
- `Snap edit` este separat și oprit implicit;
- `Shift` poate activa temporar snap-ul când chiar îl vrei;
- coordonata vertex-ului este calculată din pointer prin inversa transformării viewportului, nu din poziția internă temporară a Circle-ului Konva;
- fiecare vertex este limitat strict în dreptunghiul planului.

## Pan / zoom
- în timpul drag-ului unui vertex, viewportul este blocat și nu poate începe pan accidental;
- Stage-ul nu este mutat niciodată;
- pan-ul are limite și nu mai poate arunca tot planul în afara ecranului;
- zoom-ul recalculează și el o poziție validă;
- `Încadrează planul` revine la scale 1 / poziția 0,0;
- CSS-ul canvasului blochează scroll/touch gestures care puteau interfera cu Konva.

Detectorul rămâne cel din 03.8.2; nu am amestecat încă un nou algoritm de uși/holuri în același build ca să nu introducem altă regresie.

`/api/version` => `03.8.3-stable-free-polygon-editor`

# Estate Studio — Build 03.8.2 Hybrid AP Optional Detector

Corecție importantă de logică: etichetele `AP.xx` NU definesc numărul de apartamente.

## Cum funcționează acum
- numărul de apartamente este dinamic;
- `Număr așteptat` este doar un override opțional;
- detectorul rulează ÎNTOTDEAUNA o detecție geometrică pentru întreg etajul;
- dacă găsește `AP.01`, `AP.02` etc., face separat o detecție ghidată pentru acele apartamente;
- rezultatele se combină:
  - apartamentele cu etichetă primesc codul AP.xx;
  - apartamentele fără nicio etichetă rămân în rezultat din detecția geometrică;
- dacă nu există nicio etichetă AP.xx, funcționează 100% geometric;
- dacă există doar 2 etichete într-un plan cu 8 apartamente, cele 2 sunt ghidate de AP.xx, iar celelalte 6 sunt păstrate din geometrie;
- dacă OCR nu pornește sau nu găsește nimic, detectorul continuă normal.

## Important
AP.xx este acum un `hint`, nu `source of truth`.

`/api/version` => `03.8.2-hybrid-ap-optional-detector`

# Estate Studio — Build 03.8.1 AP Label Guided Detector

Detector V3: folosește automat marcajele `AP.01`, `AP.02`, `AP.03` etc. atunci când acestea există pe plan.

## Flux
1. OCR citește marcajele AP.xx.
2. Marcajul de pe hol NU este folosit direct ca interior al apartamentului.
3. Pe baza wall-mask-ului, detectorul caută cea mai apropiată regiune interioară relevantă de marcaj.
4. Acea regiune devine seed pentru apartamentul AP.xx.
5. Detectorul Architectural V2 construiește poligonul pe pereți și împarte pereții comuni.
6. Codurile AP.xx sunt păstrate în propuneri și la crearea apartamentelor noi.

## Fallback
- dacă OCR nu poate porni sau nu găsește AP.xx, detectorul revine automat la detecția geometrică;
- Modul asistat manual rămâne disponibil;
- OCR este lazy-loaded: nu intră în bundle-ul principal al Estate Studio.

## UI
- opțiune implicit activă: `Folosește automat etichetele AP.01 / AP.02…`;
- overlay-ul arată marcajul OCR, legătura către seed-ul interior și codul AP.xx;
- propunerile sunt afișate ca AP.01, AP.02 etc., nu doar `Propunere 1`.

`/api/version` => `03.8.1-ap-label-guided-detector`

# Estate Studio — Build 03.8.0 Architectural Detector V2

Detectorul automat de apartamente a fost refăcut fără ML / training.

## Ce se schimbă
- rezoluție analiză crescută de la max ~520 px la max ~1400 px (cu limită de ~1.8 MP);
- fundalul exterior care atinge marginea canvasului nu mai este propus ca apartament;
- nu mai transformă orice pixel întunecat în „perete”;
- extrage mai întâi trasee lungi orizontale/verticale, ca să reducă influența mobilierului și textelor;
- reconectează controlat goluri mici din pereți;
- păstrează Voronoi-ul intern pentru a pune limita comună aproape de mijlocul peretelui gros;
- contururile raster sunt transformate în poligoane arhitecturale:
  - RDP mai agresiv;
  - eliminare muchii foarte scurte;
  - eliminare colțuri aproape coliniare;
  - snap la 0° / 45° / 90° / 135° pentru segmentele arhitecturale;
  - intersecții geometrice între segmente, în loc de zig-zag pixel cu pixel.
- Modul asistat rămâne: un click aproximativ în fiecare apartament, fără trasare manuală.

Nu există model AI și nu se antrenează nimic.

`/api/version` => `03.8.0-architectural-detector-v2`

# Estate Studio — Build 03.7.16 Reference Camera Motion

Camera din viewerul public a fost refăcută după logica din codul original `/macheta/` furnizat ca referință.

## Principiu
- ținta = centrul blocului selectat;
- poziția camerei = target + offset de perspectivă ridicat;
- stânga/dreapta se alege după poziția blocului în ansamblu;
- nu mai există algoritmul experimental cu 12 unghiuri / line-of-sight;
- tranziția folosește tween simplu `smoothstep` ca în referință;
- durata pe public viewer este ~850 ms;
- blocul selectat rămâne centrat;
- perspectiva este ridicată, nu la nivelul fațadei;
- restul blocurilor rămân în shade disabled;
- vederea de ansamblu are propriul offset ridicat și mai apropiat.

Include cumulativ 03.7.15 și toate fixurile anterioare.

`/api/version` => `03.7.16-reference-camera-motion`

# Estate Studio — Build 03.7.15 Scene Center Runtime Fix

Fix critic peste 03.7.14.

Cauza exactă a crash-ului:
- `chooseClearPerspectiveDirection()` folosea `sceneCenter`;
- `sceneCenter` era declarat doar în interiorul `useEffect`;
- helper-ul era în afara acelui scope;
- rezultatul în browser: `ReferenceError: sceneCenter is not defined`.

Fix:
- `sceneCenter` este transmis explicit ca argument helper-ului;
- logica de cameră din 03.7.14 rămâne aceeași;
- nicio schimbare în Supabase, DB sau schema proiectului.

`/api/version` => `03.7.15-scene-center-runtime-fix`

# Estate Studio — Build 03.7.14 Clear-Line Perspective Camera

Corecție cameră pe bloc selectat:

- blocul selectat rămâne centrat în cadru;
- camera este RIDICATĂ, în perspectivă, nu la nivelul blocului;
- nu mai folosește un unghi diagonal fix;
- testează 12 unghiuri în jurul blocului;
- pentru fiecare unghi verifică dacă segmentul cameră → bloc intersectează bounding box-ul altui bloc;
- alege automat primul cadru curat, fără altă clădire între cameră și blocul selectat;
- dacă unghiul curent este liber, îl preferă, ca mișcarea să nu facă o rotație inutilă;
- fly-ul cinematic are arc lateral + lift mai mare, ca traseul să evite senzația de trecere prin clădiri;
- celelalte blocuri rămân în shade `disabled`, dar nu sunt transparente.

Include cumulativ toate funcțiile și fixurile din 03.7.13.

`/api/version` => `03.7.14-clear-line-perspective-camera`

# Estate Studio — Build 03.7.13 Detector Runtime Fix

Fix critic pentru crash-ul la `Detectează apartamente`.

Cauza exactă:
- în 03.7.4 am introdus un `useEffect()` care preîncarcă planul pentru Modul asistat;
- componenta `AutoApartmentDetector.jsx` NU importa `useEffect` din React;
- componenta este lazy-loaded, deci restul Estate Studio pornea normal;
- crash-ul apărea exact când deschideai detectorul;
- în buildul minificat eroarea ajungea afișată ca `TypeError: t is not a function`.

Fix:
- `useEffect` este importat corect din React;
- importul `useMemo` nefolosit a fost eliminat;
- nici algoritmul detectorului, nici datele, nici Supabase nu sunt modificate.

Include cumulativ toate funcțiile și fixurile din 03.7.12.

`/api/version` => `03.7.13-detector-runtime-fix`

# Estate Studio — Build 03.7.12 Centered Angled Focus

Corecție explicită pentru focusul pe bloc:

## Când selectezi un bloc
- blocul selectat este CENTRAT în cadru;
- camera este obligatoriu la un unghi 3/4 / perspectivă;
- nu mai poate ajunge într-un cadru aproape frontal;
- camera alege automat cel mai apropiat dintre 4 unghiuri diagonale (45°), ca mișcarea să rămână naturală;
- centrul de interes este exact centrul X/Z al bounding box-ului real al blocului;
- clădirea rămâne complet vizibilă.

## Restul ansamblului
- celelalte blocuri rămân vizibile;
- sunt desaturate și trecute într-un shade gri deschis de `disabled`;
- blocul activ își păstrează materialele/culorile normale;
- funcționează atât pentru GLB separat per bloc, cât și pentru GLB comun mapat.

Include cumulativ toate funcțiile și fixurile din 03.7.11.

`/api/version` => `03.7.12-centered-angled-focus-disabled-others`

# Estate Studio — Build 03.7.11 Camera Framing Tune

Ajustări cameră viewer public:

## Bloc selectat
- nu mai vine aproape frontal;
- perspectiva implicită este un cadru 3/4 ușor, cu latura clădirii vizibilă;
- camera alege automat partea stânga/dreapta care cere cea mai mică rotire față de poziția curentă;
- clădirea rămâne complet vizibilă, fără close-up în balcoane;
- fly-ul cinematic rămâne activ.

## Tot ansamblul
- camera este semnificativ mai aproape;
- ansamblul ocupă mai mult din cadru;
- unghiul rămâne perspectivă, nu top-down;
- FOV ușor mai larg pentru a ține tot complexul în cadru fără senzație de zoom-out.

Include cumulativ toate funcțiile și fixurile din 03.7.10.

`/api/version` => `03.7.11-camera-framing-tune`

# Estate Studio — Build 03.7.10 Floor Gap Hover Fix

Comportament nou când un bloc este deja selectat:

- hover-ul este permis NUMAI dacă cursorul se află într-un interval real de etaj;
- dacă cursorul este între două intervale de etaj:
  - nu apare tooltip;
  - nu apare highlight;
  - blocul nu devine din nou selectabil;
  - click-ul nu face nimic;
- în vederea de ansamblu, hover-ul pe întregul bloc rămâne neschimbat;
- după focus pe bloc, interacțiunea devine strict `etaj → plan`.

Include cumulativ toate funcțiile și fixurile din 03.7.9.

`/api/version` => `03.7.10-floor-gap-hover-fix`

# Estate Studio — Build 03.7.9 Tighter Complex Overview

Ajustare pentru cadrul inițial / vederea de ansamblu:

- când NU este selectat niciun bloc, camera nu mai stă foarte departe;
- ansamblul rămâne complet vizibil, dar framingul este mai strâns și mai plăcut;
- camera este puțin mai aproape de complex;
- unghiul este puțin mai coborât, ca în referința ta;
- FOV-ul este ușor lărgit pentru a păstra ansamblul întreg fără senzația de zoom-out excesiv;
- și presetul `De sus` pentru ansamblu este puțin mai strâns.

Pe scurt:
- `Toate clădirile` / starea inițială = ansamblu complet, dar NU foarte îndepărtat;
- bloc selectat = framing separat, mai apropiat, deja ajustat în 03.7.8.

Include cumulativ toate funcțiile și fixurile din 03.7.8.

`/api/version` => `03.7.9-tighter-complex-overview`

# Estate Studio — Build 03.7.8 Looser Building Focus

Ajustare pentru zoom-ul pe bloc în viewerul public:

- când selectezi un bloc, cadrul final este MAI LARG;
- nu mai vine foarte aproape în balcoane/fațadă;
- ținta camerei este puțin mai jos pe clădire, pentru un prim-plan care arată blocul complet;
- distanța de framing a crescut;
- FOV-ul final pentru bloc selectat este mai larg (~36.5° în perspectivă);
- rezultatul este mai apropiat de tipul de cadru din referința ta `/macheta/`:
  - blocul clar în prim-plan;
  - tot volumetrul vizibil;
  - încă se simte focus pe blocul selectat.

Include cumulativ toate funcțiile și fixurile din 03.7.7.

`/api/version` => `03.7.8-looser-building-focus`

# Estate Studio — Build 03.7.7 Two-Stage Selection

Viewer public refăcut pe interacțiunea cerută:

## Stage 1 — Ansamblu
- în vederea inițială se poate selecta DOAR blocul;
- hover-ul este la nivel de bloc complet;
- etajele NU sunt detectate / selectabile în această etapă;
- tooltip: `Bloc X · Clădire · Click pentru prim-plan și etaje`;
- click pe bloc, bulină sau butonul din listă:
  - selectează doar blocul;
  - forțează perspectiva;
  - pornește mișcarea cinematografică;
  - încadrează blocul în prim-plan.

## Stage 2 — Bloc selectat
- doar după ce blocul este activ, hover-ul 3D trece la nivel de etaj;
- click pe etaj deschide planul;
- panoul de etaje apare pentru blocul selectat;
- selectarea altui bloc revine automat la Stage 1 pentru noul bloc și face un nou fly cinematic.

Include cumulativ toate funcțiile și fixurile din 03.7.6.

`/api/version` => `03.7.7-two-stage-selection`

# Estate Studio — Build 03.7.6 Cinematic Building Focus

Viewer public `/embed/:slug`:
- selectarea unui bloc din listă sau din bulină pornește o mișcare cinematografică;
- camera nu mai face un simplu lerp/zoom drept;
- traseul folosește o curbă cubic Bézier cu mică mișcare laterală + lift;
- ținta camerei este mutată ușor deasupra centrului clădirii pentru framing mai natural;
- pentru un complex, camera încearcă să vină spre bloc dinspre exteriorul ansamblului, ca să evite traversarea altor clădiri;
- finalul este un prim-plan mai strâns, cu FOV redus la ~32.5°;
- revenirea la `Toate clădirile` face o tranziție fluidă înapoi la ansamblu;
- controalele Orbit sunt blocate doar pe durata animației și revin automat după;
- presetările `De sus` / `Față` rămân disponibile și folosesc tranziție fluidă.

Include cumulativ toate funcțiile și fixurile din 03.7.5.

`/api/version` => `03.7.6-cinematic-building-focus`

# Estate Studio — Build 03.7.5 Bubble Position Fix

Fix pentru bulinele/numele blocurilor din viewerul public:

- bulina NU mai este poziționată după originea/pivot-ul GLB;
- bulina NU mai folosește poziția estimată sau label-ul salvat în mapper;
- poziția este calculată exclusiv din bounding box-ul REAL al geometriei randate, în coordonate world-space;
- funcționează identic pentru:
  - un GLB separat per bloc;
  - un GLB comun cu mai multe blocuri;
  - blocuri cu pivot/origine deplasată în fișier;
  - blocuri rotite / scalate;
- bulina este centrată X/Z pe geometria blocului și stă puțin peste `maxY`;
- s-a adăugat un mic stem vizual sub bulină ca asocierea cu clădirea să fie clară.

Include cumulativ toate funcțiile/fixurile din 03.7.4.

`/api/version` => `03.7.5-bubble-position-fix`

# Estate Studio — Build 03.7.4 Guided Mode Fix

Fix pentru modul asistat al detectorului:

- când activezi `Mod asistat`, planul apare IMEDIAT, înainte de analiză;
- dai un click în interiorul fiecărui apartament;
- fiecare click apare numerotat peste plan;
- click din nou lângă un punct îl șterge;
- `Șterge punctele` golește selecția;
- după ce ai toate apartamentele marcate, apeși `Generează din N puncte`;
- abia atunci detectorul urmărește pereții și construiește poligoanele;
- nu trebuie să trasezi manual contururile.

Include cumulativ 03.7.3:
- parent-group mapping pentru GLB comun;
- fix camera / bounding box real;
- tooltip apartamente;
- shared-complex UI;
- auto apartment detection.

`/api/version` => `03.7.4-guided-mode-fix`

# Estate Studio — Build 03.7.3 Parent Group Mapping

Modificare la maparea unui GLB comun cu mai multe clădiri:

- mesh-ul individual NU mai apare ca opțiune de mapare;
- click pe orice mesh pornește selecția de la `mesh.parent`;
- utilizatorul poate atribui doar părinți / grupuri GLB;
- atribuirea unui părinte include automat toate mesh-urile descendente ale grupului;
- viewerul existent folosește deja ancestry-ul nodurilor, deci pereți, geamuri, balcoane, acoperiș etc. sunt tratate împreună ca aceeași clădire;
- fallback-ul `Zonă X/Z` pentru GLB monolitic rămâne neschimbat;
- include toate fixurile din 03.7.2 (camera real bounds + tooltip apartamente).

`/api/version` => `03.7.3-parent-group-mapping`

# Estate Studio — Build 03.7.2

Hotfix critic peste 03.7.1:

- repară dispariția modelului din preview/embed;
- camera NU mai presupune că GLB-ul este centrat la originea blocului;
- camera folosește bounding box-ul REAL al geometriei după scalare, rotație și poziționare;
- bulina blocului se așază deasupra geometriei reale, nu deasupra originii GLB;
- pentru GLB comun, viewerul calculează și bounds reale pentru scenă / nodurile mapate;
- Reset camera funcționează din nou;
- pe planul apartamentelor apare tooltip la hover cu:
  - cod;
  - denumire;
  - disponibilitate;
  - camere;
  - suprafață utilă;
  - suprafață totală;
  - preț + monedă;
  - descriere scurtă, dacă există.
- click pe poligon deschide în continuare cardul complet.

Cauza regresiei: Build 03.7 calcula focusul camerei din `building.position_x/z`, dar GLB-urile pot avea geometria internă deplasată față de origine. Proiectul `test` are exact acest caz.

`/api/version` => `03.7.2-viewer-fix-tooltips`

# Estate Studio — Build 03.7.1

Include Shared Complex / Macheta UI din 03.7 și repară detectorul de apartamente.

Detector nou:
- sensibilitate automată: testează mai multe praguri de perete;
- elimină din candidați benzile foarte înguste (balcoane/terase/shafts);
- overlay-ul are exact proporția imaginii — nu mai presupune plan pătrat;
- `Mod asistat`: dacă Auto nu e suficient, dai un click în fiecare apartament, fără trasare manuală; detectorul folosește pereții și mută limitele spre mijlocul lor;
- sensibilitate manuală rămâne fallback;
- pe planul de test FIZICIENILOR algoritmul de regiuni separă clusterul principal în 9 zone de apartament și exclude benzile înguste de terasă înainte de confirmare.

`/api/version` => `03.7.1-shared-complex-detector-fix`

# Estate Studio — Build 03.7 Shared Complex + Macheta UI

Upgrade backward-compatible peste Build 03.6.

## Model 3D
Două moduri:
1. `GLB separat per bloc` — fluxul existent, neschimbat.
2. `GLB comun · complex` — un singur GLB pentru tot ansamblul.

În modul comun:
- GLB-ul este încărcat o singură dată;
- clădirile Estate Studio rămân entități independente;
- maparea poate fi după noduri/mesh-uri GLB;
- pentru un GLB monolitic poți defini o zonă spațială X/Z pentru fiecare bloc;
- pozițiile relative ale blocurilor din GLB nu sunt modificate;
- maparea este salvată în `buildings.settings.shared_mapping`;
- configurația modelului comun este salvată în `projects.settings.shared_model`;
- NU sunt necesare modificări de schemă Supabase.

## Viewer public `/embed/:slug`
- pornește cu întregul ansamblu;
- bulină permanentă deasupra fiecărui bloc;
- click pe bulină selectează blocul;
- buton `Toate clădirile`;
- buton separat pentru fiecare bloc;
- camera face fly/zoom animat către bloc;
- Perspectivă / De sus / Auto rotate;
- zoom + / - / reset;
- fără grid / wireframe pe sol;
- hover pe bloc + tooltip bloc/etaj;
- după selectarea blocului apar etajele;
- planurile/apartamentele existente rămân neschimbate.

`/api/version` => `03.7-shared-complex-ui`
# Estate Studio — Build 03.6 Auto Apartments

Upgrade backward-compatible peste 03.5:
- `Detectează apartamente` pe etajele care au plan;
- analiză locală în browser, fără API AI/cost extern;
- detectează pereții întunecați/groși;
- identifică golurile transparente interioare ca probabilă scară / zonă comună;
- segmentează zonele locuibile;
- muchiile comune sunt împinse aproximativ spre axa mediană a pereților groși;
- preview colorat înainte de salvare;
- Auto sau număr estimat de apartamente;
- sensibilitate pereți reglabilă;
- `Nu e apartament` recalculează detectorul folosind zona drept comună;
- mapare pe apartamente existente sau creare automată A01, A02...;
- salvare bulk în `apartment_polygons`;
- editorul manual, snap-ul și pan-ul stabil rămân intacte;
- fără schimbări de schemă Supabase.

`/api/version` => `03.6-auto-apartments`
# Estate Studio — Build 03.5 Pan Stable

Fix editor plan:
- Stage-ul Konva rămâne fix; pan/zoom se aplică unui Group intern;
- la mouse-up după pan nu mai repoziționează / reinițializează canvas-ul;
- coordonatele pointerului sunt calculate prin inversa transformării Konva reale;
- pan/zoom rămân stabile în timp ce desenezi;
- snap 0/90°, 45° și vertices din Build 03.4 rămân neschimbate.

# Estate Studio — Build 03.4 Polygon Snap

Fix / upgrade:
- snap pentru desenarea poligoanelor;
- `Snap 0/90°` pentru segmente perfect orizontale/verticale;
- `45°` opțional;
- `Vertices` pentru lipire la puncte existente / închidere mai precisă;
- `Shift` = forțează 45°;
- `Alt/Option` = desenează temporar fără snap;
- snap funcționează și la mutarea vertex-urilor.

# Estate Studio — Build 03.3 Button Fix

Fix UI:
- butoanele `.primary` rămân negre cu text alb în stare normală;
- regula contextuală `.card-actions button` nu mai poate transforma butonul „Deschide” în alb cu text alb;
- combinația `.primary.button-link` este corectă (ex. „Vezi apartamentul”);
- butoanele secundare albe au explicit text închis.

# Estate Studio — Build 03.2 Interactions

Fixuri:
- poligoanele salvate în Supabase se încarcă din nou corect (relația one-to-one poate veni ca obiect, nu array);
- confirmare vizibilă după salvarea poligonului;
- hover pe clădire;
- hover pe etaj calculat din punctul 3D intersectat și intervalele verticale configurate;
- highlight verde pe etajul de sub mouse;
- tooltip cu numele blocului și etajului;
- click direct pe etaj din model deschide planul etajului;
- click pe bloc îl selectează;
- versiune: `/api/version` => `03.2-interactions`.

# Estate Studio — Build 03.1 Hotfix

Hotfix pentru ecranul alb:
- routing admin scos din contextul descendent `/admin/*`
- Error Boundary global: dacă există o eroare JS, este afișată pe ecran, nu mai rămâne pagină albă
- Three.js/Konva sunt lazy-loaded și nu mai pot bloca login-ul sau lista de proiecte la import
- erorile API din Projects sunt afișate
- `/api/version` confirmă versiunea deployată (`03.1-hotfix`)

# Estate Studio — Build 03 Complete

## Deploy direct pe GitHub + Render
1. Pune conținutul ZIP-ului în root-ul repository-ului GitHub și fă commit/push.
2. În Render creează/folosește un **Web Service / Node**.
3. Build Command:
   `npm install && npm run install:all && npm run build`
4. Start Command:
   `npm start`
5. Environment:
   - `SUPABASE_URL=https://tdcrjumaidgsdnohusmk.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...`
   - `JWT_SECRET=<șir lung random>`
   - `NODE_ENV=production`

Schema necesară Build 03 a fost deja aplicată în proiectul Supabase `estate-studio`.

## Flux
`/admin` → Projects → General → Blocuri → Model 3D → Etaje → Planuri & apartamente → Preview → Embed.

Fiecare proiect primește viewer public separat: `/embed/:slug` și cod iframe gata de copiat.

## Ce este implementat
- proiecte multiple: create/edit/delete/duplicate/publish
- blocuri multiple per proiect + poziționare X/Z și rotație
- upload GLB/GLTF în Supabase Storage
- calibrare runtime: real height / display units / up axis / auto ground
- etaje independente de mesh, generate automat + intervale editabile
- highlight real pe geometrie pentru intervalul etajului
- upload planuri
- apartamente și statusuri Available/Reserved/Sold
- editor poligoane cu Konva, coordonate normalizate, zoom/pan, vertex drag, undo
- viewer public cu perspective/top/front, zoom, reset, autorotate, fullscreen
- plan public interactiv + detalii apartament
- preview identic cu iframe
- generator cod iframe
- persistență Supabase + uploads Supabase Storage
- documentație arhitecturală stocată per proiect

## Notă despre generarea 3D din planuri
Build-ul include modul de proiect `Documentație arhitecturală`, uploadurile și stocarea documentației. Generarea automată a unei geometrii comerciale detaliate din PDF/DWG necesită un motor extern de modelare/AI/CAD; build-ul nu pretinde că inventează acea geometrie în lipsa unui astfel de motor. Fluxul GLB/GLTF este complet funcțional.
