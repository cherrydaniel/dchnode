const cluster = require('cluster');
const _ = require('lodash');
const {env} = require('process');
const {formatTime} = require('./time.js');
const {randomArrayItem, qw, isDevEnv} = require('./util.js');
const {Colors, colorize} = require('./color.js');

const namespaceColors = {};

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

const LevelColors = {
    DEBUG: [Colors.white],
    NOTICE: [Colors.blue],
    WARN: [Colors.yellow],
    ERROR: [Colors.bold, Colors.red],
    CRIT: [Colors.bold, Colors.underline, Colors.overlined, Colors.bgRed],
    KAWAII: [Colors.bold, Colors.magenta],
};

const namespaceStamp = (namespace, namespaceColor)=>colorize(namespace, Colors.bold, Colors.italic, Colors[namespaceColor]);

const procStamp = color=>colorize(cluster.isPrimary ? `[P]` : `[W${cluster.worker.id}]`, Colors.bold, Colors[color]);

const timeStamp = ()=>isDevEnv() ? colorize(formatTime(), Colors.green)+': ' : '';

const levelStamp = level=>level?.length ? colorize(level, ...LevelColors[level])+': ' : '';

const stamp = ({namespace, namespaceColor, prefix, level})=>{
    let res = namespaceStamp(namespace, namespaceColor)+' '+
        procStamp(namespaceColor)+' '+timeStamp()+levelStamp(level);
    if (prefix)
        res += prefix+' ';
    return res;
};

const doLog = async (args=[], opt={})=>{
    let {consoleFn, threshold, level} = opt;
    threshold ||= env.LOG_LEVEL;
    if ((LogLevel[threshold]||0)>(LogLevel[level]||0))
        return;
    args.forEach(v=>console[consoleFn](stamp(opt), v));
};

const createLogger = (namespace, opt={})=>{
    opt = _.cloneDeep(opt);
    let {
        defaultLevel='NOTICE',
        threshold,
    } = opt;
    if (namespaceColors[namespace]&&!opt.color)
        opt.color = namespaceColors[namespace];
    if (!opt.color)
        opt.color = randomArrayItem(qw`red green yellow blue magenta cyan`);
    if (!namespaceColors[namespace])
        namespaceColors[namespace] = opt.color;
    let baseOpt = {
        namespace,
        namespaceColor: opt.color,
        consoleFn: 'log',
        threshold,
    };
    let handler = {
        debug: (...args)=>doLog(args, {...baseOpt, level: 'DEBUG'}),
        kawaii: (...args)=>args.forEach(a=>doLog([a], {...baseOpt, level: 'KAWAII', prefix: randomArrayItem(KawaiiEmojis)})),
        notice: (...args)=>doLog(args, {...baseOpt, level: 'NOTICE'}),
        warn: (...args)=>doLog(args, {...baseOpt, level: 'WARN'}),
        error: (...args)=>doLog(args, {...baseOpt, level: 'ERROR', consoleFn: 'error'}),
        crit: (...args)=>doLog(args, {...baseOpt, level: 'CRIT', consoleFn: 'error'}),
        extend: (_namespace, _opt={})=>createLogger(namespace+':'+_namespace, {...opt, ..._opt}),
    };
    let loggerFn = (...args)=>handler[defaultLevel.toLowerCase()](...args);
    return Object.assign(loggerFn, handler);
};

module.exports = createLogger;
