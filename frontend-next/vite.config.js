import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  envDir: fileURLToPath(new URL("../frontend", import.meta.url)),
  server: {
    proxy: {
      "/api": process.env.SENTINEL_API_TARGET || "http://127.0.0.1:8001",
      "/ws": {
        target: (
          process.env.SENTINEL_API_TARGET || "http://127.0.0.1:8001"
        ).replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
});
