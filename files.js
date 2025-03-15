const path = require('path');
const fs = require('fs');
const {streamHash} = require('./stream.js');

const E = module.exports;

E.appPath = p=>path.join(process.env.APP_DIR||process.env.HOME, p);

E.fileHash = file=>streamHash(fs.createReadStream(file));
