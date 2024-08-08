const cluster = require('cluster');
const _ = require('lodash');
const { wait } = require('./util/concurrent');
const { generateId, strEnum } = require('./util/util');

const E = module.exports;

E.onMessage = (type, cb)=>{
    if (cluster.isPrimary) {
        _.values(cluster.workers).forEach(worker=>{
            worker.on('message', msg=>{
                if (msg.type==type)
                    cb(msg.data);
            });
        });
        cluster.on('fork', worker=>{
            worker.on('message', msg=>{
                if (msg.type==type)
                    cb(msg.data);
            });
        });
    } else {
        process.on('message', msg=>{
            if (msg.type==type)
                cb(msg.data);
        });
    }
};

E.callMaster = (type, data={})=>{
    process.send({type, data: Object.assign({}, data, {workerId: cluster.worker.id})});
};

E.callWorker = (id, type, data={})=>{
    cluster.workers[id].send({type, data});
};

E.callAllWorkers = (type, data={})=>{
    E.forEachWorker(id=>E.callWorker(id, type, data));
};

E.forEachWorker = cb=>{
    _.keys(cluster.workers).forEach(id=>cb(id));
};

const IPCEvent = strEnum`
    CREATED
    FN_CALL
    FN_RESULT
    FN_ERROR
    WORKER_READY
`;

const _masterIPC = {};

E.masterIPC = ()=>_masterIPC;

const _workerIPCs = {};

E.workerIPC = id=>_workerIPCs[id];

const _masterIPCWaiters = [];

E.waitMasterIPC = ()=>{
    const w = wait();
    _masterIPCWaiters.push(w);
    return w.promise;
};

const _workerIPCWaiters = {};

E.waitWorkerIPC = id=>{
    const w = wait();
    if (!_workerIPCWaiters[id])
        _workerIPCWaiters[id] = [];
    _workerIPCWaiters[id].push(w);
    return w.promise;
};

E.createMasterIPC = exports=>{
    E.onMessage(IPCEvent.WORKER_READY, ({workerId})=>{
        E.callWorker(workerId, IPCEvent.CREATED, {
            exports: _.keys(exports),
        });
    });
    E.onMessage(IPCEvent.FN_CALL, async fn_data=>{
        const {workerId, callId, fn, args} = fn_data;
        try {
            if (!exports[fn])
                throw new Error(`Unknown function: ${fn}`);
            const result = await exports[fn].apply(null, args||[]);
            E.callWorker(workerId, IPCEvent.FN_RESULT,
                {callId, fn, args, result});
        } catch (e) {
            E.callWorker(workerId, IPCEvent.FN_ERROR,
                {callId, fn, args, error: e.message});
        }
    });
};

E.createWorkerIPC = exports=>{
    E.onMessage(IPCEvent.FN_CALL, async fn_data=>{
        const {callId, fn, args} = fn_data;
        try {
            if (!exports[fn])
                throw new Error(`Unknown function: ${fn}`);
            const result = await exports[fn].apply(null, args||[]);
            E.callMaster(IPCEvent.FN_RESULT,
                {callId, fn, args, result});
        } catch (e) {
            E.callMaster(IPCEvent.FN_ERROR,
                {callId, fn, args, error: e.message});
        }
    });
    E.callMaster(IPCEvent.CREATED, {
        exports: _.keys(exports),
    });
};

// TODO: elegantly remove duplicate logic
_.once(()=>{
    if (cluster.isPrimary) {
        const activeCalls = {};
        E.onMessage(IPCEvent.FN_RESULT, data=>{
            const {workerId, callId, result} = data;
            activeCalls[workerId][callId].resolve(result);
            delete activeCalls[workerId][callId];
        });
        E.onMessage(IPCEvent.FN_ERROR, data=>{
            const {workerId, callId, error} = data;
            activeCalls[workerId][callId].reject(new Error(error));
            delete activeCalls[workerId][callId];
        });
        E.onMessage(IPCEvent.CREATED, data=>{
            const {workerId, exports} = data;
            activeCalls[workerId] = {}
            if (!_workerIPCs[workerId])
                _workerIPCs[workerId] = {};
            Object.assign(_workerIPCs[workerId], exports.reduce((acc, fn)=>({
                ...acc,
                [fn]: function() {
                    const w = wait();
                    const callId = generateId();
                    activeCalls[workerId][callId] = w;
                    E.callWorker(workerId, IPCEvent.FN_CALL,
                        {callId, fn, args: [...arguments]});
                    return w.promise;
                },
            }), {}));
            cluster.workers[workerId].on('disconnect', ()=>{
                _.values(activeCalls[workerId]).forEach(w=>w.reject(
                    new Error(`Worker ${workerId} disconnected`)));
                delete activeCalls[workerId];
                delete _workerIPCs[workerId];
            });
            _workerIPCWaiters[workerId]?.forEach(w=>w.resolve());
            delete _workerIPCWaiters[workerId];
        });
    } else {
        const activeCalls = {};
        E.onMessage(IPCEvent.FN_RESULT, data=>{
            const {callId, result} = data;
            activeCalls[callId].resolve(result);
            delete activeCalls[callId];
        });
        E.onMessage(IPCEvent.FN_ERROR, data=>{
            const {callId, error} = data;
            activeCalls[callId].reject(new Error(error));
            delete activeCalls[callId];
        });
        E.onMessage(IPCEvent.CREATED, data=>{
            const {exports} = data;
            Object.assign(_masterIPC, exports.reduce((acc, fn)=>({
                ...acc,
                [fn]: function() {
                    const w = wait();
                    const callId = generateId();
                    activeCalls[callId] = w;
                    E.callMaster(IPCEvent.FN_CALL,
                        {callId, fn, args: [...arguments]});
                    return w.promise;
                },
            }), {}));
            _masterIPCWaiters.forEach(w=>w.resolve());
            _masterIPCWaiters.length = 0;
        });
        E.callMaster(IPCEvent.WORKER_READY);
    }
})();
