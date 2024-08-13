const {Readable, Writable, Transform} = require('stream');
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

E.createStringifyTransform = ()=>E.createObjectTransform(obj=>JSON.stringify(obj));

E.createResWriter = res=>E.createWritable(chunk=>res.write(chunk)); // PROBABLY UNNEEDED!!!
