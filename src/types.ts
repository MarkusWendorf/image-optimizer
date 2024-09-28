import { AvifOptions, JpegOptions, WebpOptions, GifOptions } from "sharp";

export type Encoding = Avif | Webp | Jpg | Gif;

interface BaseOptions {
  width: number;
}

interface Avif extends BaseOptions {
  format: "avif";
  options: AvifOptions;
}

interface Webp extends BaseOptions {
  format: "webp";
  options: WebpOptions;
}

interface Jpg extends BaseOptions {
  format: "jpg";
  options: JpegOptions;
}

interface Gif extends BaseOptions {
  format: "gif";
  options: GifOptions;
}
