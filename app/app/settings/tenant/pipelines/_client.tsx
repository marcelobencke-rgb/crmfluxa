"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "@/lib/ui/icons";
import { useCriarFunil } from "@/hooks/pipelines/usePipelines";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import type { PipelineConfigPatch } from "@/lib/schemas/settings";
import { AgentMappingSection, ancoraDoMapeamento } from "./_mapping";
import { StagesSection, ancoraDasEtapas } from "./_stages";

export interface PipelineRow {
  id: string;
  name: string;
  slug: string;
  vocabulary: Record<string, string> | null;
  settings: Record<string, unknown> | null;
}

interface CustomFieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

function readFields(settings: Record<string, unknown> | null): CustomFieldDef[] {
  if (!settings) return [];
  const f = (settings as { fields?: unknown }).fields;
  return Array.isArray(f) ? (f as CustomFieldDef[]) : [];
}

function readLostReasons(settings: Record<string, unknown> | null): string[] {
  if (!settings) return [];
  const r = (settings as { lost_reasons?: unknown }).lost_reasons;
  return Array.isArray(r) ? (r as string[]) : [];
}

/**
 * Criar funil, na tela de Funis.
 *
 * Não precisa de prop de permissão: `page.tsx:26` já redireciona quem está
 * abaixo de `manager` antes de renderizar qualquer coisa — a mesma barra que o
 * `podeGerenciar` do `PipelineSelector` usa no quadro. Receber um
 * `podeGerenciar` aqui seria checar duas vezes a mesma coisa e criar a chance de
 * as duas discordarem.
 *
 * Reusa `useCriarFunil` (o mesmo hook do quadro), então não há segunda regra de
 * criação para divergir — só um segundo lugar de onde chamá-la.
 */
function CriarFunil({ rotulo }: { rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const criar = useCriarFunil();
  const router = useRouter();

  const confirmar = () => {
    if (!nome.trim()) return;
    criar.mutate(nome.trim(), {
      onSuccess: (r) => {
        toast.success("Funil criado");
        setAberto(false);
        setNome("");
        // Vai para o QUADRO do funil novo, não fica na configuração: quem acabou
        // de criar quer ver o que criou. Mesmo destino do fluxo do quadro.
        const novo = r.data.pipelines[r.data.pipelines.length - 1];
        if (novo) router.push(`/app/pipelines/${novo.id}`);
      },
      onError: () => toast.error("Erro ao criar funil"),
    });
  };

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus size={16} className="mr-2" />
        {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar novo funil</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do novo funil"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!nome.trim() || criar.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PipelinesClient({
  pipelines,
  podeEditarConfig,
}: {
  pipelines: PipelineRow[];
  /** Vocabulário/custom fields são admin (a server action recusa o resto). */
  podeEditarConfig: boolean;
}) {
  if (pipelines.length === 0) {
    // O CAMINHO EXISTE, E AGORA ELE ESTÁ AQUI.
    //
    // O texto que vivia neste bloco dizia ao usuário que criar funil "é feito
    // por quem instalou o sistema, direto no banco". Era FALSO — e o comentário
    // que o justificava ("não é feito por nenhuma tela, rota ou action deste
    // produto") também. `useCriarFunil` existe, `POST /api/v1/pipelines` existe,
    // e o `PipelineSelector` do quadro tem "Criar Novo Funil" há tempos.
    //
    // O que havia era um beco fechado, e ele começava justamente na instalação
    // nova: o `PipelineSelector` só é renderizado por `PipelinePageClient`, que
    // `app/app/pipelines/page.tsx` só monta quando `funis.length > 0`. Com zero
    // funis o quadro mostra "Criar meu primeiro funil" apontando para CÁ, e daqui
    // se mandava o usuário editar o banco. O único botão que funcionava estava
    // trancado dentro de um quadro que só existe depois de já ter o que se quer
    // criar.
    //
    // Como o instalador não provisiona funil, esse era o estado de TODA
    // instalação nova — a primeira tela que o dono do negócio abre.
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Você ainda não tem nenhum funil. Enquanto for assim, o agente atende normalmente, mas
          não tem para onde levar o card de ninguém — não há etapas para onde mover.
        </p>
        <CriarFunil rotulo="Criar meu primeiro funil" />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <CriarFunil rotulo="Novo funil" />
      </div>
      {pipelines.map((p) => (
        <Card key={p.id} className="space-y-6 p-6">
          <header>
            <h2 className="text-base font-semibold">{p.name}</h2>
            <p className="text-xs text-muted-foreground">/{p.slug}</p>
          </header>
          {/* As ETAPAS vêm primeiro, e a ordem é a do raciocínio de quem
              configura: primeiro o quadro existe do jeito da sua operação,
              depois se decide o que o assistente faz com ele. Invertido, a
              primeira coisa que o dono da clínica vê é um mapeamento sobre
              colunas de e-commerce que ele nem sabia que dava para trocar. */}
          <StagesSection pipelineId={p.id} ancoraMapeamento={ancoraDoMapeamento(p.id)} />
          <div className="border-t border-border pt-6">
            <AgentMappingSection pipelineId={p.id} ancoraEtapas={ancoraDasEtapas(p.id)} />
          </div>
          {podeEditarConfig && <PipelineEditor pipeline={p} />}
        </Card>
      ))}
    </div>
  );
}

function PipelineEditor({ pipeline }: { pipeline: PipelineRow }) {
  const v = pipeline.vocabulary ?? {};
  const [lead, setLead] = useState(v.lead ?? "Lead");
  const [deal, setDeal] = useState(v.deal ?? "Deal");
  const [won, setWon] = useState(v.won ?? "Ganho");
  const [lost, setLost] = useState(v.lost ?? "Perdido");
  const [reasonsText, setReasonsText] = useState(readLostReasons(pipeline.settings).join(", "));
  const [fieldsJson, setFieldsJson] = useState(
    JSON.stringify(readFields(pipeline.settings), null, 2),
  );
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    let fields: CustomFieldDef[] | undefined;
    try {
      const parsed = JSON.parse(fieldsJson);
      if (!Array.isArray(parsed)) throw new Error("not_array");
      fields = parsed as CustomFieldDef[];
    } catch {
      toast.error("Custom fields: JSON inválido. Esperado um array.");
      return;
    }
    const reasons = reasonsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const patch: PipelineConfigPatch = {
      vocabulary: { lead, deal, won, lost },
      fields: fields as PipelineConfigPatch["fields"],
      lost_reasons: reasons,
    };
    startTransition(async () => {
      const r = await updatePipelineConfig(pipeline.id, patch);
      if (r.ok) toast.success(`${pipeline.name} atualizado.`);
      else toast.error(`Erro: ${r.error}`);
    });
  }

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-semibold">Vocabulário e campos</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Lead</Label>
          <Input value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Deal</Label>
          <Input value={deal} onChange={(e) => setDeal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Won</Label>
          <Input value={won} onChange={(e) => setWon(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lost</Label>
          <Input value={lost} onChange={(e) => setLost(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Motivos de perda (separados por vírgula)</Label>
        <Input value={reasonsText} onChange={(e) => setReasonsText(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Custom fields (JSON array)</Label>
        <textarea
          value={fieldsJson}
          onChange={(e) => setFieldsJson(e.target.value)}
          className="min-h-32 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Ex: <code>{`[{ "key": "size", "label": "Tamanho", "type": "text" }]`}</code>
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar vocabulário e campos"}
        </Button>
      </div>
    </div>
  );
}
