-- Esquema inicial: modelo inspirado en OCPI 2.2.1 (Location → EVSE → Connector)
-- con linaje por fuente de datos y campos desnormalizados para el mapa.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() no es IMMUTABLE; este envoltorio permite usarlo en índices y columnas generadas.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE data_sources (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  attribution     text NOT NULL,
  license_name    text,
  license_url     text,
  -- Mayor = más fiable. Decide qué fuente "manda" cuando dos describen la misma estación.
  priority        integer NOT NULL,
  last_sync_at    timestamptz,
  last_sync_stats jsonb
);

CREATE TABLE operators (
  id                  text PRIMARY KEY,         -- Party ID eMI3 (p. ej. 'ES*IBD') o id de la fuente
  name                text NOT NULL,            -- nombre comercial a mostrar
  legal_name          text,
  country_code        char(2),
  website             text,
  phone               text,
  app_ios_url         text,
  app_android_package text,
  deeplink_template   text,
  -- true si el nombre/enlaces vienen del catálogo curado y la ingesta no debe pisarlos
  curated             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id        text REFERENCES operators(id),
  name               text NOT NULL,
  street             text,
  city               text,
  postal_code        text,
  province           text,
  region             text,
  country_code       char(2) NOT NULL,
  geom               geometry(Point, 4326) NOT NULL,
  opening_hours      jsonb NOT NULL DEFAULT '{"twentyFourSeven": false, "regularHours": [], "text": null}',
  is_24_7            boolean NOT NULL DEFAULT false,
  site_type          text,
  payment_methods    text[] NOT NULL DEFAULT '{}',
  accepted_providers text[] NOT NULL DEFAULT '{}',
  facilities         text[] NOT NULL DEFAULT '{}',

  -- Desnormalizado para el mapa y los filtros (lo recalcula la ingesta).
  max_power_kw       real NOT NULL DEFAULT 0,
  has_dc             boolean NOT NULL DEFAULT false,
  connector_groups   text[] NOT NULL DEFAULT '{}',
  evse_count         integer NOT NULL DEFAULT 0,
  available_count    integer,                   -- null = sin datos dinámicos
  status_summary     text NOT NULL DEFAULT 'UNKNOWN',
  status_updated_at  timestamptz,

  primary_source_id  text NOT NULL REFERENCES data_sources(id),
  source_updated_at  timestamptz,
  is_active          boolean NOT NULL DEFAULT true,
  search_text        text GENERATED ALWAYS AS (
    -- unaccent antes que lower: con locale C, lower() no convierte letras acentuadas.
    lower(f_unaccent(coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(street, '')))
  ) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locations_geom_idx ON locations USING gist (geom) WHERE is_active;
CREATE INDEX locations_connector_groups_idx ON locations USING gin (connector_groups);
CREATE INDEX locations_payment_methods_idx ON locations USING gin (payment_methods);
CREATE INDEX locations_operator_idx ON locations (operator_id);
CREATE INDEX locations_power_idx ON locations (max_power_kw);
CREATE INDEX locations_search_idx ON locations USING gin (search_text gin_trgm_ops);

CREATE TABLE evses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  source_id         text NOT NULL REFERENCES data_sources(id),
  record_external_id text NOT NULL,             -- id de la estación (registro) en la fuente
  external_id       text NOT NULL,              -- id del punto en la fuente
  evse_id           text,                       -- eMI3 normalizado, p. ej. 'ES*IBD*E157215'
  status            text NOT NULL DEFAULT 'UNKNOWN',
  status_updated_at timestamptz,
  tariffs           jsonb NOT NULL DEFAULT '[]',
  UNIQUE (source_id, external_id)
);
CREATE INDEX evses_location_idx ON evses (location_id);
CREATE INDEX evses_record_idx ON evses (source_id, record_external_id);
CREATE INDEX evses_evse_id_idx ON evses (evse_id) WHERE evse_id IS NOT NULL;

CREATE TABLE connectors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evse_uuid    uuid NOT NULL REFERENCES evses(id) ON DELETE CASCADE,
  standard     text NOT NULL,
  group_key    text NOT NULL,                   -- grupo de filtro (CCS2, TYPE2, …) de @pc/shared
  format       text,
  power_type   text,
  max_power_kw real NOT NULL DEFAULT 0,
  max_voltage  real,
  max_amperage real
);
CREATE INDEX connectors_evse_idx ON connectors (evse_uuid);

-- Linaje: cada registro de cada fuente y a qué estación unificada se asignó.
CREATE TABLE source_records (
  source_id     text NOT NULL REFERENCES data_sources(id),
  external_id   text NOT NULL,
  location_id   uuid REFERENCES locations(id) ON DELETE SET NULL,
  payload_hash  text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  PRIMARY KEY (source_id, external_id)
);
CREATE INDEX source_records_location_idx ON source_records (location_id);

-- Recalcula los campos desnormalizados de las estaciones indicadas.
-- La lógica de status_summary replica summarizeSiteStatus() de @pc/shared: mantener ambas iguales.
CREATE OR REPLACE FUNCTION refresh_location_summary(ids uuid[]) RETURNS void
  LANGUAGE sql
AS $$
  UPDATE locations l SET
    evse_count        = coalesce(s.evse_count, 0),
    max_power_kw      = coalesce(s.max_kw, 0),
    has_dc            = coalesce(s.has_dc, false),
    connector_groups  = coalesce(s.groups, '{}'),
    available_count   = s.available_count,
    status_summary    = coalesce(s.status_summary, 'UNKNOWN'),
    status_updated_at = s.status_updated_at,
    updated_at        = now()
  FROM (
    SELECT
      id AS location_id,
      (SELECT count(*) FROM evses e WHERE e.location_id = x.id) AS evse_count,
      (SELECT max(c.max_power_kw) FROM evses e JOIN connectors c ON c.evse_uuid = e.id
         WHERE e.location_id = x.id) AS max_kw,
      (SELECT bool_or(c.power_type = 'DC') FROM evses e JOIN connectors c ON c.evse_uuid = e.id
         WHERE e.location_id = x.id) AS has_dc,
      (SELECT array_agg(DISTINCT c.group_key ORDER BY c.group_key) FROM evses e
         JOIN connectors c ON c.evse_uuid = e.id WHERE e.location_id = x.id) AS groups,
      st.available_count,
      st.status_summary,
      st.status_updated_at
    FROM unnest(ids) AS x(id)
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN max(e.status_updated_at) IS NULL THEN NULL
             ELSE count(*) FILTER (WHERE e.status = 'AVAILABLE') END AS available_count,
        CASE
          WHEN count(*) = 0 THEN 'UNKNOWN'
          WHEN bool_or(e.status = 'AVAILABLE') THEN 'AVAILABLE'
          WHEN bool_or(e.status IN ('CHARGING', 'BLOCKED', 'RESERVED')) THEN 'OCCUPIED'
          WHEN bool_and(e.status IN ('OUTOFORDER', 'INOPERATIVE', 'PLANNED', 'REMOVED')) THEN 'OUT_OF_SERVICE'
          ELSE 'UNKNOWN'
        END AS status_summary,
        max(e.status_updated_at) AS status_updated_at
      FROM evses e WHERE e.location_id = x.id
    ) st ON true
  ) s
  WHERE l.id = s.location_id;
$$;

-- Posibles duplicados en zona gris, para revisión manual (panel admin, fase 2).
CREATE TABLE dedup_candidates (
  id                    bigserial PRIMARY KEY,
  source_id             text NOT NULL,
  external_id           text NOT NULL,
  candidate_location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  score                 real NOT NULL,
  reasons               jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolution            text,
  UNIQUE (source_id, external_id, candidate_location_id)
);
