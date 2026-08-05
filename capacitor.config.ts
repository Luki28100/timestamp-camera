import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.lukas.timestampcamera",
  appName: "Zeitstempel-Kamera",
  webDir: "dist",
  android: {
    // the WebView needs this so getUserMedia is treated as a secure context
    allowMixedContent: false,
  },
};

export default config;
