import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { KMSClient } from "@aws-sdk/client-kms";
import { SNSClient } from "@aws-sdk/client-sns";
import { SESClient } from "@aws-sdk/client-ses";
import { SFNClient } from "@aws-sdk/client-sfn";
import { env } from "./env.js";

// When running against LocalStack every client points at the same endpoint;
// in real AWS/GovCloud the override is empty and the SDK resolves normally.
const base = env.endpoint
  ? { region: env.region, endpoint: env.endpoint }
  : { region: env.region };

const localCreds = env.endpoint
  ? { credentials: { accessKeyId: "test", secretAccessKey: "test" } }
  : {};

const config = { ...base, ...localCreds };

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(config), {
  marshallOptions: { removeUndefinedValues: true },
});
export const kms = new KMSClient(config);
export const sns = new SNSClient(config);
export const ses = new SESClient(config);
export const sfn = new SFNClient(config);
