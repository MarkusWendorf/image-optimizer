import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { availableParallelism } from "node:os";
import { z } from "zod";
import sharp, { ResizeOptions, Sharp } from "sharp";
import { validateEnv } from "./env";
import { error, ok } from "./helper";
import { Encoding } from "./types";

const { IMAGE_BUCKET, DEFAULT_DOMAIN, ALLOWED_HOSTS } = validateEnv(
  process.env
);

const client = new S3Client({
  region: process.env.AWS_REGION || "eu-central-1",
});

const optionSchema = z.object({
  w: z.coerce.number().gte(16).lte(3840),
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

sharp.concurrency(availableParallelism());

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    return await optimizeImage(event);
  } catch (err) {
    console.log(event.queryStringParameters);

    if (err instanceof Error) {
      return error(err.message);
    }

    console.error(err);
    return { statusCode: 500 };
  }
}

async function optimizeImage(event: APIGatewayProxyEventV2) {
  const options = validateOptions(event);

  const existingImage = await getCachedImage(options);
  if (existingImage) {
    return ok(existingImage);
  }

  const response = await fetch(options.parsedUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch image, status code: " + response.status);
  }

  const imageData = await response.arrayBuffer();
  const originalContentType =
    response.headers.get("Content-Type") || "application/octet-stream";

  const image = sharp(imageData, { animated: true });
  const { contentType, buffer } = await processImage(image, options.encoding);

  // Images bigger than 5MB output size are not supported
  if (buffer.byteLength > 5_000_000) {
    return error(`Excessive output size: ${buffer.byteLength} bytes`);
  }

  // Return original image if "optimized" image is larger
  if (buffer.byteLength > imageData.byteLength) {
    return unmodifiedImage(imageData, originalContentType, options);
  }

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
    // Include selected encoding as cache key, so we can change the encoding and force a cache refresh
    encoding: selectEncoding(
      validation.data.q,
      validation.data.w,
      extname(validation.data.url),
      event.headers["accept"] || ""
    ),
  };
}

function selectEncoding(
  quality: number,
  width: number,
  sourceFormat: string,
  accept: string
): Options["encoding"] {
  if (sourceFormat === ".gif") {
    width = Math.min(width, 1024); // Limit gif size
  }

  if (accept.includes("image/avif")) {
    return {
      format: "avif",
      width,
      options: {
        chromaSubsampling: "4:2:0",
        effort: 3,
        quality: Math.max(quality - 15, 50),
      },
    };
  }

  if (accept.includes("image/webp")) {
    return { format: "webp", width, options: { quality } };
  }

  if (sourceFormat == ".gif") {
    return { format: "gif", width, options: { effort: 10 } };
  }

  return { format: "jpg", options: { quality, mozjpeg: true }, width };
}

async function processImage(image: Sharp, encoding: Options["encoding"]) {
  const resize: ResizeOptions = {
    width: encoding.width,
    withoutEnlargement: true,
  };

  if (encoding.format == "gif") {
    return {
      contentType: "image/gif",
      buffer: await image.gif(encoding.options).resize(resize).toBuffer(),
    };
  }

  if (encoding.format == "avif") {
    return {
      contentType: "image/avif",
      buffer: await image.avif(encoding.options).resize(resize).toBuffer(),
    };
  }

  if (encoding.format == "webp") {
    return {
      contentType: "image/webp",
      buffer: await image.webp(encoding.options).resize(resize).toBuffer(),
    };
  }

  return {
    contentType: "image/jpeg",
    buffer: await image.jpeg(encoding.options).resize(resize).toBuffer(),
  };
}

async function unmodifiedImage(
  imageData: ArrayBuffer,
  contentType: string,
  options: Options
) {
  const originalImageBuffer = Buffer.from(imageData);

  await cacheImage(originalImageBuffer, contentType, options);

  return ok({
    image: originalImageBuffer.toString("base64"),
    contentType,
  });
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
  return createHash("sha256").update(JSON.stringify(options)).digest("hex");
}
