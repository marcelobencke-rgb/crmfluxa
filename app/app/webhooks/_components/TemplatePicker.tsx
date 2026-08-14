"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "@/lib/ui/icons";
import { RULE_TEMPLATES } from "./ruleTemplates";
import type { RuleTemplate } from "./RuleEditor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: RuleTemplate) => void;
}

/**
 * Catálogo de modelos prontos — ver o porquê de cada um em ruleTemplates.ts.
 * Escolher um modelo abre o MESMO RuleEditor, pré-preenchido, como uma
 * automação NOVA (nunca edita nada existente) — quem escolhe ainda revisa e
 * completa o que depende da própria conta (funil, número, atendente) antes
 * de criar de verdade.
 */
export function TemplatePicker({ open, onOpenChange, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Começar de um modelo</DialogTitle>
          <DialogDescription>
            Escolha um ponto de partida — dá pra ajustar tudo antes de criar. Campos que dependem
            da sua conta (funil, número, atendente) ficam em branco pra você escolher.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {RULE_TEMPLATES.map((t) => (
            <Card key={t.name} className="flex flex-col justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-text">{t.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => onSelect(t)}
              >
                Usar este modelo <ArrowRight size={14} aria-hidden />
              </Button>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
