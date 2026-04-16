const router = require('express').Router();
const { login } = require('./auth.controller');

router.post('/login', login);

module.exports = router;