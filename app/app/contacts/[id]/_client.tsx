"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldCheck, PencilSimple } from "@/lib/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact } from "@/hooks/contacts/useContact";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { TimelineView } from "@/components/contacts/TimelineView";
import { ContactAppointmentsView } from "@/components/contacts/ContactAppointmentsView";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { AnonymizeDialog } from "@/components/contacts/AnonymizeDialog";
import { UnblockContactDialog } from "@/components/contacts/UnblockContactDialog";
import { PropostasDeDado } from "@/components/contacts/PropostasDeDado";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { origemAmigavel } from "@/lib/contacts/origem-amigavel";

interface Props {
  contactId: string;
}

export function ContactDetailClient({ contactId }: Props) {
  const q = useContact(contactId);
  const { user, activeOrg } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  // Atalho pro dossiê do lead (LeadDossier) linkar direto na aba certa em vez
  // de largar o admin na Visão geral e esperar que ele ache a aba sozinho.
  // Só honra ?tab=lgpd pra quem PODE ver a aba — ela é isAdmin-only mais
  // abaixo, e um link velho de quem perdeu o papel não pode abrir aba oculta.
  const podeVerLgpd =
    user.is_platform_admin || (!!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);
  const searchParams = useSearchParams();
  const tabInicial = podeVerLgpd && searchParams.get("tab") === "lgpd" ? "lgpd" : "overview";

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
        <Card className="p-6 text-center text-sm text-error-fg">
          Erro ao carregar contato.
        </Card>
      </div>
    );
  }

  const contact = q.data.data;
  const isAdmin = podeVerLgpd;

  // Uma decisão, um lugar (lib/contacts/rotulo-do-contato.ts). Esta tela era
  // uma das DUAS que ignoravam o telefone: contato com número e sem nome
  // aparecia como "Sem nome" aqui e com o número no inbox.
  const displayName = rotuloDoContato(contact);
  const origem = origemAmigavel(contact.source_metadata);

  return (
    <div className="space-y-4 p-6">
      {contact.is_anonymized && (
        <div
          role="alert"
          className="sticky top-0 z-20 flex items-center gap-3 rounded-md border border-error-fg/30 bg-error-bg p-3 text-sm text-error-fg"
        >
          <ShieldCheck size={18} weight="duotone" aria-hidden />
          <span>
            Contato anonimizado (LGPD)
            {contact.anonymized_at &&
              ` em ${format(new Date(contact.anonymized_at), "dd/MM/yyyy", { locale: ptBR })}`}
            {" — edição bloqueada."}
          </span>
        </div>
      )}

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {contact.email && <span>{contact.email}</span>}
            {contact.email && contact.phone_number && <span>•</span>}
            {contact.phone_number && <span>{contact.phone_number}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} variant="neutral">{t}</Badge>
            ))}
            {contact.is_blocked && (
              <span className="inline-flex items-center gap-1.5">
                <Badge variant="warning">Bloqueado</Badge>
                {isAdmin && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setUnblockOpen(true)}
                  >
                    Desbloquear
                  </button>
                )}
              </span>
            )}
            {contact.is_anonymized && <Badge variant="destructive">Anonimizado</Badge>}
          </div>
        </div>
        {!contact.is_anonymized && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <PencilSimple size={16} weight="bold" aria-hidden />
            <span>Editar</span>
          </Button>
        )}
      </header>

      {/* ANTES das abas, e não dentro de uma delas: é o único conteúdo desta
          tela que PEDE uma ação. Enterrado numa aba, viraria pendência que só
          quem já sabe que existe encontra — e a fila deixaria de ser fila.
          Some sozinho quando não há nada aguardando. */}
      {!contact.is_anonymized && (
        <PropostasDeDado
          contactId={contactId}
          podeDecidir={Boolean(activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent)}
          aoDecidir={() => void q.refetch()}
        />
      )}

      <Tabs defaultValue={tabInicial}>
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
          {isAdmin && <TabsTrigger value="lgpd">LGPD</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-4">
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Nome</dt>
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
                <dt className="text-xs uppercase text-muted-foreground">Telefone</dt>
                <dd className="mt-1">{contact.phone_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Origem</dt>
                <dd className="mt-1">
                  {contact.source}
                  {origem && <span className="text-muted-foreground"> · {origem}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Última atividade</dt>
                <dd className="mt-1">
                  {contact.last_activity_at
                    ? format(new Date(contact.last_activity_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Criado em</dt>
                <dd className="mt-1">
                  {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tags</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {contact.tags.length === 0
                    ? "—"
                    : contact.tags.map((t) => (
                        <Badge key={t} variant="neutral">{t}</Badge>
                      ))}
                </dd>
              </div>
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView contactId={contactId} />
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <ContactAppointmentsView contactId={contactId} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="lgpd" className="mt-4">
            <Card className="p-4 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Direito ao esquecimento (LGPD)</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A anonimização é irreversível. Use somente após confirmação formal
                  do titular ou ordem judicial.
                </p>
              </div>
              {contact.is_anonymized ? (
                <p className="text-sm text-muted-foreground">
                  Este contato já foi anonimizado
                  {contact.anonymized_at &&
                    ` em ${format(new Date(contact.anonymized_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
                  .
                </p>
              ) : (
                <Button variant="destructive" onClick={() => setAnonOpen(true)}>
                  Anonimizar contato
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
      />
      <AnonymizeDialog
        contactId={contactId}
        open={anonOpen}
        onOpenChange={setAnonOpen}
      />
      <UnblockContactDialog
        contactId={contactId}
        open={unblockOpen}
        onOpenChange={setUnblockOpen}
      />
    </div>
  );
}
