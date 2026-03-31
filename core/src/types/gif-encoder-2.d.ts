declare module "gif-encoder-2" {
  export default class GIFEncoder {
    constructor(width: number, height: number, algorithm?: string, useOptimizer?: boolean, totalFrames?: number);
    createReadStream(): NodeJS.ReadableStream;
    start(): void;
    setRepeat(repeat: number): void;
    setDelay(delayMs: number): void;
    setQuality(quality: number): void;
    addFrame(data: Uint8Array | Buffer): void;
    finish(): void;
  }
}
