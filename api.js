const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const {env} = require('process');
const {loge} = require('./util/logger.js');
const {formatTime} = require('./util/time.js');
const {isObject} = require('./util/util.js');

const allowedOrigins = [...env.DOMAIN?.split(/\s*,\s*/g)||[], env.CLIENT_URL].filter(Boolean);

const E = module.exports;

E.RES_SENT = Symbol();

E.createExpressApp = (opt={}, builder)=>{
    if (!builder) {
        builder = opt;
        opt = {};
    }
    let {port, noCors} = opt;
    const app = express();
    if (noCors) {
        app.use(cors());
    } else {
        app.use(cors({
            origin: function (origin, callback) {
                if (!origin)
                    return callback(null, true);
                if (allowedOrigins.includes(origin))
                    return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
                return callback(null, true);
            },
            methods: 'GET,POST,PUT,DELETE',
            credentials: true,
        }));
    }
    app.use(express.json());
    app.use(cookieParser());
    app.use(E.mwUnifyParams);
    builder(app);
    app.use(E.mwErrorHandler);
    return app.listen(port, ()=>console.log(`API listening on port ${port}`));
};

E.err = (message, status, code, extra)=>Object.assign(new Error(),
    {message, status, code, extra});

const handleResult = (res, result)=>{
    if (result === E.RES_SENT)
        return;
    if (res.headersSent)
        return;
    res.json(Object.assign({ok: true}, result));
};

E.handle = fn=>(req, res, next)=>{ (async ()=>{
    try {
        let result = await fn(req, res);
        handleResult(res, result);
        if (result!==E.RES_SENT&&!res.headersSent)
            res.json(Object.assign({ok: true}, result));
        next();
    } catch (e) { next(e); }
})(); };

E.mwHandle = fn=>(req, res, next)=>{ (async ()=>{
    try {
        await fn(req, res);
        next();
    } catch (e) { next(e); }
})(); };

const unifyParams = req=>Object.assign({}, req.params, req.query, structuredClone(req.body));

E.mwUnifyParams = (req, res, next)=>{
    req.allParams = unifyParams(req);
    next();
};

E.mwValidateParams = (...params)=>(req, res, next)=>{
    const params = req.allParams || unifyParams(req);
    for (let p of params) {
        if (!params.hasOwnProperty(p))
            return void next(E.err(`Missing parameter: ${p}`, 400, 'missing_parameter'));
    }
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
                    q[k] = isObject(q[k]) && q[k];
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

E.mwErrorHandler = (err, req, res, next)=>{
    const {
        message='Server error',
        status=500,
        code='error',
        extra={},
    } = err;
    loge('Rest API error', {
        message,
        status,
        code,
        extra,
        time: Date.now(),
        timestamp: formatTime(),
        request: {
            headers: req.headers,
            query: req.query,
            body: req.body,
            cookies: req.cookies,
        },
    });
    res.status(err.status).json({
        ok: false,
        message,
        status,
        code,
        extra,
    });
};

E.withAPIRouter = fn=>()=>{
    const router = express.Router();
    fn(router);
    return router;
};
