const _ = require('lodash');
const crypto = require('crypto');
const net = require('net');
const {wait} = require('./concurrent.js');

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

E.tagFn = cb=>function(parts, ...args){
    let result = '';
    if (!Array.isArray(parts))
        return parts;
    for (let i = 0; i<parts.length; i++) {
        result += parts[i];
        if (i<args?.length)
        {
            let v = args[i];
            result += _.isFunction(v) ? cb(v) : v;
        }
    }
    return result;
};

E.templateToString = E.tagFn(v=>v());

E.randomString = (length=32)=>{
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let counter = 0;
    while (counter<length) {
        result += characters.charAt(Math.floor(Math.random()*characters.length));
        counter += 1;
    }
    return result;
};

E.generateId = (opt={})=>{
    const {prefix, length=32} = opt;
    let id = Date.now().toString(36);
    id += E.randomString(length-id.length);
    if (prefix)
        id = prefix+'_'+id;
    id = id.substring(0, length);
    return id;
};

E.nl2sp = function(parts, ...args) {
    return E.templateToString(parts, args).replace(/\s*(\r\n|\r|\n)\s*/g, ' ');
};

E.nl2br = function(parts, ...args) {
    return E.templateToString(parts, args).replace(/\s*(\r\n|\r|\n)\s*/g, '<br/>');
};

E.qw = function(parts, ...args) {
    return E.templateToString(parts, args).trim().split(/\s+/g);
};

E.splitLines = function(parts, ...args) {
    return E.templateToString(parts, args).trim().split(/\s*(\r\n|\r|\n)\s*/g)
        .filter(v=>!['\r\n', '\r', '\n'].includes(v));
};

E.json2str = (obj, indent=2, replacer=null)=>JSON.stringify(obj, replacer, indent);

E.clearObj = obj=>{
    for (let k in obj) {
        if (obj.hasOwnProperty(k))
            delete obj[k];
    }
};

E.appendProps = (obj, props)=>{
    if (!props)
        return;
    const clone = structuredClone(props);
    Object.keys(clone).forEach(k=>obj[k] = clone[k]);
};

E.clearAndAppend = (obj, props)=>{
    E.clearObj(obj);
    E.appendProps(obj, props);
};

const regexSpecials = E.qw`- [ ] / { } ( ) * + ? . \\ ^ $ |`;

E.escapeRegExp = str=>str.replace(RegExp('['+regexSpecials.join('\\')+']', 'g'), '\\$&');

E.arrayRandom = arr=>arr[Math.floor(Math.random()*arr.length)];

E.createError = (message, code, extra)=>Object.assign(new Error(), {message, code, extra});

E.getEnv = ()=>{
    if (process.env.DCHENV=='PRD'||process.env.REACT_APP_ENV=='production')
        return 'PRD';
    if (process.env.DCHENV=='STG'||process.env.REACT_APP_ENV=='staging')
        return 'STG';
    return 'DEV';
};

E.isProdEnv = ()=>E.getEnv()=='PRD';

E.isStgEnv = ()=>E.getEnv()=='STG';

E.isDevEnv = ()=>E.getEnv()=='DEV';

E.arrToObj = (arr=[], iteratee)=>arr.reduce((acc, el)=>{
    const res = _.isFunction(iteratee) ? iteratee(el) : iteratee;
    let k, v;
    if (Array.isArray(res)) {
        [k, v] = res;
    } else {
        k = el;
        v = res;
    }
    return {...acc, ...k?.length&&{[k]: v}};
}, {});

E.strEnum = (parts, ...args)=>E.arrToObj(E.qw(parts, ...args), String);

E.symbolEnum = (parts, ...args)=>E.arrToObj(E.qw(parts, ...args), Symbol);

E.callWith = (...args)=>fn=>fn.apply(null, args);

E.callbacks = ()=>{
    const cbs = {};
    const remove = id=>()=>delete cbs[id];    
    const add = cb=>{
        const id = E.generateId();
        cbs[id] = cb;
        return remove(id);
    };
    const trigger = (_this, ...args)=>_.values(cbs).forEach(cb=>cb.apply(_this, args));
    const size = ()=>_.keys(cbs).length;
    return {add, trigger, size};
};

E.isMocha = ()=>!!+process.env.MOCHA;

E.isLittleEndian = (()=>{
    let t32 = new Uint32Array(1);
    let t8 = new Uint8Array(t32.buffer);
    t8[0] = 0x0A;
    t8[1] = 0x0B;
    t8[2] = 0x0C;
    t8[3] = 0x0D;
    return t32[0]===0x0D0C0B0A;
})();

E.isBigEndian = !E.isLittleEndian;

E.dynamicProxy = getTarget=>new Proxy({}, {
    get(__, prop){
        let target = getTarget();
        let v = Reflect.get(target, prop, target);
        return _.isFunction(v) ? v.bind(target) : v;
    },
});

E.lazyProxy = factory=>{
    let target;
    return new Proxy({}, {
        get(__, prop){
            if (!target)
                target = factory();
            let v = Reflect.get(target, prop, target);
            return _.isFunction(v) ? v.bind(target) : v;
        },
    });
};
