-- Estate Studio core schema (already applied to the connected project).
-- Keep this file in GitHub as the reproducible database definition.
create extension if not exists pgcrypto;
do $$ begin create type public.apartment_status as enum ('available','reserved','sold'); exception when duplicate_object then null; end $$;
-- See live Supabase project for current schema. Build 02 expects:
-- projects, buildings, floors, apartments, apartment_polygons, project_assets
