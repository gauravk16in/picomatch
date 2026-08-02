'use strict';

/**
 * adapter/posix.js — the POSIX entry: same surface as adapter/index.js but
 * WITHOUT os.platform() defaulting (mirrors reference/posix.js).
 */

module.exports = require('./index');
