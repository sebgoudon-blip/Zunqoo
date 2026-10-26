import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Firebase dans un fichier séparé : mis en cache indépendamment du code de l'app.
      output: { manualChunks: { firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/functions"] } },
    },
  },
});
