const {env} = require('process');
const AWS = require('aws-sdk');
const {wait} = require('./dchcore/concurrent.js');

const E = module.exports;

const resolveOpt = (opt={})=>({
    client: opt.client||E.createClient(),
    bucket: opt.bucket||env.BUCKETEER_BUCKET_NAME,
    ...opt,
});

const wCallback = w=>(err, data)=>{
    if (err)
        return void w.reject(err);
    w.resolve(data);
};

E.createClient = ({region, accessKeyId, secretAccessKey}={})=>new AWS.S3({
    region: region||env.BUCKETEER_AWS_REGION,
    credentials: {
        accessKeyId: accessKeyId||env.BUCKETEER_AWS_ACCESS_KEY_ID,
        secretAccessKey: secretAccessKey||env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
    },
});

E.upload = (filepath, dataStream, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    const w = wait();
    client.upload({
        Bucket: bucket,
        Key: filepath,
        Body: dataStream,
    }, wCallback(w));
    return w.promise;
};

E.download = (filepath, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    return client.getObject({
        Bucket: bucket,
        Key: filepath,
    }).createReadStream();
};

const _listObjects = (opt={})=>{
    const {client, bucket, continuationToken} = resolveOpt(opt);
    const w = wait();
    client.listObjectsV2({
        Bucket: bucket,
        ...continuationToken&&{ContinuationToken: continuationToken},
    }, wCallback(w));
    return w.promise;
};

E.listObjects = (opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    const w = wait();
    const allKeys = [];
    (async ()=>{
        let continuationToken;
        while (true) {
            let data = await _listObjects({client, bucket, continuationToken});
            allKeys.push(...data.Contents.map(c=>c.Key));
            if (!data.IsTruncated) {
                w.resolve(allKeys);
                break;
            }
            continuationToken = data.NextContinuationToken;
        }
    })();
    return w.promise;
};

E.deleteObject = (filepath, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    const w = wait();
    client.deleteObject({
        Bucket: bucket,
        Key: filepath,
    }, wCallback(w));
    return w.promise;
};

// TODO: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/S3Client/
