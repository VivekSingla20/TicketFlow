import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { WS_URL } from "./config";
import { useAuth } from "./auth";

type Handler = (data: any) => void;

type WsApi = {
  join: (room: string) => void;
  leave: (room: string) => void;
  on: (event: string, handler: Handler) => () => void;
  send: (event: string, data?: any) => void;
};

const WsContext = createContext<WsApi | null>(null);

export function WsProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const roomsRef = useRef<Set<string>>(new Set());
  const reconnectAttempt = useRef(0);
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!accessToken) {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      return;
    }
    let closed = false;
    const connect = () => {
      if (!accessToken) return;
      const url = `${WS_URL}?token=${encodeURIComponent(accessToken)}`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt.current = 0;
        for (const room of roomsRef.current) {
          ws.send(JSON.stringify({ event: "join", room }));
        }
      };
      ws.onmessage = (e) => {
        let msg: any = null;
        try { msg = JSON.parse(e.data); } catch { return; }
        const eventName = msg.event || msg.type;
        if (!eventName) return;
        const set = handlersRef.current.get(eventName);
        if (set) for (const h of set) h(msg.data ?? msg.payload ?? msg);
      };
      ws.onclose = () => {
        if (closed || !accessToken) return;
        const delay = Math.min(15000, 1000 * 2 ** reconnectAttempt.current++);
        setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();
    return () => {
      closed = true;
      try { wsRef.current?.close(); } catch {}
    };
  }, [accessToken]);

  const api: WsApi = {
    join: (room) => {
      roomsRef.current.add(room);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "join", room }));
      }
    },
    leave: (room) => {
      roomsRef.current.delete(room);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "leave", room }));
      }
    },
    on: (event, handler) => {
      let set = handlersRef.current.get(event);
      if (!set) { set = new Set(); handlersRef.current.set(event, set); }
      set.add(handler);
      return () => { set!.delete(handler); };
    },
    send: (event, data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
    },
  };

  return <WsContext.Provider value={api}>{children}</WsContext.Provider>;
}

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used within WsProvider");
  return ctx;
}

export function useWsEvent(event: string, handler: Handler, deps: any[] = []) {
  const ws = useWs();
  useEffect(() => ws.on(event, handler), deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useWsRoom(room: string | null | undefined) {
  const ws = useWs();
  useEffect(() => {
    if (!room) return;
    ws.join(room);
    return () => ws.leave(room);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
}
