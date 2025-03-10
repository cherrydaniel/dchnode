const {generateId, createError, callbacks, isNode} = require('./util.js');

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

E.genTaskFunction = (obj, fn)=>{
    const _fn = obj[fn];
    if (_fn.constructor.name=='GeneratorFunction') {
        Object.defineProperty(obj, fn, {value: async function(...args){
            let _this = this;
            return await E.genTask(function*(){
                return yield _fn.call(_this, this, ...args);
            });
        }});
    } else {
        Object.defineProperty(obj, fn, {value: async function(...args){
            let _this = this;
            return await E.genTask(async function(){
                return await _fn.call(_this, this, ...args);
            });
        }});
    }
};

E.GenTaskResult = function(){};

class GenTask {
    constructor(fn){
        this._fn = fn;
        this._errorCallbacks = callbacks();
        this._finallyCallbacks = callbacks();
    }
    async _run(w){
        this.startTime = Date.now();
        let result;
        if (this._fn.constructor.name==='GeneratorFunction') {
            this._it = function*(){
                try { yield* this._fn.apply(this); }
                catch (e) { this._doCatch(w, e); }
                finally { this._doFinally(); }
            }.apply(this);
            let n;
            do {
                n = this._it.next(result);
                result = await n.value;
                console.log({result})
            } while (!n.done);
            w.resolve(result);
        } else {
            try {
                result = await this._fn.apply(this);
                w.resolve(result);
            }
            catch (e) { this._doCatch(w, e); }
            finally { this._doFinally(); }
        }
    }
    _doCatch(w, e){
        if (!this._errorCallbacks.size()) {
            this._done = true;
            return void w.reject(e);
        }
        this._errorCallbacks.trigger(this, e);
    }
    _doFinally(){
        this._finallyCallbacks.trigger(this);
        this._done = true;
    }
    onError(cb){
        this._errorCallbacks.add(cb);
    }
    onFinally(cb){
        this._finallyCallbacks.add(cb);
    }
    timeout(ms, err){
        this.clearTimeout();
        this._timeout = setTimeout(()=>{
            if (this.done)
                return;
            this.throwError(createError(err||'Timeout', 'gen_task_timeout'));
        }, ms);
    }
    clearTimeout(){
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
        }
    }
    cancel(v){
        if (this.done)
            return;
        this._it.return(v);
    }
    throwError(e){
        this._it.throw(e);
    }
    async lock(key, timeout){
        const lock = await E.obtainLock(key, timeout);
        this.onFinally(()=>lock.release());
    }
    hold(){
        if (this.holdWaiter)
            this.proceed();
        this.holdWaiter = E.wait();
        return this.holdWaiter.promise;
    }
    proceed(v){
        this.holdWaiter?.resolve(v);
        this.holdWaiter = null;
    }
    proceedThrow(e){
        this.holdWaiter?.reject(e);
        this.holdWaiter = null;
    }
    get duration(){
        return Date.now()-this.startTime;
    }
    get done(){
        return this._done;
    }
}
E.GenTask = GenTask;

E.genTask_ = fn=>{
    const gt = new GenTask(fn);
    const w = E.wait();
    gt._run(w);
    return w.promise;
};

E.genTask = fn=>{
    const _startTime = Date.now();
    let shouldStop = false;
    let done = false;
    let it;
    const w = E.wait();
    const errorCallbacks = [];
    const finallyCallbacks = [];
    const handleError = e=>{
        const errHandled = errorCallbacks.findIndex(cb=>cb(e)===true);
        if (errHandled===-1)
            w.reject(e);
    }
    let holdWaiter = null;
    const handle = {
        onError: cb=>errorCallbacks.push(cb),
        onFinally: cb=>finallyCallbacks.push(cb),
        timeout: (ms, err)=>{
            setTimeout(()=>{
                if (done)
                    return;
                handleError(createError(`Timeout error${err ? ': '+err : ''}`, 'gen_task_timeout'));
                done = true;
            }, ms);
        },
        cancel: ()=>{
            it?.throw(createError('Generator task cancelled', 'gen_task_cancelled'));
            done = true;
        },
        throwError: (message, code, extra)=>{
            it?.throw(createError(message, code, extra));
            done = true;
        },
        lock: async (key, timeout)=>{
            const lock = await E.obtainLock(key, timeout);
            handle.onFinally(()=>lock.release());
        },
        hold: ()=>{
            holdWaiter = E.wait();
            return holdWaiter.promise;
        },
        proceed: data=>{
            holdWaiter?.resolve(data);
            holdWaiter = null;
        },
        get startTime(){ return _startTime; },
        get duration(){ return Date.now()-_startTime; },
    };
    const retval = Object.assign(new E.GenTaskResult(), {
        promise: w.promise,
        stop: ()=>shouldStop = true,
    });
    (async ()=>{
        try {
            let result;
            if (fn.constructor.name==='GeneratorFunction') {
                it = fn.apply(handle);
                let n;
                do {
                    n = it.next(result);
                    result = await n.value;
                    if (done)
                        return;
                    if (shouldStop)
                        return void w.reject(createError(
                            'Generator task cancelled', 'gen_task_cancelled'));
                } while (!n.done);
                done = true;
            } else {
                result = await fn.apply(handle);
            }
            w.resolve(result);
        } catch (e) {
            handleError(e);
        } finally {
            finallyCallbacks.forEach(cb=>cb());
        }
    })();
    return retval;
};

E.genTask.promise = fn=>E.genTask(fn).promise;

E.genTask.isCancelled = e=>e.code==='gen_task_cancelled';

E.genTask.isTimeout = e=>e.code==='gen_task_timeout';

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
    if (isNode)
        process.nextTick(w.resolve);
    else
        setTimeout(w.resolve, 0);
    return w.promise;
};

E.waitEventEmitter = (emitter, ev)=>{
    let w = E.wait();
    emitter.once(ev, w.resolve);
    return w.promise;
};
