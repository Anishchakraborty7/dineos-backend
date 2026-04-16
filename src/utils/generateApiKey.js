const crypto = require('crypto');

/**
 * Generates a secure, unique API key for a restaurant.
 * Format: rk_live_<48-char-hex>
 * Example: rk_live_a1b2c3d4e5f6...
 */
const generateApiKey = () => {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `rk_live_${randomBytes}`;
};

/**
 * Generates a URL-safe slug from a restaurant name.
 * Example: "Pizza Palace & Grill!" → "pizza-palace-grill"
 */
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
    .replace(/\s+/g, '-')            // spaces to hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
    .substring(0, 60);               // max 60 chars
};

module.exports = { generateApiKey, generateSlug };
