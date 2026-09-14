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
