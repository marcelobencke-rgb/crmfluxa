"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CaretDown, Plus, PencilSimple, Archive, Gear } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditarFunil, useCriarFunil, useArquivarFunil } from "@/hooks/pipelines/usePipelines";

export interface PipelineItem {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
}

interface PipelineSelectorProps {
  currentPipelineId: string;
  currentPipelineName: string;
  pipelines: PipelineItem[];
  podeGerenciar: boolean;
}

export function PipelineSelector({
  currentPipelineId,
  currentPipelineName,
  pipelines,
  podeGerenciar,
}: PipelineSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(currentPipelineName);
  
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  
  const [archiveOpen, setArchiveOpen] = useState(false);

  const editar = useEditarFunil();
  const criar = useCriarFunil();
  const arquivar = useArquivarFunil();
  
  const handleSelect = (id: string) => {
    setOpen(false);
    if (id !== currentPipelineId) {
      router.push(`/app/pipelines/${id}`);
    }
  };

  const handleMakeDefault = (id: string) => {
    editar.mutate(
      { id, patch: { is_default: true } },
      {
        onSuccess: () => toast.success("Funil definido como padrão"),
        onError: () => toast.error("Erro ao definir como padrão"),
      }
    );
  };

  const handleRename = () => {
    if (!newName.trim()) return;
    editar.mutate(
      { id: currentPipelineId, patch: { name: newName } },
      {
        onSuccess: () => {
          toast.success("Funil renomeado com sucesso");
          setRenameOpen(false);
        },
        onError: () => toast.error("Erro ao renomear funil"),
      }
    );
  };

  const handleCreate = () => {
    if (!createName.trim()) return;
    criar.mutate(createName, {
      onSuccess: (r) => {
        toast.success("Funil criado com sucesso");
        setCreateOpen(false);
        setCreateName("");
        // A mutation já invalida a página e redireciona (ou a gente poderia fazer router.push para o novo)
        const novoId = r.data.pipelines[r.data.pipelines.length - 1].id;
        router.push(`/app/pipelines/${novoId}`);
      },
      onError: () => toast.error("Erro ao criar funil"),
    });
  };

  const handleArchive = (definitivo: boolean) => {
    arquivar.mutate(
      { id: currentPipelineId, definitivo },
      {
        onSuccess: () => {
          toast.success(definitivo ? "Funil excluído" : "Funil arquivado");
          setArchiveOpen(false);
          // Redireciona para o kanban base (que vai buscar o padrão)
          router.push("/app/pipelines");
        },
        onError: (e) => toast.error(`Erro: ${(e as any).message || "Falha ao arquivar"}`),
      }
    );
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 text-2xl font-semibold tracking-tight h-auto px-2 py-1 -ml-2 hover:bg-accent hover:text-accent-foreground">
            {currentPipelineName}
            <CaretDown size={20} className="opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[300px]">
          <DropdownMenuLabel>Alternar Funil</DropdownMenuLabel>
          
          {pipelines.map((p) => (
            <div key={p.id} className="flex items-center justify-between group">
              <DropdownMenuItem 
                onClick={() => handleSelect(p.id)}
                className="flex-1 cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs opacity-70">/{p.slug}</span>
                </div>
                {p.id === currentPipelineId && (
                  <Check size={16} className="ml-auto text-primary" />
                )}
              </DropdownMenuItem>
              
              {podeGerenciar && !p.is_default && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 mr-2"
                  onClick={() => handleMakeDefault(p.id)}
                  title="Tornar padrão"
                >
                  <Check size={14} />
                </Button>
              )}
              {p.is_default && (
                <span className="text-[10px] uppercase font-bold text-muted-foreground mr-3">
                  Padrão
                </span>
              )}
            </div>
          ))}

          {podeGerenciar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setOpen(false); setCreateOpen(true); }} className="cursor-pointer">
                <Plus size={16} className="mr-2" />
                Criar Novo Funil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setOpen(false); setRenameOpen(true); }} className="cursor-pointer">
                <PencilSimple size={16} className="mr-2" />
                Renomear Funil Atual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setOpen(false); setArchiveOpen(true); }} className="cursor-pointer text-destructive focus:text-destructive">
                <Archive size={16} className="mr-2" />
                Arquivar Funil Atual
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/app/settings/tenant/pipelines")} className="cursor-pointer">
                <Gear size={16} className="mr-2" />
                Configurar Funis (Etapas, etc)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Funil</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="Novo nome" 
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename} disabled={!newName.trim() || editar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Funil</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={createName} 
              onChange={(e) => setCreateName(e.target.value)} 
              placeholder="Nome do novo funil" 
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!createName.trim() || criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar Funil</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm">
              Arquivar «{currentPipelineName}»? Ele sai desta lista e para de receber negócio novo. O
              histórico continua guardado, e nada é apagado.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleArchive(true)} disabled={arquivar.isPending}>Excluir de vez</Button>
            <Button variant="destructive" onClick={() => handleArchive(false)} disabled={arquivar.isPending}>Arquivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
