const _ = require('lodash');
const crypto = require('crypto');
const net = require('net');
const {wait} = require('./dchcore/concurrent.js');

const E = module.exports;

E.md5 = s=>crypto.createHash('md5').update(s).digest('hex');

E.hashObject = v=>{
    if (_.isObject(v)) {
        return E.md5(JSON.stringify(_.keys(v).sort().reduce((acc, k)=>({
            ...acc,
            [k]: E.hashObject(v[k]),
        }), {})));
    } 
    if (_.isArray(v))
        return E.md5(JSON.stringify(v.map(k=>E.hashObject(k))));
    return v;
}

E.findFreePort = ()=>{
    let w = wait(), srv = net.createServer();
    srv.listen(0, ()=>{
        let {port} = srv.address();
        srv.close();
        w.resolve(port);
    });
    return w.promise;
};
