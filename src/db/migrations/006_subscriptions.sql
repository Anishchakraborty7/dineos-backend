-- ============================================================
-- DineOS — Migration 006: Subscriptions & Billing
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID UNIQUE REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  plan              VARCHAR(20) NOT NULL DEFAULT 'basic'
                      CHECK (plan IN ('basic','pro','enterprise')),
  status            VARCHAR(20) DEFAULT 'trial'
                      CHECK (status IN ('active','trial','expired','cancelled','paused')),
  trial_ends_at     TIMESTAMP,
  current_period_start TIMESTAMP DEFAULT NOW(),
  current_period_end   TIMESTAMP,
  monthly_amount    DECIMAL(10,2) DEFAULT 0,
  currency          VARCHAR(3) DEFAULT 'INR',
  payment_gateway   VARCHAR(50) DEFAULT 'razorpay',
  gateway_customer_id VARCHAR(255),
  gateway_subscription_id VARCHAR(255),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_restaurant ON subscriptions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS payment_history (
  payment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(subscription_id) ON DELETE SET NULL,
  amount            DECIMAL(10,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'INR',
  status            VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','failed','refunded')),
  payment_type      VARCHAR(30) DEFAULT 'subscription',
  gateway_payment_id VARCHAR(255),
  gateway_order_id  VARCHAR(255),
  invoice_url       VARCHAR(500),
  description       TEXT,
  paid_at           TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_restaurant ON payment_history(restaurant_id);

-- Plan limits lookup (used by backend to enforce plan features)
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
  ('basic',      50,  10, 2,  999,  '{"online_ordering": true, "qr_ordering": false, "reservations": false, "analytics": false}'::jsonb),
  ('pro',        200, 30, 5,  2499, '{"online_ordering": true, "qr_ordering": true,  "reservations": true,  "analytics": true}'::jsonb),
  ('enterprise', 999, 99, 20, 4999, '{"online_ordering": true, "qr_ordering": true,  "reservations": true,  "analytics": true}'::jsonb)
ON CONFLICT (plan) DO NOTHING;
