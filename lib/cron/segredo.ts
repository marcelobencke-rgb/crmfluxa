/**
 * A chamada de cron veio de quem tem o segredo?
 *
 * Existe porque `comBatimento` precisa da resposta ANTES de gravar batimento, e
 * a lógica estava copiada dentro de cada uma das 16 rotas — nenhuma delas
 * exportando nada que desse para reusar.
 *
 * ⚠️ ESTA FUNÇÃO NÃO É O GATE DE AUTORIZAÇÃO. Cada rota continua fazendo a
 * própria checagem e devolvendo o próprio 403; aqui só se decide se o batimento
 * conta. Trocar o gate das rotas por esta chamada seria mudança de segurança
 * disfarçada de refatoração, e não é o que este commit faz.
 *
 * Comparação em tempo constante, como `/api/v1/health` já fazia — as 16 rotas
 * usam `accepted.includes(provided)`, que compara caractere a caractere e para
 * no primeiro diferente. É dívida conhecida e vive fora do escopo deste arquivo;
 * o que não se faz é copiar a versão fraca para dentro de código novo.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export function segredoDeCronConfere(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const fornecido = bearer || (req.headers.get("x-cron-secret")?.trim() ?? "");
  if (!fornecido) return false;

  // `.filter(Boolean)` primeiro: segredo VAZIO nunca pode virar credencial
  // válida — sem isso, uma instalação sem `INTERNAL_CRON_SECRET` aceitaria
  // qualquer requisição que também mandasse vazio.
  const aceitos = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean) as string[];
  return aceitos.some((esperado) => {
    const a = Buffer.from(fornecido);
    const b = Buffer.from(esperado);
    // timingSafeEqual LANÇA se os tamanhos diferirem.
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
