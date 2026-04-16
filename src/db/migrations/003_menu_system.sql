-- ============================================================
-- DineOS — Migration 003: Menu System
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_categories (
  category_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  image_url       VARCHAR(500),
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id);

CREATE TABLE IF NOT EXISTS menu_items (
  item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(restaurant_id, is_available);
