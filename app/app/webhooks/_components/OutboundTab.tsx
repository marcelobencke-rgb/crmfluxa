"use client";
import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, PaperPlaneTilt } from "@/lib/ui/icons";

export function OutboundTab() {
  return (
    <div className="pt-4 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <PaperPlaneTilt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Enviar dados via Webhook</CardTitle>
              <CardDescription>Dispare eventos para outros sistemas usando Automações.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            No Fluxa CRM, o envio de dados para sistemas externos (Outbound Webhooks) é gerenciado pelo nosso motor de <strong>Automações</strong>. Isso oferece a você controle total sobre <em>quando</em> e <em>quais</em> dados devem ser enviados.
          </p>
          <p>
            Para enviar dados:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Acesse o menu de <strong>Automações</strong>.</li>
            <li>Crie uma nova regra e escolha um <strong>Gatilho</strong> (ex: Lead criado, Etapa alterada).</li>
            <li>Adicione a ação <strong>Chamar Webhook</strong> e insira a URL de destino do seu sistema ou integrador (Make, Zapier, n8n, etc).</li>
          </ul>
          <div className="pt-4">
            <Button asChild>
              <Link href="/app/automations">
                Ir para Automações <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
