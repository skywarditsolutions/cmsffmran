import http from "node:http";

// Local emulation of the API Gateway HTTP API. It invokes the SAME Lambda
// handler code used in AWS, synthesizing APIGatewayProxyEventV2 payloads. This
// keeps the local demo reliable while Terraform provisions the real AWS path.
const PORT = 3000;

// Endpoints the host process uses to reach LocalStack + the WS bridge.
process.env.AWS_ENDPOINT_OVERRIDE ??= "http://localhost:4566";
process.env.AWS_REGION ??= "us-east-1";
process.env.WS_CALLBACK_URL ??= "http://localhost:3002";
process.env.STATE_MACHINE_ARN ??=
  "arn:aws:states:us-east-1:000000000000:stateMachine:ran-routing";
process.env.PII_KEY_ID ??= "alias/ran-pii";

type Handler = (event: any) => Promise<any>;

interface Route {
  method: string;
  pattern: RegExp;
  params: string[];
  handlerName: string;
}

function route(method: string, path: string, handlerName: string): Route {
  const params: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:(\w+)/g, (_m, p) => {
        params.push(p);
        return "([^/]+)";
      }) +
      "$",
  );
  return { method, pattern, params, handlerName };
}

const routes: Route[] = [
  route("POST", "/requests", "consumerCreate"),
  route("GET", "/requests/:id", "consumerGet"),
  route("POST", "/agent/requests/:id/accept", "agentAccept"),
  route("POST", "/agent/requests/:id/reject", "agentReject"),
  route("POST", "/agent/requests/:id/status", "agentUpdateStatus"),
  route("GET", "/agent/profile", "agentProfileGet"),
  route("PUT", "/agent/profile", "agentProfileUpdate"),
  route("POST", "/agent/status", "agentSetStatus"),
  route("POST", "/agent/today-availability", "agentTodayAvailability"),
  route("POST", "/agent/out-of-office", "agentOutOfOffice"),
  route("GET", "/agent/missed-referrals", "agentMissedReferrals"),
  route("GET", "/agent/stats", "agentStats"),
  route("GET", "/agent/history", "agentHistory"),
  route("GET", "/admin/metrics", "adminMetrics"),
  route("GET", "/admin/requests", "adminRequests"),
  route("GET", "/admin/config", "adminConfigGet"),
  route("PUT", "/admin/config", "adminConfigUpdate"),
  route("GET", "/admin/agent/:npn", "adminGetAgent"),
  route("POST", "/admin/agent/:npn/notify", "adminNotifyAgent"),
];

async function main() {
  const handlers = (await import("../src/index.js")) as unknown as Record<string, Handler>;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const match = routes.find(
        (r) => r.method === req.method && r.pattern.test(url.pathname),
      );
      if (!match) {
        res.writeHead(404, corsHeaders());
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      const m = url.pathname.match(match.pattern)!;
      const pathParameters: Record<string, string> = {};
      match.params.forEach((p, i) => (pathParameters[p] = decodeURIComponent(m[i + 1])));

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
      }

      const event = {
        rawPath: url.pathname,
        requestContext: { http: { method: req.method } },
        headers,
        pathParameters,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: body || undefined,
      };

      try {
        const result = await handlers[match.handlerName](event);
        const statusCode = result?.statusCode ?? 200;
        res.writeHead(statusCode, { ...corsHeaders(), "Content-Type": "application/json" });
        res.end(result?.body ?? "");
      } catch (err) {
        console.error("handler error", match.handlerName, err);
        res.writeHead(500, corsHeaders());
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  server.listen(PORT, () => console.log(`API server: http://localhost:${PORT}`));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,authorization,x-ran-npn,x-ran-role",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  };
}

main();
