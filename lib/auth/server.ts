/**
 * Server-side auth helpers — load AuthUser, resolve active org, gate routes.
 *
 * Uses the service-role admin client to read tenant-scoped tables
 * (`user_organizations`, `platform_admins`, `organizations`) — RLS bypass is
 * intentional here because we resolve the user from the validated JWT first
 * and then filter by `user_id` (a trusted source).
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { AuthUser, Role, UserOrgMembership, ActiveOrg } from "./types";

const ACTIVE_ORG_COOKIE = "active_org";

interface RawMembershipRow {
  organization_id: string;
  role: string;
  organizations: { display_name: string } | { display_name: string }[] | null;
}

/**
 * Loads the AuthUser for the current request. Returns null if unauthenticated.
 * Use only in Server Components / Route Handlers / Server Actions.
 *
 * Uses the user-scoped server client (cookie session). RLS policies allow:
 * - user_organizations: user_id = auth.uid() (user_orgs_select)
 * - organizations: id IN fn_user_org_ids()  (orgs_select)
 * - platform_admins: only platform admins read (so non-admins get null — correct)
 *
 * MEMOIZADO POR REQUEST (`cache` do React) — ver o bloco logo abaixo da função.
 */
async function carregarUsuarioAutenticado(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // AS DUAS QUERIES SÃO INDEPENDENTES — vão juntas, não em fila.
  //
  // Uma não usa o resultado da outra: as duas filtram pelo mesmo `user.id` já
  // conhecido. Em série custavam dois round-trips completos, e este é o caminho
  // de TODA rota autenticada do sistema, não só do envio de mensagem. Medido na
  // produção em 2026-08-24, uma ida ao Supabase custa ~150ms daqui — encadear
  // as duas era jogar fora 150ms em cada request que o CRM atende.
  //
  // ⚠️ O erro continua sendo capturado por query, e isso é essencial: em
  // `platform_admins`, `data: null` é AMBÍGUO — significa tanto "não é platform
  // admin" (RLS filtrou, estado normal) quanto "a query falhou". Sem separar os
  // dois, um banco instável rebaixa silenciosamente um super-admin. `Promise.all`
  // preserva isso porque cada ramo devolve seu próprio `{ data, error }`; o que
  // NÃO se pode fazer aqui é deixar uma rejeição derrubar a outra, e não deixa:
  // o client do Supabase resolve com `error` preenchido em vez de rejeitar.
  const [
    { data: paRow, error: paErro },
    { data: rawMemberships, error: membErro },
  ] = await Promise.all([
    // Platform admin? (active = no revoked_at). RLS returns null for non-admins.
    supabase
      .from("platform_admins")
      .select("user_id, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle(),
    // Org memberships (only active = not revoked, accepted)
    supabase
      .from("user_organizations")
      .select("organization_id, role, organizations(display_name)")
      .eq("user_id", user.id)
      .is("revoked_at", null),
  ]);

  /**
   * FALHA ALTO, não baixo.
   *
   * Antes, o erro destas duas queries era descartado e `rawMemberships` nulo virava
   * `[]` — ou seja, "usuário sem organização". O resultado é que uma instabilidade do
   * banco chega ao operador como **"você não pertence a nenhuma organização"**: as
   * telas de admin somem, as rotas devolvem 403, e nada indica que a causa é
   * infraestrutura.
   *
   * Medido em 2026-07-30: com o PostgREST devolvendo `name resolution failed` depois
   * de um restart do Docker, TODOS os cards de admin sumiram do hub de configurações.
   * Custou seis diagnósticos errados — build velho, processo velho, cache, filtro de
   * papel — antes de alguém olhar a causa real.
   *
   * Degradar permissão em silêncio é o pior desfecho possível num caminho de auth:
   * parece uma decisão de autorização e é um defeito de infra. Melhor estourar e
   * mostrar erro do que renderizar uma UI mentirosa.
   */
  if (paErro || membErro) {
    const detalhe = (paErro ?? membErro)!;
    logger.error("[auth] não foi possível resolver permissões do usuário", {
      user_id: user.id,
      onde: paErro ? "platform_admins" : "user_organizations",
      code: detalhe.code,
      message: detalhe.message,
    });
    throw new Error(
      `auth_permissions_unavailable: ${detalhe.message} — permissões não puderam ser ` +
        `resolvidas; a sessão NÃO foi rebaixada por decisão de autorização.`,
    );
  }

  const rows = (rawMemberships ?? []) as RawMembershipRow[];
  const memberships: UserOrgMembership[] = rows.map((row) => {
    const orgs = row.organizations;
    const name = Array.isArray(orgs) ? (orgs[0]?.display_name ?? "—") : (orgs?.display_name ?? "—");
    return {
      organization_id: row.organization_id,
      organization_name: name,
      role: row.role as Role,
    };
  });

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

  return {
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    avatar_url: avatarUrl,
    is_platform_admin: !!paRow,
    organizations: memberships,
  };
}

/**
 * UMA RESOLUÇÃO DE IDENTIDADE POR REQUEST, não uma por componente.
 *
 * `carregarUsuarioAutenticado` custa três idas à rede: o `getUser()` (que NÃO é
 * leitura de cookie — é chamada ao servidor de Auth do Supabase, ~150ms daqui,
 * medido em produção em 2026-08-24) mais as duas queries do `Promise.all`.
 *
 * O problema é que ela não é chamada uma vez. Abrir `/app/dashboard` chamava
 * `requireAuth()` no `app/app/layout.tsx` E de novo no `page.tsx` — cada um
 * refazendo as três idas, porque são árvores de render diferentes pedindo a
 * mesma resposta. Com 45 telas em `/app` chamando `requireAuth()` direto, e
 * `require-role.ts` chamando por baixo em toda rota da API, o desperdício não
 * era de uma tela: era do caminho de TODA request autenticada do sistema.
 *
 * `cache` do React resolve isso sem cache de verdade: a memoização vive dentro
 * do escopo de UM request e morre com ele. Não é `unstable_cache`, não atravessa
 * usuários, não persiste — dois requests concorrentes de pessoas diferentes têm
 * escopos separados, que é exatamente o que um caminho de auth exige. O erro
 * lançado pelo bloco "FALHA ALTO" também é memoizado, e isso é o desejado: a
 * mesma falha de banco dentro do mesmo request deve dar a mesma resposta, não
 * três tentativas com três desfechos possíveis.
 *
 * ⚠️ QUEM MUTA PERMISSÃO NÃO PODE RELER AQUI NO MESMO REQUEST. Um handler que
 * altere `user_organizations`/`platform_admins` e em seguida chame
 * `loadAuthUser()` receberia o retrato de ANTES da escrita. Medido em 2026-08-25:
 * nenhum arquivo do repo faz isso hoje — quem muta associação (`app/actions/team/`,
 * `app/api/v1/team/*`, `app/api/v1/admin/*`) usa `requireRole`/`requirePlatformAdmin`
 * ANTES da escrita e não relê depois. Se um dia precisar reler pós-escrita, chame
 * `carregarUsuarioAutenticado()` direto em vez de furar a memoização para todos.
 */
export const loadAuthUser = cache(carregarUsuarioAutenticado);

/**
 * Resolves the active organization for the current request.
 * Priority: cookie `active_org` (if member of) → first membership.
 * Returns null if user has zero memberships.
 */
export async function resolveActiveOrg(authUser: AuthUser): Promise<ActiveOrg | null> {
  if (authUser.organizations.length === 0) return null;
  const store = await cookies();
  const cookieOrg = store.get(ACTIVE_ORG_COOKIE)?.value;
  if (cookieOrg) {
    const found = authUser.organizations.find((o) => o.organization_id === cookieOrg);
    if (found) {
      return { orgId: found.organization_id, name: found.organization_name, role: found.role };
    }
  }
  const first = authUser.organizations[0];
  if (!first) return null;
  return { orgId: first.organization_id, name: first.organization_name, role: first.role };
}

/**
 * For Server Components / Server Actions in /app/(app)/* routes — guarantees
 * an authenticated user. Redirects to /login if not.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns true if the current session has at least one verified TOTP factor.
 * Use only in Server Components / Server Actions (cookie session).
 */
export async function isMfaEnrolled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return !!data?.totp?.some((f) => f.status === "verified");
}

/**
 * MFA enforcement policy: platform admins and tenant `admin` role MUST enroll.
 * `manager`/`agent`/`viewer` are optional in MVP.
 */
export function requiresMfa(role: Role | undefined, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || role === "admin";
}
