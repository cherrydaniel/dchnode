const _ = require('lodash');
const EventEmitter = require('events');
const requireFromString = require('require-from-string');
const {streamToString} = require('./stream.js');
const s3 = require('./s3.js');
const {useLock} = require('./dchcore/concurrent.js');
const {clearAndAppend} = require('./dchcore/util.js');

const E = module.exports;

const confs = {};

const load = async (path, client)=>requireFromString(
    await streamToString(s3.download(path, {client})));

E.get = key=>confs[key];

E.subscribe = async (key, path)=>{
    await useLock(`confs.${key}`, async ()=>{
        confs[key] = {
            path,
            events: new EventEmitter(),
            data: await load(path),
        }
    });
};

E.unsubscribe = key=>delete confs[key];

E.refresh = async ()=>{
    const client = s3.createClient();
    await Promise.all(_.values(confs).map(async conf=>{
        const loadedModule = await load(conf.path, client);
        clearAndAppend(conf.data, loadedModule);
        conf.events.emit('refresh', loadedModule);
    }));
};

E.onRefresh = (key, cb)=>confs[key].events.on('refresh', cb);
