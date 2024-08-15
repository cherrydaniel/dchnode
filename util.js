const crypto = require('crypto');

const E = module.exports;

E.md5 = s=>crypto.createHash('md5').update(s).digest('hex');
