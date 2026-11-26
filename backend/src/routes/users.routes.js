'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middlewares/auth');
const users = require('../controllers/users.controller');

// Todas las rutas del CRUD requieren un JWT válido.
const router = Router();

router.get('/users', requireAuth, users.list);
router.get('/users/:id', requireAuth, users.getById);
router.post('/users', requireAuth, users.create);
router.put('/users/:id', requireAuth, users.update);
router.delete('/users/:id', requireAuth, users.remove);

module.exports = router;
