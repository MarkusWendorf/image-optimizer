# AWS Lambda image optimizer compatible with Next.js

Given a url like `https://example.com?url=https://image.com/mountain.png&w=1024&q=70` it will:

- generate an optimized version based on the `Accept` header sent by the client (avif and webp preferred)
- saves the optimized image to S3 (for fast retrieval should the CDN cache be invalidated)
- caches the image in CloudFront (CDN)
