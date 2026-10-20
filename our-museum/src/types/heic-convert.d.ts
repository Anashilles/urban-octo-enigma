declare module "heic-convert" {
  interface ConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  const convert: (options: ConvertOptions) => Promise<ArrayBuffer>;
  export default convert;
}
