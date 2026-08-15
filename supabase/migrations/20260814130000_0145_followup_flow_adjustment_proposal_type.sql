-- Fecha o loop do flywheel de follow-up: outcomes agregados por
-- lib/followup/outcome-stats.ts (flagFlowsForReview) passam a poder virar
-- proposta do distiller (lib/agent-engine/flywheel/live.ts), tipo
-- 'followup_flow_adjustment'. Diferente de playbook_bullet/org_memory_entry,
-- editar um fluxo de follow-up publicado é mudança estrutural de grafo — não
-- há "aplicação automática" segura. lib/ai/apply-proposal.ts já devolve
-- proposal_type_unsupported pra tipo desconhecido, então nenhuma mudança lá é
-- necessária: o gate humano deste tipo é "ver a evidência + link pro
-- builder", não um botão de aplicar.
alter table flywheel_distiller_proposals drop constraint if exists flywheel_distiller_proposals_type_check;
alter table flywheel_distiller_proposals add constraint flywheel_distiller_proposals_type_check
  check (type in ('playbook_bullet', 'golden_case', 'reentry_trigger', 'org_memory_entry', 'followup_flow_adjustment'));
