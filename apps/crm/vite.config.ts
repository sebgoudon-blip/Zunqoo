import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, /api et /webhooks sont relayés vers l'API Python
// (uvicorn zunqoo_voice.api.app:app --port 8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
