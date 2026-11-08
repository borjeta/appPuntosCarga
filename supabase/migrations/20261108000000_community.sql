-- Comunidad: avisos de conductores sobre cada estación ("funciona", "averiado"…).
--
-- Seguridad (Row Level Security):
--   · Cualquiera puede LEER los avisos visibles, pero solo las columnas públicas: nunca quién los
--     envió (user_id), para que no se pueda seguir el rastro de un usuario por las estaciones.
--   · Solo usuarios autenticados (incluidos los anónimos de Supabase Auth) pueden ESCRIBIR, siempre
--     en su propio nombre; user_id, hidden y created_at los fija la base de datos.
--   · Límite anti-abuso: 3 avisos por estación y 20 en total por usuario cada 24 h.
--   · Los comentarios con enlaces quedan ocultos hasta revisión (spam).

create table public.community_reports (
  id          bigint generated always as identity primary key,
  -- Id estable de estación del dataset estático (p. ej. "es:2023002088", "pt:SGM-GMR-00022")
  station_id  text not null check (station_id ~ '^[a-z0-9-]{2,16}:[A-Za-z0-9._*/-]{1,64}$'),
  type        text not null check (type in (
                'WORKS', 'BROKEN', 'CONNECTOR_DAMAGED', 'BLOCKED_BY_CAR', 'PRICE_DIFFERENT',
                'NOT_EXISTS', 'OTHER')),
  comment     text check (char_length(comment) <= 280),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index community_reports_station_idx on public.community_reports (station_id, created_at desc);
create index community_reports_user_idx on public.community_reports (user_id, created_at desc);

alter table public.community_reports enable row level security;

create policy "Leer avisos visibles"
  on public.community_reports for select
  to anon, authenticated
  using (not hidden);

create policy "Crear avisos en nombre propio"
  on public.community_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Permisos por columna: lectura sin user_id/hidden; escritura solo de los campos del aviso.
revoke all on public.community_reports from anon, authenticated;
grant select (id, station_id, type, comment, created_at) on public.community_reports to anon, authenticated;
grant insert (station_id, type, comment) on public.community_reports to authenticated;

create function public.community_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.community_reports r
       where r.user_id = new.user_id and r.station_id = new.station_id
         and r.created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.community_reports r
       where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limit' using errcode = 'P0001', hint = 'Demasiados avisos en las últimas 24 horas';
  end if;

  new.comment := nullif(btrim(regexp_replace(coalesce(new.comment, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), '');
  new.hidden := new.comment is not null and new.comment ~* '(https?://|www\.)';
  new.created_at := now();
  return new;
end;
$$;

create trigger community_reports_before_insert
  before insert on public.community_reports
  for each row execute function public.community_reports_before_insert();
