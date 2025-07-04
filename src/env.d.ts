/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
interface ImportMetaEnv {
  readonly FOREST_AI_S3_ACCESS_KEY_ID: string;
  readonly FOREST_AI_S3_ACCESS_KEY: string;
  readonly FOREST_AI_AWS_REGION: string;
  readonly FOREST_AI_REPLY_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
