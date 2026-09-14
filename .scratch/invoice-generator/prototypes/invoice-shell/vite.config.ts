import { defineConfig } from "vite-plus";

import electron from "../../src/index";

export default defineConfig({
  build: {
    minify: false,
  },
  plugins: [electron({ entry: "electron/main.ts" })],
});
