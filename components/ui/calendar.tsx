"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Wrapper de `react-day-picker` v10 nos tokens do produto — sem o CSS padrão
 * do pacote (`react-day-picker/style.css`, nunca importado): tudo vem do
 * `classNames`, igual ao resto da casca (accent/border/text-subtle).
 *
 * `[&>button]:...` nas chaves de estado (selected/today/outside/disabled) é
 * de propósito: o próprio DayPicker aplica essas classes na CÉLULA (`<td>`),
 * não no botão de dentro — é assim que o CSS de origem também faz
 * (`.rdp-selected .rdp-day_button`). Sem o seletor de filho, o estado nunca
 * chega no elemento que a pessoa realmente vê e clica.
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("select-none", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "space-y-3",
        month_caption: "relative flex h-9 items-center justify-center text-sm font-medium text-text",
        nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
        button_previous:
          "inline-flex size-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-accent-soft hover:text-accent disabled:pointer-events-none disabled:opacity-40",
        button_next:
          "inline-flex size-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-accent-soft hover:text-accent disabled:pointer-events-none disabled:opacity-40",
        month_grid: "w-full border-collapse",
        weekdays: "",
        weekday: "w-9 pb-2 text-center text-xs font-medium text-text-subtle",
        week: "",
        day: "p-0 text-center align-middle",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md text-sm font-normal text-text transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-soft",
        today: "[&>button]:border [&>button]:border-accent [&>button]:text-accent",
        selected:
          "[&>button]:bg-accent [&>button]:text-accent-foreground [&>button]:font-semibold [&>button]:hover:bg-accent-hover [&>button]:hover:text-accent-foreground",
        outside: "[&>button]:text-text-subtle [&>button]:opacity-60",
        disabled: "[&>button]:opacity-40 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "right" ? CaretRight : CaretLeft;
          return <Icon size={14} weight="bold" aria-hidden />;
        },
      }}
      {...props}
    />
  );
}
