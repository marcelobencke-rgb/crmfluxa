/**
 * GET /api/v1/cron/storage-redaction
 *
 * Drains the LGPD `storage_redaction_queue` (one batch per call). Designed
 * to run from a scheduled cron (Vercel Cron / external cron) every few
 * minutes. Idempotent: rows transition pending → deleted | failed | skipped.
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed when
 * secret missing). Mirrors `app/api/v1/cron/kb-conversations-batch/route.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { drainStorageRedactionQueue } from "@/lib/lgpd/storage-redaction-queue";
import { comBatimento } from "@/lib/cron/com-batimento";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function getInterno(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

  const cronSecret = env.INTERNAL_CRON_SECRET;
  const fallbackSecret = env.INTERNAL_SECRET;
  const accepted: string[] = [];
  if (cronSecret) accepted.push(cronSecret);
  if (fallbackSecret) accepted.push(fallbackSecret);

  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const url = new URL(req.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const stats = await drainStorageRedactionQueue({ limit });

  return ok(stats, { requestId });
}

// Batimento de cron — ver lib/cron/com-batimento.ts. O nome vem do segmento
// da rota, que é o mesmo que o crontab do docker-compose.prod.yml escreve.
export const GET = comBatimento("storage-redaction", getInterno);
