import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// Local stand-in for API Gateway WebSockets.
//  - WS clients connect on :3001 and subscribe to channels (requestId / npn / "admin").
//  - Lambdas + api-server POST to :3002/push to fan out messages to a channel.
const WS_PORT = 3001;
const PUSH_PORT = 3002;

interface Client extends WebSocket {
  channels: Set<string>;
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (socket: WebSocket, req) => {
  const client = socket as Client;
  client.channels = new Set();
  const url = new URL(req.url ?? "/", "http://localhost");
  const initial = url.searchParams.get("channel");
  if (initial) initial.split(",").forEach((c) => client.channels.add(c));

  client.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === "subscribe" && Array.isArray(msg.channels)) {
        msg.channels.forEach((c: string) => client.channels.add(c));
      }
      if (msg.action === "unsubscribe" && Array.isArray(msg.channels)) {
        msg.channels.forEach((c: string) => client.channels.delete(c));
      }
    } catch {
      /* ignore malformed client frames */
    }
  });

  client.send(JSON.stringify({ type: "connected", payload: { ok: true } }));
});

function broadcast(channel: string, message: unknown) {
  let delivered = 0;
  for (const ws of wss.clients) {
    const client = ws as Client;
    if (client.readyState === WebSocket.OPEN && client.channels.has(channel)) {
      client.send(JSON.stringify(message));
      delivered += 1;
    }
  }
  return delivered;
}

const pushServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/push") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { channel, message } = JSON.parse(body);
        const delivered = broadcast(channel, message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ delivered }));
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

pushServer.listen(PUSH_PORT, () => {
  console.log(`WS bridge: clients ws://localhost:${WS_PORT}  push http://localhost:${PUSH_PORT}/push`);
});
