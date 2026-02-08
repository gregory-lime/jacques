/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JACQUES_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
