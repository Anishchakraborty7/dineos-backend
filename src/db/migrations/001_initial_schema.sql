-- ============================================================
-- DineOS — Initial Database Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SUPER ADMINS (your team only — created via /super/auth/setup)
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
-- RESTAURANTS (master tenant registry)
-- Each row = one restaurant / tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  restaurant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key         VARCHAR(64) UNIQUE NOT NULL,

  -- Identity
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,  -- URL-safe name, e.g. "pizza-palace"

  -- Owner / Contact
  owner_name      VARCHAR(100),
  owner_email     VARCHAR(255) NOT NULL,
  owner_phone     VARCHAR(20),

  -- Location
  address         TEXT,
  city            VARCHAR(100),
  state           VARCHAR(100),
  pincode         VARCHAR(10),
  timezone        VARCHAR(50) DEFAULT 'Asia/Kolkata',

  -- Business
  plan            VARCHAR(20) DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
  is_active       BOOLEAN DEFAULT true,

  -- Internal
  onboarded_at    TIMESTAMP DEFAULT NOW(),
  onboarded_by    UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
  notes           TEXT  -- private notes visible only to super admin
);

CREATE INDEX IF NOT EXISTS idx_restaurants_api_key ON restaurants(api_key);
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_active ON restaurants(is_active);

-- ============================================================
-- RESTAURANT CONFIG (white-label branding + feature flags)
-- One row per restaurant
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_config (
  config_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID UNIQUE REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,

  -- Branding
  logo_url          VARCHAR(500),
  primary_color     VARCHAR(7) DEFAULT '#E63946',
  secondary_color   VARCHAR(7) DEFAULT '#1D3557',
  accent_color      VARCHAR(7) DEFAULT '#F1FAEE',
  font_family       VARCHAR(50) DEFAULT 'Poppins',
  hero_image_url    VARCHAR(500),
  tagline           VARCHAR(255),
  about_text        TEXT,

  -- Social Links
  social_facebook   VARCHAR(255),
  social_instagram  VARCHAR(255),
  social_twitter    VARCHAR(255),
  social_whatsapp   VARCHAR(20),

  -- Feature Flags (which modules are enabled for this restaurant)
  features_enabled  JSONB DEFAULT '{
    "online_ordering": true,
    "table_reservation": false,
    "open_mic": false,
    "loyalty_program": false,
    "delivery": true,
    "dine_in": true,
    "qr_ordering": false
  }'::jsonb,

  -- Domain
  custom_domain     VARCHAR(255),
  maps_link         VARCHAR(500),

  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- API KEY ROTATION LOG (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_key_logs (
  log_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  old_key_prefix    VARCHAR(20),  -- first 12 chars of old key for reference
  new_key_prefix    VARCHAR(20),  -- first 12 chars of new key
  rotated_by        UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
  reason            VARCHAR(255) DEFAULT 'Manual rotation',
  rotated_at        TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PLACEHOLDER: Future Phase Tables
-- These are commented out — to be added in later migrations
-- ============================================================

-- Phase 2: Menu
-- menu_categories, menu_items

-- Phase 2: Orders
-- customers, orders, order_items

-- Phase 2: Tables & Reservations
-- tables, reservations

-- Phase 3: Events
-- events, event_registrations

-- Phase 3: Loyalty
-- loyalty_transactions

-- Phase 3: Reviews
-- reviews

-- ============================================================
-- SAMPLE DATA: Default super admin record
-- This is a placeholder — use /super/auth/setup to create yours
-- ============================================================
-- (No sample data inserted — use the setup endpoint)
