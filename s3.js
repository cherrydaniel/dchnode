const {env} = require('process');
const {S3} = require('@aws-sdk/client-s3');
const {Upload} = require('@aws-sdk/lib-storage');
const {wait} = require('./dchcore/concurrent.js');
const { createObjectReadable, accumulateObjects, createObjectWritable } = require('./stream.js');
const { finished } = require('stream/promises');

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

E.listObjects = opt=>accumulateObjects(E.streamObjects(opt));

E.streamObjects = (opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    let continuationToken;
    return createObjectReadable(async push=>{
        const data = await client.listObjectsV2({
            Bucket: bucket,
            ...continuationToken&&{ContinuationToken: continuationToken},
        });
        data.Contents.map(c=>c.Key).forEach(k=>push(k));
        if (!data.IsTruncated)
            return void push(null);
        continuationToken = data.NextContinuationToken;
    });
};

E.deleteObject = (filepath, opt={})=>{
    const {client, bucket} = resolveOpt(opt);
    return client.deleteObject({
        Bucket: bucket,
        Key: filepath,
    });
};

// TODO: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/S3Client/
