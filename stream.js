const {Readable, Writable, Transform} = require('stream');
const {finished, pipeline} = require('stream/promises');
const _ = require('lodash');
const {wait, sleep} = require('./dchcore2/concurrent.js');
const { qw, isLittleEndian } = require('./dchcore2/util.js');

const E = module.exports;

E.streamToString = stream=>{
    const w = wait();
    const chunks = [];
    stream.on('data', data=>chunks.push(Buffer.from(data)));
    stream.on('error', e=>w.reject(e));
    stream.on('end', ()=>w.resolve(Buffer.concat(chunks).toString('utf-8')));
    return w.promise;
};

E.stream2string = async stream=>{
    let result = '';
    await pipeline(
        stream,
        E.createWritable(chunk=>result+=String(chunk)),
    );
    return result;
};

E.readableStreamToString = async stream=>{
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf-8');
};

E.stringToStream = str=>Readable.from([str]);

E.createReadable = (opt, handler)=>{
    if (_.isFunction(opt)) {
        handler = opt;
        opt = {};
    }
    const rs = Readable(opt);
    rs._read = async ()=>{
        let pushed = false;
        let result = await handler.call(rs, v=>{
            rs.push(v);
            pushed = true;
        });
        if (!pushed)
            rs.push(result);
    };
    return rs;
};

E.createTransform = (opt, handler)=>{
    if (_.isFunction(opt)) {
        handler = opt;
        opt = {};
    }
    return Transform({
        ...opt,
        async transform(chunk, enc, cb){
            let pushed = false;
            try {
                let result = await handler.call(this, chunk, enc, (e, v)=>{
                    cb(e, v);
                    pushed = true;
                });
                if (!pushed)
                    cb(null, result);
            } catch (e) {
                cb(e);
            }
        },
    })
};

E.createWritable = (opt, handler)=>{
    if (_.isFunction(opt)) {
        handler = opt;
        opt = {};
    }
    const ws = Writable(opt);
    ws._write = async (chunk, enc, next)=>{
        let calledNext = false;
        await handler.call(ws, chunk, enc, ()=>{
            next();
            calledNext = true;
        });
        if (!calledNext)
            next();
    };
    return ws;
};

E.createObjectReadable = handler=>E.createReadable({objectMode: true}, handler);

E.createObjectTransform = handler=>E.createTransform({objectMode: true}, handler);

E.createObjectWritable = handler=>E.createWritable({objectMode: true}, handler);

E.createObjectEmit = obj=>E.createObjectReadable(push=>{
    push(obj);
    push(null);
});

E.createStringifyTransform = ()=>E.createObjectTransform(obj=>JSON.stringify(obj));

E.waitPipeTo = (src, dst, opt)=>finished(src.pipe(dst, opt));

E.accumulateObjects = async rs=>{
    let result = [];
    await finished(rs.pipe(E.createObjectWritable(obj=>result.push(obj))));
    return result;
};

E.split = delimeter=>new Transform({
    construct(cb){
        this._buffer = '';
        cb();
    },
    transform(chunk, enc, cb){
        this._buffer += String(chunk);
        let parts = this._buffer.split(delimeter);
        this._buffer = parts.pop();
        parts.forEach(part=>this.push(Buffer.from(part, 'utf-8')));
        cb();
    },
    flush(cb){
        if (this._buffer)
            this.push(Buffer.from(this._buffer, 'utf-8'));
        cb();
    },
});

E.filter = (predicate, opt={})=>new Transform({
    async transform(chunk, enc, cb){
        if (await predicate(chunk))
            this.push(chunk);
        cb();
    },
    ...opt,
});

E.limit = (num, opt={})=>new Transform({
    construct(cb){
        this._count = 0;
        cb();
    },
    transform(chunk, enc, cb){
        this.push(chunk);
        cb();
        if (++this._count==num)
            this.emit('end');
    },
    ...opt,
});

E.map = (transformer, opt={})=>new Transform({
    async transform(chunk, enc, cb){
        this.push(await transformer(chunk));
        cb();
    },
    ...opt,
})

E.json2str = ()=>new Transform({
    writableObjectMode: true,
    construct(cb){
        this._first = true;
        cb();
    },
    transform(chunk, enc, cb){
        let res = this._first ? '[' : ',';
        this._first = false;
        res += JSON.stringify(chunk);
        this.push(res);
        cb();
    },
    flush(cb){
        this.push(']');
        cb();
    },
});

E.str2json = ()=>new Transform({
    readableObjectMode: true,
    construct(cb){
        this._buffer = '';
        this._in_quotes = false;
        this._depth = 0;
        cb();
    },
    transform(chunk, enc, cb){
        chunk = String(chunk);
        for (let i in chunk) {
            let char = chunk[i];
            if (char=='"' && ![chunk[i-1], this._buffer[this._buffer.length-1]].includes('\\'))
                this._in_quotes = !this._in_quotes;
            if (!this._in_quotes && char=='{')
                this._depth++
            if (this._depth)
                this._buffer += char;
            if (!this._in_quotes && char=='}' && --this._depth==0) {
                this.push(JSON.parse(this._buffer));
                this._buffer = '';
            }
        }
        cb();
    },
});

E.streamFetchResponse = resp=>{
    let reader = resp.body.getReader();
    return E.createReadable(async push=>{
        let {done, value} = await reader.read();
        push(done ? null : value);
    });
};

const bufferWriteFuncs = {
    writeBigInt64BE: {bytes: 8},
    writeBigInt64LE: {bytes: 8},
    writeBigUInt64BE: {bytes: 8},
    writeBigUInt64LE: {bytes: 8},
    writeDoubleBE: {bytes: 8},
    writeDoubleLE: {bytes: 8},
    writeFloatBE: {bytes: 4},
    writeFloatLE: {bytes: 4},
    writeInt8: {bytes: 1},
    writeInt16BE: {bytes: 2},
    writeInt16LE: {bytes: 2},
    writeInt32BE: {bytes: 4},
    writeInt32LE: {bytes: 4},
    writeUInt8: {bytes: 1},
    writeUInt16BE: {bytes: 2},
    writeUInt16LE: {bytes: 2},
    writeUInt32BE: {bytes: 4},
    writeUInt32LE: {bytes: 4},
};

E.streamWriter = (opt={}, handler)=>{
    if (_.isFunction(opt)) {
        handler = opt;
        opt = {};
    }
    let writer = {
        write: v=>writer._push(v),
        end: ()=>writer._push(null),
    };
    _.entries(bufferWriteFuncs).forEach(([fn, {bytes}])=>{
        writer[fn] = v=>{
            let buf = Buffer.allocUnsafe(bytes);
            buf[fn](v);
            writer._push(buf);
        };
    });
    return E.createReadable(opt, async push=>{
        writer._push = push;
        await handler.apply(writer);
    });
};

const bufferReadFuncs = {
    readBigInt64BE: {bytes: 8},
    readBigInt64LE: {bytes: 8},
    readBigUInt64BE: {bytes: 8},
    readBigUInt64LE: {bytes: 8},
    readDoubleBE: {bytes: 8},
    readDoubleLE: {bytes: 8},
    readFloatBE: {bytes: 4},
    readFloatLE: {bytes: 4},
    readInt8: {bytes: 1},
    readInt16BE: {bytes: 2},
    readInt16LE: {bytes: 2},
    readInt32BE: {bytes: 4},
    readInt32LE: {bytes: 4},
    readUInt8: {bytes: 1},
    readUInt16BE: {bytes: 2},
    readUInt16LE: {bytes: 2},
    readUInt32BE: {bytes: 4},
    readUInt32LE: {bytes: 4},
};

E.streamReader = (opt={}, handler)=>{
    if (_.isFunction(opt)) {
        handler = opt;
        opt = {};
    }
    let {
        decoderFormat,
        ...writableOpt
    } = opt;
    let waiter, waitingForBytes, offset = 0, buffer = [];
    let takeBytes = (numBytes, w)=>{
        if (buffer.length<numBytes)
            return false;
        let chunk = buffer.slice(0, numBytes);
        buffer = buffer.slice(numBytes);
        offset += numBytes;
        w.resolve(Buffer.from(new Uint8Array(chunk).buffer));
        return true;
    };
    let read = async numBytes=>{
        let w = wait();
        if (!takeBytes(numBytes, w)) {
            waiter = w;
            waitingForBytes = numBytes;
        }
        return w.promise;
    };
    let decoder = new TextDecoder(decoderFormat);
    let reader = {
        read,
        skip: async len=>void await read(len),
        get offset(){ return offset; },
        readString: async len=>decoder.decode(await read(len)),
    };
    _.entries(bufferReadFuncs).forEach(([fn, {bytes}])=>reader[fn] = async (...args)=>(await read(bytes))[fn](...args));
    handler.apply(reader);
    return E.createWritable(writableOpt, chunk=>{
        buffer.push(...chunk);
        if (waiter && takeBytes(waitingForBytes, waiter)) {
            waiter = undefined;
            waitingForBytes = undefined;
        }
    });
};

E._testBufferedReadable = async ()=>{
    E.streamWriter(async function(){
        this.write('BM')
        await sleep(2000);
        this.writeUInt8(2);
        await sleep(2000);
        this.end();
    }).pipe(E.streamReader(async function(){
        let sig = await this.readString(2);
        console.log(sig);
        let two = await this.readUInt8();
        console.log(two);
    }));
};
