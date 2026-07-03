import { API_URL } from "./config";

type TokenGetter = () => string | null;
let getAccessToken: TokenGetter = () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: { getAccessToken: TokenGetter; onUnauthorized?: () => void }) {
  getAccessToken = opts.getAccessToken;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (init.auth !== false && token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const errMsg = (data && typeof data === "object")
      ? (data.error?.message || data.message || (typeof data.error === "string" ? data.error : null))
      : null;
    throw new ApiError(res.status, errMsg || res.statusText, data);
  }

  if (data && typeof data === "object" && data.success === true && "data" in data) {
    return data.data as T;
  }

  return data as T;
}
