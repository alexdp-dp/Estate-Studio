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
