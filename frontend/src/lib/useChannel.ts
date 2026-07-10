import { useEffect, useRef } from "react";
import { config } from "./config";

export interface ChannelMessage {
  type: string;
  payload: any;
}

// Heartbeat interval. API Gateway WebSocket connections are closed after a
// ~10 minute idle period, so we send a ping well within that window to keep the
// connection alive; otherwise a client that sits idle (e.g. an agent waiting
// for referrals, or a consumer waiting to be matched) silently stops receiving
// real-time messages until the page is reloaded.
const HEARTBEAT_MS = 4 * 60 * 1000;

// Subscribes to one or more real-time channels via the WebSocket bridge
// (API Gateway WebSockets in AWS). Keeps the connection alive with a heartbeat,
// reconnects automatically, and invokes onReconnect after a dropped connection
// is re-established so callers can resync any state missed while offline.
export function useChannel(
  channels: string[],
  onMessage: (msg: ChannelMessage) => void,
  onReconnect?: () => void,
) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const key = channels.filter(Boolean).join(",");

  useEffect(() => {
    if (!key) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let everConnected = false;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;

    const connect = () => {
      ws = new WebSocket(`${config.wsUrl}?channel=${encodeURIComponent(key)}`);
      ws.onopen = () => {
        clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          try {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" }));
          } catch {
            /* ignore */
          }
        }, HEARTBEAT_MS);
        if (everConnected) reconnectRef.current?.();
        everConnected = true;
      };
      ws.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data));
        } catch {
          /* ignore (non-JSON frames such as ping acks) */
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        clearInterval(heartbeat);
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      ws?.close();
    };
  }, [key]);
}
