'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middlewares/auth');
const auth = require('../controllers/auth.controller');

const router = Router();

router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.get('/auth/me', requireAuth, auth.me);

module.exports = router;
