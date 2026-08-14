"use client";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RulesTab } from "@/app/app/webhooks/_components/RulesTab";
import { ActivityTab } from "@/app/app/webhooks/_components/ActivityTab";

export function AutomationsClient() {
  const mounted = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="flex-1">
        <Skeleton className="h-9 w-[200px]" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="rules" className="flex-1">
      <TabsList>
        <TabsTrigger value="rules">Regras</TabsTrigger>
        <TabsTrigger value="activity">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="rules"><RulesTab /></TabsContent>
      <TabsContent value="activity"><ActivityTab /></TabsContent>
    </Tabs>
  );
}
