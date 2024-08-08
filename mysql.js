const {env} = require('process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const {wait} = require('../util/concurrent.js');

const E = module.exports;

E.connect = async ()=>{
    const w = wait();
    const con = mysql.createConnection({
        host: env.DB_HOST,
        port: +env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        ...env.DB_CERT_FILE && {
            ssl: {ca: fs.readFileSync(path.join(env.HOME, env.DB_CERT_FILE))},
        },
    });
    con.connect(err=>{
        if (err)
            return void w.reject(err);
        w.resolve(con);
    });
    return w.promise;
};

E.useConnection = async cb=>{
    const con = await E.connect();
    try { return await cb.call(null, con); }
    finally { con.end(); }
};

E.query = (stmt, opt={})=>E.useConnection(con=>{
    const {data} = opt;
    if (data) {
        for (let [k, v] of Object.entries(data))
            stmt = stmt.replace(new RegExp(`:${k}`, 'g'), con.escape(v));
    }
    const w = wait();
    con.query(stmt, (err, result, fields)=>{
        if (err)
            return void w.reject(err);
        w.resolve({result, fields});
    });
    return w.promise;
});

E.select = async (table, opt={})=>{
    const {selector='*', limit, where} = opt;
    let stmt = `SELECT ${selector} FROM ${table}`;
    if (where)
        stmt += ` WHERE ${where}`;
    if (limit)
        stmt += ` LIMIT ${limit}`;
    return (await E.query(stmt, opt)).result;
};

E.selectOne = async (table, opt={})=>{
    return (await E.select(table, {...opt, limit: 1}))[0];
};

E.insert = async (table, opt={})=>{
    const {values} = opt;
    let stmt = `
        INSERT INTO ${table}
        (${Object.keys(values).join(', ')})
        VALUES
        (${Object.keys(values).map(v=>`:${v}`).join(', ')})
    `;
    opt.data = {...opt.data, ...values};
    return (await E.query(stmt, opt)).result;
};

E.update = async (table, opt={})=>{
    const {values, where, data={}} = opt;
    let stmt = `UPDATE ${table} SET ${Object.keys(values).map(k=>`${k} = :${k}`).join(', ')}`;
    if (where)
        stmt += ` WHERE ${where}`;
    Object.assign(data, values);
    return (await E.query(stmt, opt)).result;
};

E.remove = async (table, opt={})=>{
    const {where} = opt;
    let stmt = `DELETE FROM ${table}`;
    if (where)
        stmt += ` WHERE ${where}`;
    return (await E.query(stmt, opt)).result;
};
