-- ============================================================
-- DineOS — Migration 005: Tables & Reservations
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_tables (
  table_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  table_number    VARCHAR(20) NOT NULL,
  capacity        INT DEFAULT 4,
  location        VARCHAR(50),  -- e.g. 'Indoor', 'Outdoor', 'Rooftop'
  status          VARCHAR(20) DEFAULT 'available'
                    CHECK (status IN ('available','occupied','reserved','maintenance')),
  qr_code_url     VARCHAR(500),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, table_number)
);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON restaurant_tables(restaurant_id);

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  table_id        UUID REFERENCES restaurant_tables(table_id) ON DELETE SET NULL,
  guest_name      VARCHAR(100) NOT NULL,
  guest_phone     VARCHAR(20) NOT NULL,
  guest_email     VARCHAR(255),
  party_size      INT NOT NULL DEFAULT 2,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_mins   INT DEFAULT 90,
  status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  occasion        VARCHAR(100),  -- Birthday, Anniversary, etc.
  special_requests TEXT,
  notes           TEXT,  -- internal admin notes
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(restaurant_id, status);
