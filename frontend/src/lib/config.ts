// Configurable backend URLs
const fromEnv = (k: string) => (typeof import.meta !== "undefined" ? (import.meta as any).env?.[k] : undefined);

export const API_URL: string =
  (typeof window !== "undefined" && (window as any).__API_URL__) ||
  fromEnv("VITE_API_URL") ||
  "http://localhost:3000";

export const WS_URL: string =
  (typeof window !== "undefined" && (window as any).__WS_URL__) ||
  fromEnv("VITE_WS_URL") ||
  API_URL.replace(/^http/, "ws") + "/ws";
