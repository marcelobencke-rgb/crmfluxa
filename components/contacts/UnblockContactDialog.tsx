"use client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUnblockContact } from "@/hooks/contacts/useUnblockContact";

interface Props {
  contactId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UnblockContactDialog({ contactId, open, onOpenChange }: Props) {
  const unblock = useUnblockContact();

  async function handleConfirm() {
    try {
      const res = await unblock.mutateAsync(contactId);
      toast.success(
        res.data.already_unblocked ? "Contato já estava desbloqueado." : "Contato desbloqueado.",
      );
      onOpenChange(false);
    } catch {
      // hook já disparou o toast de erro
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desbloquear contato</DialogTitle>
          <DialogDescription>
            Este contato foi bloqueado automaticamente porque uma mensagem dele foi
            reconhecida como pedido de descadastro (STOP/PARAR/SAIR/UNSUBSCRIBE). Desbloquear
            volta a permitir envios automatizados (campanhas, IA, follow-up) — use só se tiver
            certeza de que não foi um pedido de descadastro de verdade.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={unblock.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={unblock.isPending}>
            {unblock.isPending ? "Desbloqueando…" : "Desbloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
