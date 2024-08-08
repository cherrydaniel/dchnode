const fs = require('fs');
const {JSDOM} = require('jsdom');
const {Readable} = require('stream');
const {finished} = require('stream/promises');
const {isString} = require('./util/util.js');
const {wait} = require('./util/concurrent.js');

const E = module.exports = netCall;

const qsParse = (qs={})=>{
    let result = Object.entries(qs)
        .map(([k, v])=>`${k}=${encodeURIComponent(v)}`)
        .join('&');
    if (result.length)
        result = '?'+result;
    return result;
};

async function netCall(opt={}) {
    if (isString(opt))
        opt = {url: opt};
    let {
        url,
        method = 'GET',
        headers = {},
        qs,
        payload,
        formData,
        file,
    } = opt;
    url += qsParse(qs);
    let body;
    if (payload) {
        body = JSON.stringify(payload);
    } else if (formData) {
        body = formData;
    } else if (file) {
        const stats = fs.statSync(file);
        headers['Content-length'] = stats.size;
        body = fs.createReadStream(file);
    }
    return await fetch(url, {headers, method, body});
}

E.text = async (opt={})=>{
    const response = await netCall(opt);
    return await response.text();
};

E.json = async (opt={})=>{
    const response = await netCall(opt);
    return await response.json();
};

E.dom = async (opt={})=>{
    const response = await E.text(opt);
    const {document} = new JSDOM(response).window;
    return document;
};

E.stream = (opt={})=>{
    const w = wait();
    netCall(opt).then(w.resolve).catch(w.reject);
    const get = async ()=>{
        let resp = await w.promise;
        return resp.body ? Readable.fromWeb(resp.body) : null;
    };
    const pipe = async to=>{
        await finished((await get())?.pipe(to));
    };
    const toFile = async path=>{
        await pipe(fs.createWriteStream(path, {flags: 'wx'}));
    };
    return {get, pipe, toFile};
};
