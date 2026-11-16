-- Fase 2: catálogo de modelos de vehículo (Open EV Data) para estimar cargas y rutas.

ALTER TABLE data_sources ADD COLUMN kind text NOT NULL DEFAULT 'stations';

CREATE TABLE vehicle_models (
  id                  text PRIMARY KEY,           -- id de la fuente (UUID de Open EV Data)
  source_id           text NOT NULL REFERENCES data_sources(id),
  brand               text NOT NULL,
  model               text NOT NULL,
  variant             text,
  release_year        integer,
  vehicle_type        text NOT NULL DEFAULT 'car',
  usable_battery_kwh  real NOT NULL,
  consumption_kwh_100 real,
  ac_max_kw           real NOT NULL,
  ac_phases           integer NOT NULL DEFAULT 1,
  dc_max_kw           real,
  dc_curve            jsonb,                      -- [{ soc, powerKw }]
  connector_groups    text[] NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT true,
  search_text         text GENERATED ALWAYS AS (
    lower(f_unaccent(brand || ' ' || model || ' ' || coalesce(variant, '') || ' ' || coalesce(release_year::text, '')))
  ) STORED,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_models_search_idx ON vehicle_models USING gin (search_text gin_trgm_ops);
