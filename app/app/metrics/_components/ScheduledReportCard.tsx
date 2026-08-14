"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateScheduledReport } from "@/app/actions/metrics/updateScheduledReport";
import {
  scheduledReportSchema,
  type ReportFrequency,
  type ScheduledReportInput,
} from "@/lib/schemas/settings";

/**
 * Só renderizada pra admin (gate no page.tsx) — dado do negócio inteiro saindo
 * por email é decisão de admin, não de manager.
 */
export function ScheduledReportCard({ initial }: { initial: ScheduledReportInput }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [frequency, setFrequency] = useState<ReportFrequency>(initial.frequency);
  const [recipientsText, setRecipientsText] = useState(initial.recipients.join(", "));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const recipients = recipientsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const candidate = { enabled, frequency, recipients };
    const parsed = scheduledReportSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error("Revise os emails informados.");
      return;
    }
    startTransition(async () => {
      const r = await updateScheduledReport(parsed.data);
      if (r.ok) toast.success("Relatório atualizado.");
      else toast.error(`Erro: ${r.error}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Relatório por email</CardTitle>
        <CardDescription>
          Envia um resumo de funil e performance por email, periodicamente — pra quem quer levar
          os números pra uma reunião sem copiar da tela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="scheduled-report-enabled">Enviar relatório periódico</Label>
          <Switch id="scheduled-report-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="scheduled-report-frequency">Frequência</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as ReportFrequency)}
              >
                <SelectTrigger id="scheduled-report-frequency" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal (toda segunda)</SelectItem>
                  <SelectItem value="monthly">Mensal (dia 1)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled-report-recipients">
                Destinatários (separados por vírgula)
              </Label>
              <Input
                id="scheduled-report-recipients"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                placeholder="voce@empresa.com, socio@empresa.com"
              />
              <p className="text-xs text-muted-foreground">
                Não precisam ter conta no CRM — qualquer email recebe.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
