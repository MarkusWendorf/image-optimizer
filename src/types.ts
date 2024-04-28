import { AvifOptions, JpegOptions, WebpOptions } from "sharp";

export type Encoding = Avif | Webp | Jpg;

interface Avif {
  format: "avif";
  options: AvifOptions;
}

interface Webp {
  format: "webp";
  options: WebpOptions;
}

interface Jpg {
  format: "jpg";
  options: JpegOptions;
}
