'use strict';

const env = require('../config/env');

module.exports = env.STORAGE_DRIVER === 's3' ? require('./s3') : require('./local');

