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
