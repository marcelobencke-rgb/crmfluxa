"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { ShieldCheck, PencilSimple, CaretLeft, LockOpen } from "@/lib/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useContact } from "@/hooks/contacts/useContact";
import { useUnblockContact } from "@/hooks/contacts/useUnblockContact";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useContactFieldDefs } from "@/hooks/contacts/useContactFieldDefs";
import { ROLE_RANK } from "@/lib/auth/types";
import { TimelineView } from "@/components/contacts/TimelineView";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { AnonymizeDialog } from "@/components/contacts/AnonymizeDialog";
import { PropostasDeDado } from "@/components/contacts/PropostasDeDado";
import { ConversaNoDossie } from "@/components/kanban/ConversaNoDossie";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { DialButton } from "@/components/voice/DialButton";

interface Props {
  contactId: string;
}

export function ContactDetailClient({ contactId }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const q = useContact(contactId);
  const { user, activeOrg } = useAuth();
  // As DEFINIÇÕES moram em `organizations.settings.contact_fields` — próprias
  // do contato, não do funil padrão. Ver `lib/contacts/campos-personalizados.ts`.
  const fieldDefsQuery = useContactFieldDefs(Boolean(activeOrg));
  const [editOpen, setEditOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const unblock = useUnblockContact(contactId);

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-sm text-error-fg">{t("Erro ao carregar contato.")}</Card>
      </div>
    );
  }

  const contact = q.data.data;
  const isAdmin =
    (user.is_platform_admin && !user.support) || (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);

  // Uma decisão, um lugar (lib/contacts/rotulo-do-contato.ts). Esta tela era
  // uma das DUAS que ignoravam o telefone: contato com número e sem nome
  // aparecia como "Sem nome" aqui e com o número no inbox.
  const displayName = rotuloDoContato(contact, t);

  async function confirmarDesbloqueio() {
    try {
      await unblock.mutateAsync();
      toast.success(t("Contato desbloqueado."));
      setUnblockOpen(false);
    } catch {
      // hook já mostra o toast de erro
    }
  }

  return (
    <div className="space-y-4 p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1 text-muted-foreground">
        <Link href="/app/contacts">
          <CaretLeft size={14} aria-hidden />
          {t("Contatos")}
        </Link>
      </Button>

      {contact.is_anonymized && (
        <div
          role="alert"
          className="border-error-fg/30 sticky top-0 z-20 flex items-center gap-3 rounded-md border bg-error-bg p-3 text-sm text-error-fg"
        >
          <ShieldCheck size={18} weight="duotone" aria-hidden />
          <span>
            {t("Contato anonimizado (LGPD)")}
            {contact.anonymized_at &&
              ` em ${format(new Date(contact.anonymized_at), "dd/MM/yyyy", { locale: localeDaData })}`}
            {t(" — edição bloqueada.")}
          </span>
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {/* Sem truncar: nome é dado que a tela existe pra mostrar, e cortar
              com reticências sem um jeito de ver o resto violaria o princípio
              de nunca esconder informação crítica. Deixa quebrar linha. */}
          <h1 className="break-words text-2xl font-semibold tracking-tight">{displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {contact.email && <span>{contact.email}</span>}
            {contact.email && contact.phone_number && <span>•</span>}
            {contact.phone_number && <span>{phoneForDisplay(contact.phone_number)}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
            {contact.is_blocked && <Badge variant="warning">{t("Bloqueado")}</Badge>}
            {contact.is_anonymized && <Badge variant="destructive">{t("Anonimizado")}</Badge>}
          </div>
        </div>
        {!contact.is_anonymized && user.support?.access_mode !== "support_readonly" && (
          <div className="flex shrink-0 items-center gap-2">
            <DialButton contactId={contactId} hasPhone={!!contact.phone_number} />
            {contact.is_blocked && (
              <Button variant="outline" onClick={() => setUnblockOpen(true)} className="shrink-0">
                <LockOpen size={16} weight="bold" aria-hidden />
                <span>{t("Desbloquear")}</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0">
              <PencilSimple size={16} weight="bold" aria-hidden />
              <span>{t("Editar")}</span>
            </Button>
          </div>
        )}
      </header>

      <ConversaNoDossie conversa={contact.conversa} />

      {/* ANTES das abas, e não dentro de uma delas: é o único conteúdo desta
          tela que PEDE uma ação. Enterrado numa aba, viraria pendência que só
          quem já sabe que existe encontra — e a fila deixaria de ser fila.
          Some sozinho quando não há nada aguardando. */}
      {!contact.is_anonymized && user.support?.access_mode !== "support_readonly" && (
        <PropostasDeDado
          contactId={contactId}
          podeDecidir={Boolean(activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent)}
          aoDecidir={() => void q.refetch()}
        />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("Visão geral")}</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          {isAdmin && <TabsTrigger value="lgpd">LGPD</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-4">
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Nome")}</dt>
                <dd className="mt-1">{contact.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Display name</dt>
                <dd className="mt-1">{contact.display_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Email</dt>
                <dd className="mt-1">{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Telefone")}</dt>
                <dd className="mt-1">
                  {contact.phone_number ? phoneForDisplay(contact.phone_number) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Site")}</dt>
                <dd className="mt-1 break-words">{contact.website ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Instagram</dt>
                <dd className="mt-1 break-words">{contact.instagram ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Facebook</dt>
                <dd className="mt-1 break-words">{contact.facebook ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Origem")}</dt>
                <dd className="mt-1">{contact.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Última atividade")}</dt>
                <dd className="mt-1">
                  {contact.last_activity_at
                    ? format(new Date(contact.last_activity_at), "dd/MM/yyyy HH:mm", {
                        locale: localeDaData,
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Criado em")}</dt>
                <dd className="mt-1">
                  {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: localeDaData })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tags</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {contact.tags.length === 0
                    ? "—"
                    : contact.tags.map((t) => (
                        <Badge key={t} variant="neutral">
                          {t}
                        </Badge>
                      ))}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase text-muted-foreground">{t("Observações")}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words">{contact.notes ?? "—"}</dd>
              </div>
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView contactId={contactId} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="lgpd" className="mt-4">
            <Card className="space-y-4 p-4">
              <div>
                <h2 className="text-lg font-semibold">{t("Direito ao esquecimento (LGPD)")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "A anonimização é irreversível. Use somente após confirmação formal do titular ou ordem judicial.",
                  )}
                </p>
              </div>
              {contact.is_anonymized ? (
                <p className="text-sm text-muted-foreground">
                  {t("Este contato já foi anonimizado")}
                  {contact.anonymized_at &&
                    ` em ${format(new Date(contact.anonymized_at), "dd/MM/yyyy HH:mm", { locale: localeDaData })}`}
                  .
                </p>
              ) : (
                <Button variant="destructive" onClick={() => setAnonOpen(true)}>
                  {t("Anonimizar contato")}
                </Button>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <EditContactDialog
        contact={contact}
        open={editOpen}
        onOpenChange={setEditOpen}
        customFieldDefs={fieldDefsQuery.data ?? []}
      />
      <AnonymizeDialog contactId={contactId} open={anonOpen} onOpenChange={setAnonOpen} />

      <AlertDialog open={unblockOpen} onOpenChange={(open) => { if (!open) setUnblockOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Desbloquear contato?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Este contato pediu para não receber mais mensagens (palavra de cancelamento detectada",
              )}
              {contact.blocked_at &&
                ` ${t("em")} ${format(new Date(contact.blocked_at), "dd/MM/yyyy HH:mm", { locale: localeDaData })}`}
              {t(
                "). Desbloquear volta a habilitar mensagem automática e campanha pra ele — confirme só se tiver certeza de que foi engano ou de que a pessoa pediu pra voltar.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblock.isPending}>{t("Cancelar")}</AlertDialogCancel>
            <Button onClick={() => void confirmarDesbloqueio()} disabled={unblock.isPending}>
              {unblock.isPending ? t("Desbloqueando…") : t("Desbloquear")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
