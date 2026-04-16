-- ============================================================
-- DineOS — Migration 002: Restaurant Staff Users
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_users (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  role            VARCHAR(20) NOT NULL DEFAULT 'owner'
                    CHECK (role IN ('owner', 'manager', 'staff')),
  is_active       BOOLEAN DEFAULT true,
  last_login      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_users_restaurant ON restaurant_users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_email ON restaurant_users(email);
