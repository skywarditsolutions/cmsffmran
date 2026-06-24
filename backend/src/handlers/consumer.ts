import { StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ulid } from "ulid";
import { sfn } from "../lib/clients.js";
import { env } from "../lib/env.js";
import { ok, bad, parseBody } from "../lib/http.js";
import { encryptPII } from "../lib/crypto.js";
import { resolveZip } from "../lib/zip.js";
import { getRequest, putRequest, getAgent } from "../lib/repo.js";
import { pushToChannel } from "../lib/ws.js";
import type { AssistanceRequest, ConsumerContactMethod, PhoneType } from "../lib/types.js";

interface CreateBody {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  phoneType: PhoneType;
  preferredContactMethod: ConsumerContactMethod;
  zip: string;
  language: string;
  consentTcpa: boolean;
}

export const consumerCreate = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const body = parseBody<CreateBody>(event.body);

  if (!body.firstName || !body.lastName || !body.phone || !body.zip || !body.language) {
    return bad("Missing required fields");
  }
  if (!body.consentTcpa) {
    return bad("TCPA consent is required to request a callback");
  }
  if (!/^\d{5}$/.test(body.zip)) {
    return bad("ZIP must be 5 digits");
  }
  const contactMethod: ConsumerContactMethod =
    body.preferredContactMethod === "Email" ? "Email" : "Phone";
  // Per HOD: email is required when the consumer chooses Email as the contact
  // method; optional only when Phone is chosen.
  if (contactMethod === "Email" && !body.email) {
    return bad("Email is required when Email is the preferred contact method");
  }
  const phoneType: PhoneType =
    ["Mobile", "Home", "Work"].includes(body.phoneType as string) ? (body.phoneType as PhoneType) : "Mobile";

  const { state, city, lat, lng } = resolveZip(body.zip);
  const piiEncrypted = await encryptPII({
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    phoneType,
    email: body.email,
    preferredContactMethod: contactMethod,
  });

  const now = new Date().toISOString();
  const request: AssistanceRequest = {
    requestId: ulid(),
    status: "Matching",
    zip: body.zip,
    city,
    state,
    language: body.language,
    lat,
    lng,
    piiEncrypted,
    consentTcpa: true,
    safetyNet: false,
    assignedNpn: null,
    routingHistory: [],
    taskToken: null,
    createdAt: now,
    updatedAt: now,
  };
  await putRequest(request);

  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: env.stateMachineArn,
      name: request.requestId,
      input: JSON.stringify({ requestId: request.requestId }),
    }),
  );

  await pushToChannel(request.requestId, "status", { status: "Matching" });

  return ok({ requestId: request.requestId, status: request.status }, 201);
};

export const consumerGet = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const requestId = event.pathParameters?.id;
  if (!requestId) return bad("Missing request id");
  const req = await getRequest(requestId);
  if (!req) return bad("Request not found", 404);

  // Consumer-facing view never exposes routing internals; once accepted the
  // assigned agent's public contact info is shared so the consumer expects the call.
  let assignedAgent: { name: string; phone: string } | undefined;
  if (req.status === "Accepted" || req.status === "InProgress") {
    const agent = req.assignedNpn ? await getAgent(req.assignedNpn) : undefined;
    if (agent) assignedAgent = { name: agent.name, phone: agent.phone };
  }

  return ok({
    requestId: req.requestId,
    status: req.status,
    language: req.language,
    state: req.state,
    attempts: req.routingHistory.length,
    assignedAgent,
    createdAt: req.createdAt,
  });
};
