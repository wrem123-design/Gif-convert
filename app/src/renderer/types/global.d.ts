import type { SpriteForgeApi } from "../../main/preload";

declare global {
  interface Window {
    spriteForge: SpriteForgeApi;
  }
}

export {};
