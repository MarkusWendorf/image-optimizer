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

    const fn = new NodejsFunction(this, "ResizeLambda", {
      entry: resolve(__dirname, "..", "src", "handler.ts"),
      memorySize: 3072,
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.X86_64,
      timeout: Duration.seconds(60),
      environment: {
        IMAGE_BUCKET: bucket.bucketName,
        ALLOWED_HOSTS: "*",
        DEFAULT_DOMAIN: "stage.7f.com",
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
            return [
              `cd ${outputDir}`,
              "rm -rf node_modules && rm package-lock.json && npm install --cpu=x64 --os=linux --libc=musl sharp",
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
      minTtl: Duration.minutes(10),
      maxTtl: Duration.days(365),
      defaultTtl: Duration.days(1),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "Accept",
        "Authorization"
      ),
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
