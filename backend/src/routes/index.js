'use strict';

const express = require('express');

const router = express.Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/', require('./masterdata.routes'));
router.use('/', require('./cycle.routes'));

module.exports = router;
