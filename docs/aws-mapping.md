# Local ↔ AWS GovCloud Mapping

The prototype runs locally but is architected as a 1:1 mirror of an AWS GovCloud
deployment. The Lambda/business code is identical in both modes; only the
runtime substrate differs.

| Capability | AWS GovCloud (production) | Local prototype | Why it differs |
|------------|--------------------------|-----------------|----------------|
| Compute | Lambda (`nodejs20.x`) | LocalStack Lambda for SFN tasks; host `api-server` for REST | LocalStack API Gateway is flaky/slow in community edition; the host server runs the same handler code for a reliable demo |
| REST API | API Gateway HTTP API + Cognito JWT authorizer | `backend/scripts/api-server.ts` (synthesizes the same `APIGatewayProxyEventV2`) | Same handlers, faster local loop. Terraform still provisions the real HTTP API |
| Real-time | API Gateway WebSocket + `@connections` | `backend/scripts/ws-bridge.ts` (ws server + `/push`) | WebSocket API Gateway is Pro/partial in community LocalStack |
| Routing/timer | Step Functions (`waitForTaskToken`, `TimeoutSeconds`) | LocalStack Step Functions | Supported in community LocalStack |
| Data | DynamoDB | LocalStack DynamoDB | Native parity |
| PII encryption | KMS CMK (alias `ran-pii`) | LocalStack KMS | Native parity |
| Notifications | SNS (SMS), SES (email) | LocalStack SNS/SES (recorded, not delivered) | No real carrier/email in a sandbox |
| Identity | Amazon Cognito user pools + groups | `cognito-local` emulator | Cognito is a Pro feature in LocalStack |
| IaC | Terraform | Terraform via `tflocal` (auto-injects endpoints) | `.tf` files contain **no** LocalStack endpoints, so they are GovCloud-ready as-is |

## Endpoint resolution

`backend/src/lib/env.ts` reads `AWS_ENDPOINT_OVERRIDE` (or `AWS_ENDPOINT_URL`).
When empty, the AWS SDK resolves real AWS endpoints; when set, every client
targets LocalStack. Host processes use `http://localhost:4566`; Lambdas running
inside the LocalStack container use `http://host.docker.internal:4566`.

## Real-time abstraction

`backend/src/lib/ws.ts#pushToChannel` POSTs to the WS bridge locally. For AWS,
swap this implementation for `ApiGatewayManagementApiClient.postToConnection`,
fanning out over connection IDs from the `ran-connections` table (the
`wsConnect`/`wsDisconnect` handlers already populate it). No business-logic
changes are required.

## What is intentionally simplified for the prototype

- SMS/push are surfaced in the UI rather than delivered to real devices.
- The ZIP→state crosswalk is a curated subset (`backend/src/lib/zip.ts`);
  production would load the authoritative HUD/USPS dataset.
- No native mobile app; the agent dashboard is mobile-responsive (PWA-ready).
- Frontend auth uses cognito-local and, if unreachable, a header-based identity
  fallback so the demo never blocks.
