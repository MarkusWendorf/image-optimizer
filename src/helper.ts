import { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export function ok({
  image,
  contentType,
  cache = false,
}: {
  image?: string;
  contentType?: string;
  cache?: boolean;
}): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      Vary: "Accept",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Image-Cache": cache,
    },
    body: image,
    isBase64Encoded: true,
  };
}

export function error(message: string): APIGatewayProxyStructuredResultV2 {
  console.error(message);

  return {
    statusCode: 400,
    headers: {
      "Content-Type": "text/plain",
    },
    body: message,
  };
}
