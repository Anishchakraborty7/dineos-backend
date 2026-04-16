-- ============================================================
-- DineOS Migration 002: Schema Upgrade
-- Migrates from the old integer-id schema to the new UUID schema
-- ============================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. Add UUID columns to restaurants table
-- ============================================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS restaurant_id UUID DEFAULT gen_random_uuid();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP DEFAULT NOW();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS onboarded_by UUID;

-- Populate restaurant_id where null
UPDATE restaurants SET restaurant_id = gen_random_uuid() WHERE restaurant_id IS NULL;

-- Add unique constraint on restaurant_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_restaurant_id_key') THEN
    ALTER TABLE restaurants ADD CONSTRAINT restaurants_restaurant_id_key UNIQUE (restaurant_id);
  END IF;
END $$;

-- ============================================================
-- 2. restaurant_config table (previously restaurants had inline columns)
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_config (
  config_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  logo_url          VARCHAR(500),
  primary_color     VARCHAR(20) DEFAULT '#E63946',
  secondary_color   VARCHAR(20) DEFAULT '#1D3557',
  accent_color      VARCHAR(20) DEFAULT '#A8DADC',
  font_family       VARCHAR(50) DEFAULT 'Inter',
  hero_image_url    VARCHAR(500),
  tagline           TEXT,
  about_text        TEXT,
  social_facebook   VARCHAR(500),
  social_instagram  VARCHAR(500),
  social_twitter    VARCHAR(500),
  social_whatsapp   VARCHAR(50),
  features_enabled  JSONB DEFAULT '{"online_ordering": true, "table_reservation": true, "qr_ordering": false, "reviews": false}'::jsonb,
  custom_domain     VARCHAR(255),
  maps_link         VARCHAR(500),
  updated_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id)
);

-- Migrate config data from restaurants table
INSERT INTO restaurant_config (restaurant_id, primary_color, secondary_color, tagline)
SELECT id, COALESCE(primary_color, '#E63946'), COALESCE(secondary_color, '#1D3557'), tagline
FROM restaurants
ON CONFLICT (restaurant_id) DO NOTHING;

-- ============================================================
-- 3. super_admins table
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admins (
  admin_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  last_login      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 4. api_key_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS api_key_logs (
  log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  old_key_prefix  VARCHAR(20),
  new_key_prefix  VARCHAR(20),
  rotated_by      UUID,
  reason          TEXT,
  rotated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 5. restaurant_users (admin login accounts)
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_users (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  role            VARCHAR(20) NOT NULL DEFAULT 'owner'
                    CHECK (role IN ('owner', 'manager', 'staff')),
  is_active       BOOLEAN DEFAULT true,
  last_login      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_users_email ON restaurant_users(restaurant_id, email);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_rest ON restaurant_users(restaurant_id);

-- ============================================================
-- 6. menu_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_categories (
  category_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  image_url       VARCHAR(500),
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_rest ON menu_categories(restaurant_id);

-- ============================================================
-- 7. menu_items (upgrade from menus table)
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES menu_categories(category_id) ON DELETE SET NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  image_url       VARCHAR(500),
  is_veg          BOOLEAN DEFAULT true,
  is_available    BOOLEAN DEFAULT true,
  is_featured     BOOLEAN DEFAULT false,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_rest ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items(category_id);

-- Migrate existing menus data
INSERT INTO menu_items (restaurant_id, name, description, price, is_available)
SELECT restaurant_id, name, description, price, is_available FROM menus
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  customer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(100),
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(255),
  password_hash   VARCHAR(255),
  address         TEXT,
  fcm_token       VARCHAR(500),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(restaurant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_rest ON customers(restaurant_id);

-- ============================================================
-- 9. New orders_v2 (UUID-based, richer schema alongside old orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders_v2 (
  order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  order_number      INT NOT NULL,
  order_type        VARCHAR(20) NOT NULL DEFAULT 'delivery'
                      CHECK (order_type IN ('delivery','dine_in','takeaway')),
  status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled')),
  table_number      VARCHAR(20),
  subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount        DECIMAL(10,2) DEFAULT 0,
  delivery_fee      DECIMAL(10,2) DEFAULT 0,
  discount_amount   DECIMAL(10,2) DEFAULT 0,
  total_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(30) DEFAULT 'cod',
  payment_status    VARCHAR(20) DEFAULT 'pending',
  delivery_address  TEXT,
  customer_notes    TEXT,
  estimated_time    INT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_v2_rest ON orders_v2(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_v2_status ON orders_v2(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_v2_created ON orders_v2(restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items_v2 (
  order_item_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders_v2(order_id) ON DELETE CASCADE,
  item_id         UUID REFERENCES menu_items(item_id) ON DELETE SET NULL,
  item_name       VARCHAR(200) NOT NULL,
  item_price      DECIMAL(10,2) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price     DECIMAL(10,2) NOT NULL,
  special_notes   TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_v2_order ON order_items_v2(order_id);

-- ============================================================
-- 10. restaurant_tables
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_tables (
  table_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number    VARCHAR(20) NOT NULL,
  capacity        INT DEFAULT 4,
  location        VARCHAR(50),
  status          VARCHAR(20) DEFAULT 'available'
                    CHECK (status IN ('available','occupied','reserved','maintenance')),
  qr_code_url     VARCHAR(500),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_num ON restaurant_tables(restaurant_id, table_number);
CREATE INDEX IF NOT EXISTS idx_tables_rest ON restaurant_tables(restaurant_id);

-- ============================================================
-- 11. reservations
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  reservation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
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
  occasion        VARCHAR(100),
  special_requests TEXT,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_rest ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, reservation_date);

-- ============================================================
-- 12. subscriptions_v2 (upgrade subscriptions table)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions_v2 (
  subscription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     INTEGER UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  plan              VARCHAR(20) NOT NULL DEFAULT 'basic'
                      CHECK (plan IN ('basic','pro','enterprise')),
  status            VARCHAR(20) DEFAULT 'trial'
                      CHECK (status IN ('active','trial','expired','cancelled','paused')),
  trial_ends_at     TIMESTAMP,
  current_period_start TIMESTAMP DEFAULT NOW(),
  current_period_end   TIMESTAMP,
  monthly_amount    DECIMAL(10,2) DEFAULT 0,
  currency          VARCHAR(3) DEFAULT 'INR',
  gateway_subscription_id VARCHAR(255),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_history (
  payment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions_v2(subscription_id) ON DELETE SET NULL,
  amount            DECIMAL(10,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'INR',
  status            VARCHAR(20) DEFAULT 'pending',
  payment_type      VARCHAR(30) DEFAULT 'subscription',
  gateway_payment_id VARCHAR(255),
  description       TEXT,
  paid_at           TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_v2_rest ON subscriptions_v2(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payments_rest ON payment_history(restaurant_id);

-- ============================================================
-- 13. plan_limits
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_limits (
  plan              VARCHAR(20) PRIMARY KEY,
  max_menu_items    INT DEFAULT 50,
  max_tables        INT DEFAULT 10,
  max_staff_users   INT DEFAULT 2,
  monthly_price_inr DECIMAL(10,2) DEFAULT 0,
  features          JSONB DEFAULT '{}'::jsonb
);

INSERT INTO plan_limits (plan, max_menu_items, max_tables, max_staff_users, monthly_price_inr, features)
VALUES
  ('basic',      50,  10, 2,  999,  '{"online_ordering":true,"qr_ordering":false,"reservations":false,"analytics":false}'::jsonb),
  ('pro',        200, 30, 5,  2499, '{"online_ordering":true,"qr_ordering":true,"reservations":true,"analytics":true}'::jsonb),
  ('enterprise', 999, 99, 20, 4999, '{"online_ordering":true,"qr_ordering":true,"reservations":true,"analytics":true}'::jsonb)
ON CONFLICT (plan) DO NOTHING;
