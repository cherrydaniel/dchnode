const os = require('os');
const cluster = require('cluster');
const path = require('path');
const {env} = require('process');
const cursor = require('ansi')(process.stdout);
const {formatTime, formatDate} = require('./dchcore/time.js');
const {isString, escapeRegExp, rng, qw} = require('./dchcore/util.js');
const {useLock, obtainLock} = require('./dchcore/concurrent.js');
const files = require('./files.js');
const {Colors, applyColorizers, clr, colorize} = require('./color.js');

const E = module.exports;

const KawaiiEmojis = [
    '(づ｡◕‿‿◕｡)づ',
    '(✿◠‿◠)',
    '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
    '⊂◉‿◉つ',
    '∩(︶▽︶)∩',
    '(´･ω･`)',
    '( ͡° ͜ʖ ͡°)',
];

const LogLevel = {
    ALL: 0,
    DEBUG: 1,
    KAWAII: 1,
    NOTICE: 2,
    WARN: 3,
    ERROR: 4,
    CRIT: 5,
    NONE: 6,
};

E.LogColorizers = [
    [/(\d{4}-\d{2}-\d{2})/g, Colors.green],
    [/(\d{2}:\d{2}:\d{2})/g, Colors.green],
    [/(\bNOTICE\b)/g, Colors.blue],
    [/(\bWARN\b)/g, Colors.yellow],
    [/(\bERROR\b)/g, Colors.bold, Colors.red],
    [/(\bCRIT\b)/g, Colors.bold, Colors.underline, Colors.overlined, Colors.bgRed],
    [RegExp('('+KawaiiEmojis.map(v=>escapeRegExp(v)).join('|')+')', 'g'), Colors.bold, Colors.magenta],
    [/^(\[.+\])/g, Colors.bold],
];

const timestamp = level=>(cluster.isPrimary ? `[P:${process.pid}]` : `[W${cluster.worker.id}:${cluster.worker.process.pid}]`) +
    ' ' + formatTime() + ': ' +
    (level?.length ? level+': ' : '');

const logToFile = v=>{
    if (+env.LOG_FILE_ENABLE && env.LOG_FILE_DIR)
        files.append(path.join(env.APP_DIR||env.HOME, env.LOG_FILE_DIR, (env.LOG_FILE_PREFIX||'')+'_'+formatDate()+'.log'), v+os.EOL);
};

const doLog = async (args=[], level, prefix)=>{
    if (LogLevel[env.LOG_LEVEL]||0>LogLevel[level]||0)
        return;
    useLock('terminal', ()=>{
        if (prefix)
            level = prefix;
        args.forEach(v=>{
            if (!isString(v)) {
                try { v = JSON.stringify(v, null, 2); }
                catch { v = String(v); }
            }
            v = timestamp(level)+v;
            console.log(applyColorizers(v, E.LogColorizers));
            logToFile(v);
        });
    });
};

E.logd = (...args)=>doLog(args, 'DEBUG');
E.logk = (...args)=>args.forEach(a=>doLog([a], 'KAWAII', rng.choice(KawaiiEmojis)));
E.logn = (...args)=>doLog(args, 'NOTICE');
E.logw = (...args)=>doLog(args, 'WARN');
E.loge = (...args)=>doLog(args, 'ERROR');
E.logc = (...args)=>doLog(args, 'CRIT');

E.updateLine = v=>{
    cursor.hide();
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(v);
};

E.endLine = v=>{
    if (v)
        E.updateLine(v);
    process.stdout.write(os.EOL);
    cursor.show();
};

const loaders = {};

const loadingText = [` Loading    `, ` Loading.   `, ` Loading..  `, ` Loading... `];
let loadingTextFrame = 0;

E.startLoading = v=>{
    const lock = obtainLock('terminal');
    logToFile(timestamp(LogLevel.NOTICE)+`Started loading: ${v}`);
    loaders[v] = {
        start: Date.now(),
        lock,
        interval: setInterval(async ()=>{
            await lock;
            if (!loaders[v])
                return;
            let blepSize = Math.max(1, Math.floor(loadingText[0].length/loadingText.length));
            let blepPos = loadingTextFrame*blepSize;
            let text = loadingText[loadingTextFrame%loadingText.length];
            let res = '';
            if (blepPos>0)
                res += colorize(text.substring(0, blepPos), Colors.bgBlue);
            res += colorize(text.substring(blepPos, blepPos+blepSize), Colors.bgWhite);
            res += colorize(text.substring(blepPos+blepSize), Colors.bgBlue);
            loadingTextFrame = (loadingTextFrame+1)%loadingText.length;
            E.updateLine(res + ' ' + v);
        }, 200),
    };
};

E.endLoading = async (v, note)=>{
    if (!loaders[v])
        return;
    loaders[v].end = Date.now();
    let {start, lock, interval, end} = loaders[v];
    const dur = ((end-start)/1000).toFixed(1);
    logToFile(timestamp(LogLevel.NOTICE)+`Ended loading in ${dur}s: ${v}${note ? ` - ${note}` : ''}`);
    delete loaders[v];
    let {release} = await lock;
    clearInterval(interval);
    E.updateLine(clr(Colors.bold, Colors.bgGreen)` DONE `+
        clr(Colors.bold, Colors.bgBlack)` ${dur}s `+
        ' '+v+
        (note ? clr(Colors.italic)` - ${note}` : ''));
    E.endLine();
    release();
};

E.hookLoading = (handle, v, note)=>{
    E.startLoading(v);
    handle.onFinally(()=>E.endLoading(v, note));
};
