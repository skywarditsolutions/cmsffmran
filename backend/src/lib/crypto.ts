import { EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { kms } from "./clients.js";
import { env } from "./env.js";
import type { ConsumerPII } from "./types.js";

// Field-level encryption of consumer PII/PHI using the CMS-controlled KMS key.
// Plaintext PII is never persisted; only the ciphertext lives in DynamoDB.
export async function encryptPII(pii: ConsumerPII): Promise<string> {
  const res = await kms.send(
    new EncryptCommand({
      KeyId: env.piiKeyId,
      Plaintext: Buffer.from(JSON.stringify(pii), "utf8"),
    }),
  );
  return Buffer.from(res.CiphertextBlob as Uint8Array).toString("base64");
}

export async function decryptPII(ciphertextB64: string): Promise<ConsumerPII> {
  const res = await kms.send(
    new DecryptCommand({
      KeyId: env.piiKeyId,
      CiphertextBlob: Buffer.from(ciphertextB64, "base64"),
    }),
  );
  const plaintext = Buffer.from(res.Plaintext as Uint8Array).toString("utf8");
  return JSON.parse(plaintext) as ConsumerPII;
}
