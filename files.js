const fs = require('fs');
const path = require('path');
const Tail = require('tail').Tail;
const JSZip = require('jszip');

const E = module.exports;

E.append = (filename, data)=>new Promise((resolve, reject)=>{
    fs.mkdirSync(path.dirname(filename), {recursive: true});
    fs.appendFile(filename, data, err=>{
        if (err)
            return void reject(err);
        resolve();
    });
});

E.save = (filename, data)=>new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filename), {recursive: true});
    fs.writeFile(filename, data, err=>{
        if (err)
            return void reject(err);
        resolve();
    });
});

E.load = filename=>new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data)=>{
        if (err)
            return void reject(err);
        resolve(data);
    });
});

E.saveJSON = (filename, data)=>E.save(filename, JSON.stringify(data));

E.loadJSON = async filename=>JSON.parse(await E.load(filename));

E.tail = ({filename, onData, onError, filter})=>{
    const t = new Tail(filename);
    if (onData) {
        t.on('line', data => {
            if (!filter ||
                filter.constructor.name == 'RegExp' && filter.test(data) ||
                data.contains(filter))
            {
                onData(data);
            }
        });
    }
    if (onError)
        t.on('error', e => onError(e));
    return t;
};

E.zip = async (...files)=>{
    const zip = new JSZip();
    [...files].forEach(f=>zip.file(f.path, f.data));
    return zip.generateAsync({ type: "nodebuffer" });
};

E.zipFolder = async (folderPath, ...additionalFiles) => {
    const zip = new JSZip();
    const addFilesToZip = (zipFile, folderPath, currentPath = "") => {
        const files = fs.readdirSync(path.join(folderPath, currentPath));        
        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const fullFilePath = path.join(folderPath, filePath);
            const stats = fs.statSync(fullFilePath);
            if (stats.isDirectory()) {
                addFilesToZip(zipFile, folderPath, filePath);
            } else {
                fileContent = fs.readFileSync(fullFilePath);
                zipFile.file(filePath, fileContent);
            }
        }
    };
    addFilesToZip(zip, folderPath);
    [...additionalFiles].forEach(f=>zip.file(f.path, f.data));
    return zip.generateAsync({type: 'nodebuffer'});
};

E.appPath = p=>path.join(env.APP_DIR||env.HOME, p);
