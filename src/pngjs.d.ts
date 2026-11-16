declare module "pngjs" {
  export class PNG {
    constructor(options: { width: number; height: number });
    data: Buffer;
    width: number;
    height: number;
    static sync: { write(png: PNG): Buffer };
  }
}
