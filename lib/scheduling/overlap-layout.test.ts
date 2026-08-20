import { describe, it, expect } from "vitest";
import { layoutOverlaps, type OverlapLayout } from "./overlap-layout";

function byId(result: OverlapLayout[]): (id: string) => OverlapLayout {
  const map = new Map(result.map((r) => [r.id, r]));
  return (id: string) => {
    const found = map.get(id);
    if (!found) throw new Error(`layout not found for id ${id}`);
    return found;
  };
}

describe("layoutOverlaps", () => {
  it("coloca eventos não sobrepostos todos na raia 0", () => {
    const result = layoutOverlaps([
      { id: "a", starts_at: "2026-08-19T12:00:00Z", ends_at: "2026-08-19T13:00:00Z" },
      { id: "b", starts_at: "2026-08-19T14:00:00Z", ends_at: "2026-08-19T15:00:00Z" },
    ]);
    const at = byId(result);
    expect(at("a")).toEqual({ id: "a", lane: 0, laneCount: 1 });
    expect(at("b")).toEqual({ id: "b", lane: 0, laneCount: 1 });
  });

  it("empilha dois eventos sobrepostos em raias distintas com laneCount 2", () => {
    const result = layoutOverlaps([
      { id: "a", starts_at: "2026-08-19T12:00:00Z", ends_at: "2026-08-19T13:00:00Z" },
      { id: "b", starts_at: "2026-08-19T12:30:00Z", ends_at: "2026-08-19T13:30:00Z" },
    ]);
    const at = byId(result);
    expect(at("a").laneCount).toBe(2);
    expect(at("b").laneCount).toBe(2);
    expect(at("a").lane).not.toBe(at("b").lane);
  });

  it("fecha o cluster quando um evento começa depois do fim de todos os anteriores", () => {
    const result = layoutOverlaps([
      { id: "a", starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T10:00:00Z" },
      { id: "b", starts_at: "2026-08-19T09:30:00Z", ends_at: "2026-08-19T10:30:00Z" },
      { id: "c", starts_at: "2026-08-19T11:00:00Z", ends_at: "2026-08-19T12:00:00Z" },
    ]);
    const at = byId(result);
    expect(at("a").laneCount).toBe(2);
    expect(at("b").laneCount).toBe(2);
    expect(at("c").laneCount).toBe(1);
    expect(at("c").lane).toBe(0);
  });

  it("reutiliza uma raia liberada quando um terceiro evento sobrepõe só um dos dois primeiros", () => {
    const result = layoutOverlaps([
      { id: "a", starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T09:30:00Z" },
      { id: "b", starts_at: "2026-08-19T09:00:00Z", ends_at: "2026-08-19T10:00:00Z" },
      { id: "c", starts_at: "2026-08-19T09:45:00Z", ends_at: "2026-08-19T10:15:00Z" },
    ]);
    const at = byId(result);
    expect(at("a").lane).toBe(0);
    expect(at("b").lane).toBe(1);
    expect(at("c").lane).toBe(0);
    expect(at("a").laneCount).toBe(2);
    expect(at("c").laneCount).toBe(2);
  });
});
