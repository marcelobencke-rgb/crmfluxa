"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { CAMPOS_DO_CARD, ROTULO_DO_CAMPO, type CampoDoCard } from "@/lib/kanban/card-fields";
import { Eye } from "@/lib/ui/icons";

interface Props {
  pipelineId: string;
  /** O que está em vigor NO QUADRO agora. */
  camposVisiveis: Set<CampoDoCard>;
  /** Cada clique chama isto — o quadro reflete na hora. */
  onPreview: (next: Set<CampoDoCard>) => void;
}

/** Junta cliques em sequência rápida numa gravação só, em vez de uma por caixinha. */
const ATRASO_MS = 400;

/**
 * "Campos do card" — ao lado de "Apenas atrasados" na barra de filtros, e não
 * dentro de Configurações: é ali que quem olha o quadro percebe que um card
 * está cheio demais (ou vazio demais) e quer ajustar na hora.
 *
 * SEM BOTÃO "SALVAR" — marcar já reflete no quadro (via `onPreview`, que o pai
 * também usa para o board) E já grava (aqui, com debounce). Um botão de salvar
 * ao lado de uma caixinha que já muda a tela sozinha é o tipo de controle que
 * ninguém aperta duas vezes sem desconfiar: ou ele confirma algo que já
 * aconteceu, ou esconde que ainda não aconteceu. Pedido explícito depois da
 * pré-visualização ao vivo entrar.
 *
 * Escreve pela MESMA action da tela de configurações (`updatePipelineConfig`),
 * que já é admin-only — reusar em vez de abrir uma segunda porta de escrita
 * para o mesmo `crm_pipelines.settings`. Quem não é admin ainda abre o
 * popover e vê a pré-visualização (é só o navegador dela, não grava em lugar
 * nenhum), mas os campos vêm desabilitados.
 */
export function CardFieldsPicker({ pipelineId, camposVisiveis, onPreview }: Props) {
  const t = useT();
  const user = useUser();
  const activeOrg = useActiveOrg();
  const podeEditar = Boolean(
    user.is_platform_admin || (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin),
  );
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function agendarGravacao(next: Set<CampoDoCard>) {
    if (temporizador.current) clearTimeout(temporizador.current);
    setSalvando(true);
    temporizador.current = setTimeout(async () => {
      const r = await updatePipelineConfig(pipelineId, { card_fields: Array.from(next) });
      setSalvando(false);
      // Falha aqui não desfaz a pré-visualização — a pessoa já viu o quadro
      // mudar, e reverter na tela por baixo dela seria mais confuso do que o
      // erro em si. O aviso é o suficiente para tentar de novo.
      if (!r.ok) toast.error(t("Erro ao salvar."));
    }, ATRASO_MS);
  }

  function alternar(campo: CampoDoCard) {
    const next = new Set(camposVisiveis);
    if (next.has(campo)) next.delete(campo);
    else next.add(campo);
    onPreview(next);
    if (podeEditar) agendarGravacao(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye size={14} className="mr-1.5" aria-hidden />
          {t("Campos do card")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-text-muted">{t("Mostrar no card")}</p>
          {salvando && <span className="text-[11px] text-text-muted">{t("Salvando…")}</span>}
        </div>
        <div className="space-y-1.5">
          {CAMPOS_DO_CARD.map((campo) => (
            <label
              key={campo}
              className={cn("flex items-center gap-2 text-sm", !podeEditar && "opacity-60")}
            >
              <input
                type="checkbox"
                checked={camposVisiveis.has(campo)}
                disabled={!podeEditar}
                onChange={() => alternar(campo)}
                className="accent-accent"
              />
              {t(ROTULO_DO_CAMPO[campo])}
            </label>
          ))}
        </div>
        {!podeEditar && (
          <p className="mt-3 text-[11px] text-text-muted">
            {t("Só quem administra o funil pode alterar isto.")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
