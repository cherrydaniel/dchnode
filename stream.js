const {Readable} = require('stream');
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
