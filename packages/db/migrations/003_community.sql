-- Fase 2: comunidad. Avisos de los conductores sobre cada estación ("funciona", "averiado"…).
-- Sin cuentas todavía: cada dispositivo envía un id anónimo que se guarda solo como hash.

CREATE TABLE community_reports (
  id           bigserial PRIMARY KEY,
  location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'WORKS', 'BROKEN', 'CONNECTOR_DAMAGED', 'BLOCKED_BY_CAR', 'PRICE_DIFFERENT',
                 'NOT_EXISTS', 'OTHER')),
  comment      text CHECK (char_length(comment) <= 280),
  device_hash  text NOT NULL,
  hidden       boolean NOT NULL DEFAULT false,   -- moderación
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_reports_location_idx ON community_reports (location_id, created_at DESC);
CREATE INDEX community_reports_device_idx ON community_reports (device_hash, created_at DESC);
