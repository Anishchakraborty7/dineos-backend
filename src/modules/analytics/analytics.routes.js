const router = require('express').Router();
const { getAnalytics } = require('./analytics.controller');
const auth = require('../../middleware/auth.middleware');

router.get('/', auth, getAnalytics);

module.exports = router;