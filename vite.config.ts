import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4176,
    strictPort: true,
    // allows testing on a phone in the same network via http://<lan-ip>:4176
    // (camera still needs https there — see README)
    host: true,
  },
});
