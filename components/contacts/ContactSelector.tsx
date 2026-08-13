"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, CaretDown, MagnifyingGlass } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useContactList } from "@/hooks/contacts/useContactList";

interface ContactSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function ContactSelector({ value, onChange }: ContactSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading } = useContactList({ search: debouncedSearch });
  const contacts = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Se o valor estiver setado, tentar encontrar o contato na lista atual,
  // ou mostrar algo genérico se não estiver na lista carregada
  const selectedContact = contacts.find((c) => c.id === value);
  const displayLabel = selectedContact
    ? selectedContact.name || selectedContact.email || selectedContact.phone_number || "Contato sem nome"
    : value
      ? "Contato selecionado"
      : "Selecione o contato (Opcional)...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-left"
        >
          <span className="truncate">{displayLabel}</span>
          <CaretDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <MagnifyingGlass className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Buscar contato..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {isLoading ? (
              <div className="p-2 text-center text-sm text-muted-foreground">
                Buscando...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-2 text-center text-sm text-muted-foreground">
                Nenhum contato encontrado.
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    !value ? "bg-accent/50" : ""
                  )}
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate font-medium italic">Nenhum</span>
                </div>
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className={cn(
                      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                      value === contact.id ? "bg-accent/50" : ""
                    )}
                    onClick={() => {
                      onChange(contact.id === value ? null : contact.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === contact.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col truncate">
                      <span className="truncate font-medium">
                        {contact.name || "Sem nome"}
                      </span>
                      {(contact.email || contact.phone_number) && (
                        <span className="text-xs text-muted-foreground truncate">
                          {contact.email || contact.phone_number}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
