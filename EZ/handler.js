// adapted from https://docs.aws.amazon.com/lambda/latest/dg/with-s3-example-deployment-pkg.html

// dependencies
let AWS = require('aws-sdk');
let async = require('async');
let gm = require('gm');//.subClass({ imageMagick: true }); // Enable ImageMagick integration.
let util = require('util');

// get reference to S3 client 
const s3 = new AWS.S3();

// constants
const MAX_WIDTH = 100;
const MAX_HEIGHT = 100;

exports.handler = function (event, context, callback) {

    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, { depth: 5 }));
    // Object key may have spaces or unicode non-ASCII characters.
    let srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    let dstKey = "thumb-" + srcKey;

    // Infer the image type.
    let typeMatch = srcKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
        callback("Could not determine the image type.");
        return;
    }
    let imageType = typeMatch[1];
    if (imageType != "jpg" && imageType != "png") {
        callback(`Unsupported image type: ${imageType}`);
        return;
    }

    // Download the image from S3, transform, and upload under new key.
    async.waterfall([
        function download(next) {
            // Download the image from S3 into a buffer.
            s3.getObject({
                'Bucket': 'sigma-s3-thumb',
                'Key': srcKey
            }, next);
        },
        function transform(response, next) {
            gm(response.Body).size(function (err, size) {
                // Infer the scaling factor to avoid stretching the image unnaturally.
                let scalingFactor = Math.min(
                    MAX_WIDTH / size.width,
                    MAX_HEIGHT / size.height
                );
                let width = scalingFactor * size.width;
                let height = scalingFactor * size.height;

                // Transform the image buffer in memory.
                this.resize(width, height)
                    .toBuffer(imageType, function (err, buffer) {
                        if (err) {
                            next(err);
                        } else {
                            next(null, response.ContentType, buffer);
                        }
                    });
            });
        },
        function upload(contentType, data, next) {
            // Stream the transformed image to a different S3 bucket.
            s3.putObject({
                "Body": data,
                "Bucket": 'sigma-s3-thumb',
                "Key": dstKey,
                "ContentType": contentType
            }, next);
        }
    ], function (err) {
        let msg;
        if (err) {
            msg = `Unable to resize sigma-s3-thumb/${srcKey} and upload to sigma-s3-thumb/${dstKey} due to an error: ${err}`;
            console.error(msg);
        } else {
            msg = `Successfully resized sigma-s3-thumb/${srcKey} and uploaded to sigma-s3-thumb/${dstKey}`;
            console.log(msg);
        }
        callback(err, msg);
    }
    );
};
