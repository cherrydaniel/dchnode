// Inter-service Communication
const {WebSocketServer} = require('ws');
const {WebSocketHandle} = require('./wshandle.js');
const {wait} = require('./util/concurrent.js');
const {generateId} = require('./util/util.js');
const {logn} = require('./util/logger.js');

const E = module.exports;

const MessageType = {
    CONNECT: 'connect',
    ERROR: 'error',
    FN_CALL: 'fn_call',
    FN_RESULT: 'fn_result',
    FN_ERROR: 'fn_error',
};

E.createServer = ({service, exports, port})=>{
    const wss = new WebSocketServer({port});
    logn(`Initialized service "${service}" on port ${port}`);
    wss.on('connection', socket=>{
        socket.on('message', async data=>{
            const msg = JSON.parse(String(data));
            if (msg.type==MessageType.FN_CALL) {
                try {
                    const fn = exports[msg.fn];
                    if (!fn)
                        throw new Error(`Unknown function: ${msg.fn}`);
                    const args = msg.args || [];
                    const res = await fn.apply(null, args);
                    socket.send(JSON.stringify({
                        type: MessageType.FN_RESULT,
                        service,
                        fn: msg.fn,
                        args,
                        res,
                        id: msg.id,
                    }));
                } catch (e) {
                    socket.send(JSON.stringify({
                        type: MessageType.FN_ERROR,
                        service,
                        error: e.message,
                        id: msg.id,
                        fn: msg.fn,
                    }));
                }
            }
        });
        socket.send(JSON.stringify({
            type: 'connect',
            service,
            exports: Object.keys(exports),
        }));
    });
};

E.createClient = ({service, port})=>new Promise(resolve=>{
    const activeCalls = {};
    const ws = new WebSocketHandle({
        url: `ws://localhost:${port}`,
        persistent: true,
        onMessage: msg=>{
            if (msg.type==MessageType.CONNECT && !!msg.exports) {
                const exports = msg.exports.reduce((acc, fn)=>({
                    ...acc,
                    [fn]: async function() {
                        const args = [...arguments];
                        const w = wait();
                        const id = generateId({prefix: service+'_fn_call'});
                        activeCalls[id] = w;
                        ws.send({type: MessageType.FN_CALL, fn, id, args});
                        return w.promise;
                    },
                }), {});
                return resolve({...exports, _close: ()=>ws.close()});
            }
            if (msg.type==MessageType.FN_RESULT) {
                const w = activeCalls[msg.id];
                delete activeCalls[msg.id];
                return w.resolve(msg.res);
            }
            if (msg.type==MessageType.FN_ERROR) {
                const w = activeCalls[msg.id];
                delete activeCalls[msg.id];
                return w.reject(msg.error);
            }
        },
        onError: err=>{
            Object.keys(activeCalls).forEach(id=>{
                activeCalls[id].reject(new Error('ISC Connection Error', err));
                delete activeCalls[id];
            });
        },
    });
});
