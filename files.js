const path = require('path');

const E = module.exports;

E.appPath = p=>path.join(process.env.APP_DIR||process.env.HOME, p);
