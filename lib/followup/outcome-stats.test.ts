import { describe, expect, it } from "vitest";

import { flagFlowsForReview, type FlowOutcomeStat } from "./outcome-stats";

function stat(overrides: Partial<FlowOutcomeStat> & Pick<FlowOutcomeStat, "pointer_id">): FlowOutcomeStat {
  return {
    version_id: "v1",
    flow_name: "Fluxo",
    counts: { converted: 0, replied: 0, exhausted: 0, opted_out: 0, handoff: 0, in_flight: 0 },
    total: 0,
    terminal: 0,
    conversion_rate: null,
    ...overrides,
  };
}

describe("flagFlowsForReview", () => {
  it("flow com volume terminal suficiente e conversion_rate abaixo do limiar → flagado", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 30, conversion_rate: 0.1 })];
    expect(flagFlowsForReview(flows)).toEqual(flows);
  });

  it("conversion_rate acima do limiar (default 0.15) → NÃO flagado", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 30, conversion_rate: 0.2 })];
    expect(flagFlowsForReview(flows)).toEqual([]);
  });

  it("volume terminal abaixo do mínimo (default 20) → NÃO flagado mesmo com taxa baixa (ruído estatístico)", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 5, conversion_rate: 0.0 })];
    expect(flagFlowsForReview(flows)).toEqual([]);
  });

  it("conversion_rate null (zero terminal) → NÃO flagado — nada a julgar ainda", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 0, conversion_rate: null })];
    expect(flagFlowsForReview(flows)).toEqual([]);
  });

  it("boundary: terminal EXATAMENTE no mínimo → flagado (>=, não >)", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 20, conversion_rate: 0.1 })];
    expect(flagFlowsForReview(flows)).toEqual(flows);
  });

  it("boundary: conversion_rate EXATAMENTE no limiar → NÃO flagado (<, não <=)", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 30, conversion_rate: 0.15 })];
    expect(flagFlowsForReview(flows)).toEqual([]);
  });

  it("opções customizadas sobrepõem os defaults", () => {
    const flows = [stat({ pointer_id: "p1", terminal: 8, conversion_rate: 0.3 })];
    expect(flagFlowsForReview(flows, { minTerminal: 5, maxConversionRate: 0.5 })).toEqual(flows);
  });

  it("mistura de fluxos → só os que qualificam voltam, o resto fica de fora", () => {
    const good = stat({ pointer_id: "ok", terminal: 25, conversion_rate: 0.05 });
    const lowVolume = stat({ pointer_id: "low-vol", terminal: 3, conversion_rate: 0.0 });
    const highConversion = stat({ pointer_id: "high-conv", terminal: 25, conversion_rate: 0.8 });
    expect(flagFlowsForReview([good, lowVolume, highConversion])).toEqual([good]);
  });
});
