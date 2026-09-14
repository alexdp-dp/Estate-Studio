# Estate Studio — Build 02 / Supabase

This build no longer uses `data/project.json`. Projects, buildings, floors, apartments and polygons are loaded from and saved to Supabase.

## Already created in Supabase
Tables:
- projects
- buildings
- floors
- apartments
- apartment_polygons
- project_assets

Storage buckets:
- models
- floor-plans
- project-images
- apartment-images

## Render
Create a Node Web Service connected to this GitHub repository.

Build command:
`npm install && npm run install:all && npm run build`

Start command:
`npm start`

Environment variables:
- `SUPABASE_URL=https://tdcrjumaidgsdnohusmk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=` copy the service-role/secret key from Supabase Project Settings > API
- `JWT_SECRET=` any long random string
- `NODE_ENV=production`

Never put the service-role key in the React client or commit it to GitHub.

## Routes
- `/` public 3D viewer
- `/admin` admin
- `/api/health` database connection check

## Build 02 features
- Supabase database persistence
- Supabase Storage uploads for GLB and floor plans
- Real-geometry floor highlight
- Floor vertical ranges stored in DB
- Apartment polygons stored as normalized 0..1 coordinates
- Apartment statuses: available / reserved / sold
- Public floor plan status overlay
- Test admin login retained from Build 01

The included local GLB remains only as a fallback/sample file. Once you upload a GLB in Admin, its Supabase Storage URL is saved in `projects.model_path`.
