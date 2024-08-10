const {env} = require('process');
const AWS = require('aws-sdk');
const {wait} = require('./dchcore/util/concurrent.js');

const E = module.exports;

E.createInstance = ({region, accessKeyId, secretAccessKey})=>new AWS.S3({
    region: region||env.BUCKETEER_AWS_REGION,
    credentials: {
        accessKeyId: accessKeyId||env.BUCKETEER_AWS_ACCESS_KEY_ID,
        secretAccessKey: secretAccessKey||env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
    },
});

E.upload = (filepath, dataStream, opt={})=>{
    const {bucket} = opt;
    const w = wait();
    E.createInstance().upload({
        Bucket: bucket||env.BUCKETEER_BUCKET_NAME,
        Key: filepath,
        Body: dataStream,
    }, (err, data)=>{
        if (err)
            return void w.reject(err);
        w.resolve(data);
    });
    return w.promise;
};

E.download = (filepath, opt={})=>{
    const {bucket} = opt;
    return E.createInstance().getObject({
        Bucket: bucket||env.BUCKETEER_BUCKET_NAME,
        Key: filepath,
    }).createReadStream();
};

// TODO: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/S3Client/
