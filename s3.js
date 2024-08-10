const {env} = require('process');
const {S3} = require('@aws-sdk/client-s3');
const {Upload} = require('@aws-sdk/lib-storage');
const {wait} = require('./dchcore/concurrent.js');

const E = module.exports;

const resolveOpt = (opt={})=>({
    ...opt,
    client: opt.client||E.createClient(),
    bucket: opt.bucket||env.BUCKETEER_BUCKET_NAME,
});

E.createClient = ({region, accessKeyId, secretAccessKey}={})=>new S3({
    region: region||env.BUCKETEER_AWS_REGION,
    credentials: {
        accessKeyId: accessKeyId||env.BUCKETEER_AWS_ACCESS_KEY_ID,
        secretAccessKey: secretAccessKey||env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
    },
});

E.upload = (filepath, dataStream, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    return new Upload({client, params: {
        Bucket: bucket,
        Key: filepath,
        Body: dataStream,
    }}).done();
};

E.download = async (filepath, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    return (await client.getObject({
        Bucket: bucket,
        Key: filepath,
    })).Body.transformToWebStream();
};

E.listObjects = (opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    const w = wait();
    const allKeys = [];
    (async ()=>{
        let continuationToken;
        while (true) {
            let data = await client.listObjectsV2({
                Bucket: bucket,
                ...continuationToken&&{ContinuationToken: continuationToken},
            });
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
    return client.deleteObject({
        Bucket: bucket,
        Key: filepath,
    });
};

// TODO: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/S3Client/
