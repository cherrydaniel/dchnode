const _ = require('lodash');
const EventEmitter = require('events');
const requireFromString = require('require-from-string');
const {streamToString} = require('./stream.js');
const s3 = require('./s3.js');
const {useLock} = require('./concurrent.js');
const {clearAndAppend} = require('./util.js');

const E = module.exports;

const confs = {};

const load = async (path, client)=>requireFromString(
    await streamToString(s3.download(path, {client})));

E.get = key=>confs[key]?.data;

E.subscribe = (key, path)=>useLock(`confs.${key}`, async ()=>{
    const data = await load(path);
    const events = new EventEmitter();
    confs[key] = {path, events, data};
    process.nextTick(()=>events.emit('refresh', data));
});

E.unsubscribe = key=>delete confs[key];

E.refresh = async ()=>{
    const client = s3.createClient();
    await Promise.all(_.values(confs).map(async ({path, events, data})=>{
        const loadedModule = await load(path, client);
        clearAndAppend(data, loadedModule);
        events.emit('refresh', loadedModule);
    }));
};

E.onRefresh = (key, cb)=>confs[key].events.on('refresh', cb);
