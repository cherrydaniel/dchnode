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

E.stringToStream = str=>Readable.from([str]);
