-- Demo seed used by Build 02.
insert into public.projects (name,slug,description,real_height_m,display_height_units,model_path)
values ('Demo Residence','demo-residence','Estate Studio demo project',27,2.7,null)
on conflict (slug) do nothing;

insert into public.buildings(project_id,name,sort_order,floors_count,default_floor_height_m,ground_floor_different,ground_floor_height_m)
select id,'Bloc 1',0,9,3,false,3 from public.projects p
where p.slug='demo-residence'
and not exists(select 1 from public.buildings b where b.project_id=p.id and b.name='Bloc 1');

insert into public.floors(building_id,name,floor_number,sort_order,height_from_m,height_to_m)
select b.id, case when g=0 then 'Parter' else 'Etaj '||g end, g,g,g*3,(g+1)*3
from public.buildings b join public.projects p on p.id=b.project_id cross join generate_series(0,8) g
where p.slug='demo-residence' and b.name='Bloc 1'
on conflict(building_id,floor_number) do nothing;
