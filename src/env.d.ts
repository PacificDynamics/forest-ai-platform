/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
interface ImportMetaEnv {
  readonly FOREST_AI_REPLY_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
