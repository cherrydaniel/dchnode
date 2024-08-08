const {argv} = require('process');

const E = module.exports;

E.opts = {};

/**
 * opts: {
 *   id: {
 *     key,
 *     shortcut,
 *     hasValue,
 *     def,
 *     cast,
 *     compute,
 *     validate,
 *   },
 * };
 */
E.mapOpts = data=>{
    const optKeys = new Map();
    Object.entries(data).forEach(([name, opt])=>{
        [opt.key, opt.shortcut].filter(Boolean)
            .forEach(v=>optKeys.set(v, name));
        if (opt.hasValue && !!opt.def)
            E.opts[name] = opt.def;
    });
    for (let i = 2; i < argv.length; i++) {
        let arg = argv[i];
        if (!arg.length) continue;
        let val;
        if (arg.includes('=')) {
            const arr = arg.split(/\s*=\s*/g);
            arg = arr[0].trim();
            val = arr.slice(1).join('=').trim();
        }
        const name = optKeys.get(arg);
        if (!name) continue;
        const opt = data[name];
        if (opt.hasValue && !val)
            val = argv[++i];
        if (!val)
            val = true;
        if (opt.cast) {
            switch (opt.cast) {
            case Number: val = +val; break;
            case Boolean: val = !!['true', 'y', 'yes']
                .includes(val.toLowerCase()) || !!+val; break;
            }
        }
        if (opt.compute)
            val = opt.compute(val);
        let validationResult = opt.validate?.(val);
        if (validationResult)
            throw new Error(`Invalid value ${val} for argument ${arg}: ${validationResult}`);
        E.opts[name] = val;
    }
};
