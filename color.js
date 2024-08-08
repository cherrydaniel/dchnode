const {templateToString} = require("./util.js");

const E = module.exports;

E.Colors = {
    reset: `\x1b[0m`,
    bold: `\x1b[1m`,
    italic: `\x1b[3m`,
    underline: `\x1b[4m`,
    blink: `\x1b[5m`,
    black: `\x1b[30m`,
    red: `\x1b[31m`,
    green: `\x1b[32m`,
    yellow: `\x1b[33m`,
    blue: `\x1b[34m`,
    magenta: `\x1b[35m`,
    cyan: `\x1b[36m`,
    white: `\x1b[37m`,
    bgBlack: `\x1b[40m`,
    bgRed: `\x1b[41m`,
    bgGreen: `\x1b[42m`,
    bgYellow: `\x1b[43m`,
    bgBlue: `\x1b[44m`,
    bgMagenta: `\x1b[45m`,
    bgCyan: `\x1b[46m`,
    bgWhite: `\x1b[47m`,
    overlined: `\x1b[53m`,
};

E.clr = (...colors)=>function (parts, ...args) {
    return E.colorize(templateToString(parts, args), ...colors);
};

E.colorize = (v, ...colors)=>colors.join('')+v+E.Colors.reset;

E.colorizePattern = (v, pattern, ...colors)=>v.replace(pattern, colors.join('')+'$1'+E.Colors.reset);

E.applyColorizers = (v, colorizers)=>{
    colorizers.forEach(([pattern, ...colors])=>{
        v = E.colorizePattern(v, pattern, ...colors);
    });
    return v;
};
