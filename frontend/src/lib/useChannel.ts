import { useEffect, useRef } from "react";
import { config } from "./config";

export interface ChannelMessage {
  type: string;
  payload: any;
}

// Subscribes to one or more real-time channels via the WebSocket bridge
// (API Gateway WebSockets in AWS). Reconnects automatically.
export function useChannel(
  channels: string[],
  onMessage: (msg: ChannelMessage) => void,
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const key = channels.filter(Boolean).join(",");

  useEffect(() => {
    if (!key) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(`${config.wsUrl}?channel=${encodeURIComponent(key)}`);
      ws.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [key]);
}
