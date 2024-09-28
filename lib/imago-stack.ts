import { Stack, Duration, StackProps, CfnOutput } from "aws-cdk-lib";
import {
  Architecture,
  FunctionUrlAuthType,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";
import { resolve } from "path";

export class ImagoStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "ImageBucket", {});

    const arch: Architecture = Architecture.ARM_64;

    const fn = new NodejsFunction(this, "ResizeLambda", {
      entry: resolve(__dirname, "..", "src", "handler.ts"),
      memorySize: 3072,
      runtime: Runtime.NODEJS_20_X,
      architecture: arch,
      timeout: Duration.seconds(30),
      environment: {
        IMAGE_BUCKET: bucket.bucketName,
        ALLOWED_HOSTS: "*",
        DEFAULT_DOMAIN: "example.com",
      },
      bundling: {
        externalModules: ["sharp", "@aws-sdk/client-s3"],
        nodeModules: ["sharp"],
        commandHooks: {
          beforeBundling() {
            return [];
          },
          beforeInstall() {
            return [];
          },
          afterBundling(_: string, outputDir: string) {
            const cpu = arch == Architecture.ARM_64 ? "arm64" : "x64";

            return [
              `cd ${outputDir}`,
              `rm -rf node_modules && rm package-lock.json && npm install --cpu=${cpu} --os=linux --libc=glibc sharp`,
            ];
          },
        },
      },
    });

    const fnUrl = fn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    bucket.grantReadWrite(fn);

    const cachePolicy = new cloudfront.CachePolicy(this, "CachePolicy", {
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      defaultTtl: Duration.days(14),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
        "w",
        "q",
        "url"
      ),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Accept"),
    });

    const cdn = new cloudfront.Distribution(this, "Cdn", {
      defaultBehavior: {
        origin: new FunctionUrlOrigin(fnUrl),
        cachePolicy,
      },
    });

    new CfnOutput(this, "Url", {
      value: cdn.distributionDomainName,
    });
  }
}
