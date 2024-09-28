# AWS Lambda image optimizer compatible with Next.js

Given a url like `https://example.com?url=https://image.com/mountain.png&w=1024&q=70` it will:

- generate an optimized version based on the `Accept` header sent by the client (avif and webp preferred)
- save the optimized image to S3 (for fast retrieval should the CDN cache be invalidated)
- cache the image in CloudFront (CDN)

# Configuration

| Env            | Description                                                                | Example                         | Example |
|----------------|----------------------------------------------------------------------------|---------------------------------|---------|
| ALLOWED_HOSTS  | Hosts that are valid for image retrieval (allowed for url query parameter) | example.com,cdn.somewhere.co.uk | *       |
| DEFAULT_DOMAIN | The domain that is used for relative paths like "?url=/image.png"          | example.com                     |         |
