const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const { generateToken } = require('../../utils/jwt');

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (!user.rows.length) {
    return res.status(400).json({ error: 'User not found' });
  }

  const valid = await bcrypt.compare(password, user.rows[0].password);

  if (!valid) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({
    id: user.rows[0].id,
    role: user.rows[0].role,
  });

  res.json({
    token,
    admin: user.rows[0],
  });
};