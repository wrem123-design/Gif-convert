declare module "pngjs" {
  export class PNG {
    constructor(options: { width: number; height: number });
    data: Buffer;
    width: number;
    height: number;
  }
}
