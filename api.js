const _ = require('lodash');
const {env} = require('process');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const joi = require('joi');
const createDOMPurify = require('dompurify');
const {JSDOM} = require('jsdom');
const {formatTime} = require('./time.js');
const {qw, forEachField} = require('./util.js');
const {createObjectReadable, createStringifyTransform} = require('./stream.js');

const E = module.exports;

E.RES_SENT = Symbol();

E.createExpressApp = (opt={}, builder)=>{
    if (!builder) {
        builder = opt;
        opt = {};
    }
    let {
        port,
        noCors,
        errorHandler=E.mwErrorHandler,
        onListen,
    } = opt;
    const app = express();
    if (noCors) {
        app.use(cors());
    } else {
        app.use(cors({
            origin: env.CLIENT_URL,
            methods: 'GET,POST,PUT,DELETE',
            credentials: true,
        }));
    }
    app.use(express.json());
    app.use(cookieParser());
    app.use(E.mwUnifyParams);
    app.use(E.mwStream);
    builder(app);
    app.use(errorHandler);
    return app.listen(port, onListen||(()=>console.log(`API listening on port ${port}`)));
};

E.err = (message, status, code, extra)=>Object.assign(new Error(),
    {message, status, code, extra});

E.handle = fn=>(req, res, next)=>{ (async ()=>{
    try {
        let result = await fn(req, res);
        if (result!==E.RES_SENT&&!res.headersSent)
            res.json(Object.assign({ok: true}, result));
        next();
    } catch (e) { next(e); }
})(); };

E.mwHandle = fn=>(req, res, next)=>{ (async ()=>{
    try {
        let nextCalled = false;
        await fn(req, res, ()=>{
            nextCalled = true;
            next();
        });
        if (!nextCalled)
            next();
    } catch (e) { next(e); }
})(); };

E.mwValidate = schema=>E.mwHandle(req=>{
    const {error} = joi.object().keys(schema).validate(req.allParams)||{};
    if (error)
        throw E.err(`Validation error: ${error.details.map(e=>e.message).join(', ')}.`,
            400, 'validation_error', error.details);
});

let DOMPurify;
E.SANITIZE_SOURCE = {
    BODY: 'body',
    QUERY: 'query',
    PARAMS: 'params',
};
E.mwSanitize = (paths, opt={})=>E.mwHandle(req=>{
    if (!DOMPurify)
        DOMPurify = createDOMPurify(new JSDOM('').window);
    if (_.isObject(paths)) {
        opt = paths;
        paths = null;
    }
    if (paths&&!_.isArray(paths))
        paths = [paths];
    let {source=[E.SANITIZE_SOURCE.BODY], throwOnDirty, stripHTML} = opt;
    if (!Array.isArray(source))
        source = [source];
    source.forEach(src=>{
        let _src = req[src];
        forEachField(_src, (path, v)=>{
            if (paths?.length) {
                if (!paths.some(p=>p.constructor.name=='RegExp' ? p.test(path) : p==path))
                    return;
            }
            let clean = DOMPurify.sanitize(v, {
                ...stripHTML&&{ALLOWED_TAGS: []},
            });
            if (throwOnDirty&&clean!=v)
                throw E.err('Sanitization error', 400, 'sanitization_error', {src, path, value: v});
            _.set(_src, path, clean);
        });
    });
});

const unifyParams = req=>Object.assign({}, req.params, req.query, structuredClone(req.body));

E.mwUnifyParams = (req, res, next)=>{
    req.allParams = unifyParams(req);
    next();
};

E.mwParseQuery = schema=>(req, res, next)=>{
    const q = {};
    Object.entries(req.query).forEach(([k, v])=>{
        if (!schema[k])
            return;
        const type = schema[k];
        switch (type) {
            case String: q[k] = v; break;
            case Number: q[k] = +v||0; break;
            case Boolean: q[k] = [].includes(v?.toLowerCase()); break;
            case Object:
                try {
                    q[k] = JSON.parse(v);
                    q[k] = _.isObject(q[k]) && q[k];
                } catch {}
                break;
            case Array:
                try {
                    q[k] = JSON.parse(v);
                    q[k] = Array.isArray(q[k]) && q[k];
                } catch {}
                break;
        }
    });
    req.query = q;
    next();
};

E.mwStream = (req, res, next)=>{
    res.sendStream = async creator=>{
        await createObjectReadable(creator)
            .pipe(createStringifyTransform())
            .pipe(res);
        return E.RES_SENT;
    };
    next();
};

E.mwErrorHandler = (err, req, res, next)=>{
    const {
        message='Server error',
        status=500,
        code='error',
        extra={},
    } = err;
    console.error('Rest API error', {
        message,
        status,
        code,
        extra,
        time: Date.now(),
        timestamp: formatTime(),
        request: _.pick(req, qw`headers query body cookies`),
    });
    res.status(status).json(
        {ok: false, message, status, code, extra});
};

E.withAPIRouter = fn=>()=>{
    const router = express.Router();
    fn(router);
    return router;
};
