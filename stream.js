const {Readable, Writable, Transform} = require('stream');
const {finished, pipeline} = require('stream/promises');
const _ = require('lodash');
const {wait} = require('./dchcore/concurrent.js');

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
        let result = await handler(v=>{
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
        transform: async (chunk, enc, cb)=>{
            let pushed = false;
            try {
                let result = await handler(chunk, enc, (e, v)=>{
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
        await handler(chunk, enc, ()=>{
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

