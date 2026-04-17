-- ============================================================
-- DineOS — Migration 007: Events & Open Mic
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  event_type      VARCHAR(50) DEFAULT 'open_mic'
                    CHECK (event_type IN ('open_mic', 'live_music', 'comedy', 'special', 'other')),
  event_date      DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME,
  cover_charge    DECIMAL(10,2) DEFAULT 0,
  max_performers  INT, -- for open_mic
  max_attendees   INT,
  status          VARCHAR(20) DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_restaurant ON events(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

CREATE TABLE IF NOT EXISTS event_registrations (
  registration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(customer_id) ON DELETE SET NULL,
  guest_name      VARCHAR(100),
  guest_phone     VARCHAR(20),
  role            VARCHAR(20) DEFAULT 'attendee'
                    CHECK (role IN ('performer', 'attendee')),
  status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  performance_type VARCHAR(100), -- 'Guitar', 'Standup', etc.
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_reg_event ON event_registrations(event_id);

-- Update plan_limits to include events feature. Basic = false, Pro = true, Enterprise = true
UPDATE plan_limits 
SET features = jsonb_set(features, '{events}', 'false'::jsonb) 
WHERE plan = 'basic';

UPDATE plan_limits 
SET features = jsonb_set(features, '{events}', 'true'::jsonb) 
WHERE plan IN ('pro', 'enterprise');
