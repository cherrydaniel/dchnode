const {generateId, createError, callbacks} = require('./util.js');

const E = module.exports;

E.sleep = ms=>new Promise(resolve=>setTimeout(resolve, Math.max(0, ms||0)));

E.wait = ()=>{
    let resolve, reject;
    const promise = new Promise((_resolve, _reject)=>{
        resolve = _resolve;
        reject = _reject;
    });
    return {promise, resolve, reject};
};

const LOCKS = {};

E.isLocked = key=>!!LOCKS[key];

E.obtainLock = (key, timeout)=>{
    const id = generateId({prefix: `lock_${key}`});
    const release = ()=>{
        LOCKS[key].shift();
        if (LOCKS[key].length)
            return void LOCKS[key][0].resolve({release: LOCKS[key][0].release});
        delete LOCKS[key];
    };
    const w = E.wait();
    if (isFinite(timeout)) {
        setTimeout(()=>{
            if (!LOCKS[key])
                return;
            const idx = LOCKS[key].findIndex(v=>v.id==id);
            if (idx==-1)
                return;
            w.reject(createError(`Lock timed out: ${key}`, 'lock_timeout'));
            LOCKS[key].splice(idx, 1);
        }, timeout);
    }
    if (!LOCKS[key]) {
        LOCKS[key] = [{id, release, ...w}];
        w.resolve({release});
    } else {
        LOCKS[key].push({id, release, ...w});
    }
    return w.promise;
};

// useLock(key[, timeout], cb)
E.useLock = async (key, timeout, cb)=>{
    if (!isFinite(timeout) && !cb) {
        cb = timeout;
        timeout = undefined;
    }
    let lock;
    try {
        lock = await E.obtainLock(key, timeout);
        await cb?.();
    } finally {
        lock?.release();
    }
};

// lockNLoad(key[, timeout], loader)
E.lockNLoad = async (key, timeout, loader)=>{
    if (!loader) {
        loader = timeout;
        timeout = undefined;
    }
    return [await E.obtainLock(key, timeout), await loader()];
};

E.lockFunction = (obj, fn, opt={})=>{
    let {key=`${obj.constructor.name}/${fn}/${generateId()}`, timeout} = opt;
    const _fn = obj[fn];
    Object.defineProperty(obj, fn, {value: async function(...args){
        const lock = await E.obtainLock(key, timeout);
        try {
            return await _fn.apply(this, args);
        } finally {
            lock.release();
        }
    }});
};

E.asyncMap = async (arr, predicate)=>{
    let results = arr.map(v=>({v}));
    await Promise.all(results.map(async obj=>{
        obj.v = await predicate(obj.v);        
    }));
    return results.map(obj=>obj.v);
};

E.asyncFilter = async (arr, predicate)=>{
    let results = await E.asyncMap(arr,
        async v=>({v, filter: await predicate(v)}));
    return results.filter(obj=>obj.filter).map(obj=>obj.v);
};

E.waitTick = ()=>{
    let w = E.wait();
    process.nextTick(w.resolve);
    return w.promise;
};

E.waitEventEmitter = (emitter, ev)=>{
    let w = E.wait();
    emitter.once(ev, w.resolve);
    return w.promise;
};
