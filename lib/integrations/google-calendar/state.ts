/**
 * OAuth state token (CSRF defense) — mesmo mecanismo de `lib/nuvemshop/state.ts`,
 * duplicado aqui porque carrega um campo a mais (`resourceId`, já que a conexão do
 * Google Agenda é por recurso, não só por org — spec 18 §2.7) e mexer no módulo do
 * Nuvemshop pra generalizar arriscaria uma integração já em produção sem necessidade.
 *
 * Formato: base64url(`${orgId}.${resourceId}.${nonce}.${expMs}`) + "." + hex(HMAC-SHA256).
 * `resourceId` vazio = conexão padrão da organização (resource_id null na tabela).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60 * 1000; // 10 min

let fallbackKey: string | null = null;

function key(): string {
  const secret = process.env.INTERNAL_SECRET || "";
  if (secret.length >= 16) return secret;
  if (!fallbackKey) fallbackKey = randomBytes(32).toString("hex");
  return fallbackKey;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function issueState(orgId: string, resourceId: string | null): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + TTL_MS;
  const payload = `${orgId}.${resourceId ?? ""}.${nonce}.${exp}`;
  const sig = createHmac("sha256", key()).update(payload, "utf8").digest("hex");
  return `${b64urlEncode(payload)}.${sig}`;
}

export interface VerifiedState {
  orgId: string;
  resourceId: string | null;
  nonce: string;
  expMs: number;
}

export function verifyState(token: string | null | undefined): VerifiedState | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, sigHex] = parts;
  if (!encodedPayload || !sigHex) return null;

  let payload: string;
  try {
    payload = b64urlDecode(encodedPayload);
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", key()).update(payload, "utf8").digest();
  let receivedSig: Buffer;
  try {
    receivedSig = Buffer.from(sigHex, "hex");
  } catch {
    return null;
  }
  if (receivedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(receivedSig, expectedSig)) return null;

  const segments = payload.split(".");
  if (segments.length !== 4) return null;
  const [orgId, resourceIdRaw, nonce, expStr] = segments;
  const expMs = Number(expStr);
  if (!orgId || !nonce || !Number.isFinite(expMs)) return null;
  if (Date.now() > expMs) return null;

  return { orgId, resourceId: resourceIdRaw || null, nonce, expMs };
}
