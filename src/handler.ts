import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import crypto from "node:crypto";
import sharp, { Sharp } from "sharp";
import { z } from "zod";
import { validateEnv } from "./env";
import { error, ok } from "./helper";
import { Encoding } from "./types";

const { IMAGE_BUCKET, DEFAULT_DOMAIN, ALLOWED_HOSTS } = validateEnv(
  process.env
);

const client = new S3Client({ region: "eu-central-1" });

const optionSchema = z.object({
  w: z.coerce.number().gte(200).lte(3840),
  q: z.coerce.number().gte(50).lte(100),
  url: z.union([
    z.string().url(), // full URL
    z.string().startsWith("/"), // or relative path (relative to `defaultDomain`)
  ]),
});

type Options = z.infer<typeof optionSchema> & {
  parsedUrl: URL;
  encoding: Encoding;
};

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    return await optimizeImage(event);
  } catch (err) {
    if (err instanceof Error) {
      return error(err.message);
    }

    return { statusCode: 500 };
  }
}

async function optimizeImage(event: APIGatewayProxyEventV2) {
  const options = validateOptions(event);

  const existingImage = await getCachedImage(options);
  if (existingImage) {
    return ok(existingImage);
  }

  const response = await fetch(options.parsedUrl, {
    headers: forwardAuthHeader(event, options),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch image, status code: " + response.status);
  }

  const imageData = await response.arrayBuffer();
  const image = sharp(imageData);
  checkFileType(image);

  const { contentType, buffer } = await processImage(image, options);
  await cacheImage(buffer, contentType, options);

  return ok({ image: buffer.toString("base64"), contentType });
}

function validateOptions(event: APIGatewayProxyEventV2): Options {
  const validation = optionSchema.safeParse(event.queryStringParameters);
  if (!validation.success) {
    throw new Error(`Invalid parameters: ${validation.error.message}`);
  }

  const url = validation.data.url;
  const imageUrl = new URL(
    url.startsWith("http") ? url : "https://" + DEFAULT_DOMAIN + url
  );

  if (
    !ALLOWED_HOSTS.includes(imageUrl.hostname) &&
    !ALLOWED_HOSTS.includes("*")
  ) {
    throw new Error(`Invalid host: ${imageUrl.hostname}`);
  }

  return {
    ...validation.data,
    parsedUrl: imageUrl,
    encoding: selectEncoding(validation.data.q, event.headers["accept"]),
  };
}

function selectEncoding(quality: number, accept?: string): Options["encoding"] {
  if (accept?.includes("image/avif")) {
    return {
      format: "avif",
      options: {
        chromaSubsampling: "4:2:0",
        effort: 2,
        quality: Math.max(quality - 15, 50),
      },
    };
  }

  if (accept?.includes("image/webp")) {
    return {
      format: "webp",
      options: { quality },
    };
  }

  return { format: "jpg", options: { quality, mozjpeg: true } };
}

async function checkFileType(image: Sharp) {
  const { format } = await image.metadata().catch(() => ({ format: "" }));
  if (!format) {
    throw new Error("Unknown image format");
  }

  if (!["png", "jpg", "jpeg", "webp"].includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
}

async function processImage(image: Sharp, { w, encoding }: Options) {
  if (encoding.format == "avif") {
    return {
      contentType: "image/avif",
      buffer: await image
        .avif(encoding.options)
        .resize({ width: w })
        .toBuffer(),
    };
  }

  if (encoding.format == "webp") {
    return {
      contentType: "image/webp",
      buffer: await image
        .webp(encoding.options)
        .resize({ width: w })
        .toBuffer(),
    };
  }

  return {
    contentType: "image/jpeg",
    buffer: await image.jpeg(encoding.options).resize({ width: w }).toBuffer(),
  };
}

async function getCachedImage(options: Options) {
  try {
    const image = await client.send(
      new GetObjectCommand({ Bucket: IMAGE_BUCKET, Key: cacheKey(options) })
    );

    return {
      contentType: image.ContentType,
      image: await image.Body?.transformToString("base64"),
    };
  } catch (err) {
    return undefined;
  }
}

function cacheImage(imageData: Buffer, contentType: string, options: Options) {
  return client.send(
    new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: cacheKey(options),
      Body: imageData,
      ContentType: contentType,
      Metadata: {
        source: options.url,
      },
    })
  );
}

function cacheKey(options: Options) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(options))
    .digest("hex");
}

function forwardAuthHeader(
  event: APIGatewayProxyEventV2,
  options: Options
): Record<string, string> {
  if (options.parsedUrl.hostname === DEFAULT_DOMAIN) {
    const { authorization } = event.headers;
    return authorization ? { authorization } : {};
  }

  return {};
}
