-- ============================================================
-- DineOS — Migration 004: Customers & Orders
-- ============================================================

-- Customers (app users, scoped per restaurant)
CREATE TABLE IF NOT EXISTS customers (
  customer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  name            VARCHAR(100),
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(255),
  password_hash   VARCHAR(255),
  address         TEXT,
  fcm_token       VARCHAR(500),  -- for push notifications
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(restaurant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(restaurant_id, phone);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  order_number      INT NOT NULL,  -- human-readable, e.g. #1, #2 per restaurant
  order_type        VARCHAR(20) NOT NULL DEFAULT 'delivery'
                      CHECK (order_type IN ('delivery', 'dine_in', 'takeaway')),
  status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled')),
  table_number      VARCHAR(20),  -- for dine_in orders
  subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount        DECIMAL(10,2) DEFAULT 0,
  delivery_fee      DECIMAL(10,2) DEFAULT 0,
  discount_amount   DECIMAL(10,2) DEFAULT 0,
  total_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(30) DEFAULT 'cod'
                      CHECK (payment_method IN ('cod', 'online', 'upi', 'card')),
  payment_status    VARCHAR(20) DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','paid','failed','refunded')),
  delivery_address  TEXT,
  customer_notes    TEXT,
  estimated_time    INT,  -- minutes
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Per-restaurant order number sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(restaurant_id, created_at DESC);

-- Order Line Items
CREATE TABLE IF NOT EXISTS order_items (
  order_item_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  item_id         UUID REFERENCES menu_items(item_id) ON DELETE SET NULL,
  item_name       VARCHAR(200) NOT NULL,  -- snapshot at time of order
  item_price      DECIMAL(10,2) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price     DECIMAL(10,2) NOT NULL,
  special_notes   TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
