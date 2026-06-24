# Request Assistance Now (RAN) — AWS-Native Prototype

A working prototype of the modern, non-proprietary replacement for the FFM
Agent/Broker **Help On Demand (HOD)** system. RAN connects HealthCare.gov
consumers with a licensed, Marketplace-registered agent or broker in minutes,
routing by ZIP code, language, availability, and load.

This prototype is **AWS-native and deployable** (Terraform), and runs **locally
against LocalStack** with real AWS SDK calls so it can be demonstrated live
without a GovCloud account. The same Terraform deploys to AWS GovCloud.

> Bid/demo artifact. Not production. See `docs/security-compliance.md` for how
> the design maps to CMS ARS / NEE SSP / Section 508 requirements.

## What it demonstrates

- **Consumer intake** — co-branded, Section 508 / WCAG 2.1 AA web form with TCPA
  consent and third-party redirect disclaimers.
- **Intelligent matching** — by ZIP→state, preferred language, availability
  window, and **load balancing** across agents in a geography, with proximity.
- **Multi-channel notification** — SMS (SNS), email (SES), and real-time push.
- **15-minute auto-reroute** — a Step Functions state machine waits for an agent
  to accept and reroutes to the next-best match on timeout or rejection.
- **PII protection** — consumer PII is encrypted at rest (KMS) and revealed
  **only to the agent who accepts**.
- **Three surfaces** — consumer form, agent/broker dashboard (Cognito auth), and
  CMS admin/operations dashboard with live metrics and business-rule controls.

## Architecture

```
Consumer / Agent / Admin (React, TS)
        │ REST + WebSocket
        ▼
API Gateway HTTP + WebSocket  ──►  Lambda (Node/TS)
                                     ├─ DynamoDB (agents, requests, connections, config)
                                     ├─ KMS (PII field encryption)
                                     ├─ Step Functions (routing + 15-min reroute timer)
                                     ├─ SNS (SMS) / SES (email) / WS push
                                     └─ Cognito (agent/admin identity, groups)
```

See `docs/architecture.md` for diagrams and `docs/aws-mapping.md` for how each
local emulation maps to the GovCloud service.

## Prerequisites

- Docker (for LocalStack + cognito-local)
- Node.js >= 20
- Terraform >= 1.5 and `tflocal` (`pip install terraform-local`)
- AWS CLI v2 (used by the Cognito setup script)

## Quick start (local)

```bash
# 1. One-time bootstrap: start LocalStack, build Lambdas, terraform apply,
#    provision Cognito users, seed demo agents.
npm run bootstrap

# 2. In three separate terminals:
npm run ws-bridge --workspace backend     # real-time bridge  (ws :3001, push :3002)
npm run api       --workspace backend     # REST API          (:3000)
npm run dev:frontend                       # UI                (:5173)
```

Then open:

- Consumer:  http://localhost:5173/assist
- Agent:     http://localhost:5173/agent   (agent@ran.demo / Agent#Demo123)
- Admin:     http://localhost:5173/admin   (admin@ran.demo / Admin#Demo123)

### Demo flow

1. Open the **Agent** dashboard, sign in, confirm "Online". Set **Today's
   Availability** or **Out of Office** if desired.
2. Open the **Consumer** page, submit a request (e.g., ZIP `33101`, Spanish,
   preferred contact method Phone/Email).
3. Watch the referral appear on the agent dashboard with a countdown.
   - **Accept** → consumer PII is revealed to that agent; the consumer page
     shows "connected".
   - **Do nothing** → after the timeout the referral auto-reroutes to the next
     agent (Step Functions); the first agent gets a missed-referral notice.
4. Open the **Admin** dashboard to see live response time, acceptance rate,
   reroute and safety-net metrics, the per-request routing timeline, and the
   compliance flags panel (deactivation risk / password rotation / training).
   Adjust business rules under "Business rules".

### After-hours Safety Net demo

To trigger the safety-net broadcast (no agent on duty), set all agents offline
with `npx tsx backend/scripts/test-safetynet.ts`, then submit a consumer
request. It routes to `SafetyNet`, emailing all licensed agents in the state;
the first agent to **Accept** wins the referral (others get a 409 and no PII).
Restore agents with `npm run seed`.

A scripted consumer request is available via `bash scripts/demo.sh`.

## Deploying to AWS / GovCloud

The Terraform in `infra/terraform` is GovCloud-ready (no hardcoded LocalStack
endpoints). For a real deployment:

```bash
cd infra/terraform
terraform init
terraform apply -var region=us-gov-west-1 -var environment=prod \
  -var create_cognito=true -var routing_timeout_seconds=900
```

## Repository layout

```
infra/terraform/      AWS-native infrastructure (DynamoDB, Lambda, Step Functions,
                      API Gateway HTTP+WS, Cognito, KMS, SNS/SES, IAM)
backend/              Node/TS Lambda handlers, matching engine, host dev servers
  src/handlers/       consumer, agent, admin, ws, routing (SFN tasks)
  src/lib/            clients, crypto (PII), matching, repo, zip, auth, config
  scripts/            api-server, ws-bridge, seed
frontend/             React/TS app: /assist (consumer), /agent, /admin
scripts/              bootstrap-localstack.sh, setup-cognito.sh, demo.sh
docs/                 architecture, aws-mapping, security-compliance
```

## Testing

```bash
npm run test --workspace backend        # matching engine unit tests
npm run typecheck                        # backend + frontend
npm run build:backend && npm run build:frontend
```
