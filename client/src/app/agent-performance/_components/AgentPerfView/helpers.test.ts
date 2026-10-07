import { describe, it, expect } from "vitest";
import type { AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import {
  parseRangeFromSearchParams,
  rangeToSearchParams,
  sortAgents,
  totalCostBySource,
  totalCostDelta,
  totalTrend,
} from "./helpers";
import { DEFAULT_RANGE } from "./constants";

function row(overrides: Partial<AgentPerfRow>): AgentPerfRow {
  return {
    agent_id: "a1",
    agent_name: "Security",
    provider: "openrouter",
    model: "gpt-4.1",
    runs: 10,
    runs_local: 10,
    runs_ci: 0,
    counted_runs: 10,
    costed_runs: 10,
    findings_total: 20,
    accepted: 6,
    dismissed: 2,
    pending: 0,
    accept_rate: 0.75,
    dismiss_rate: 0.25,
    avg_findings_per_run: 2,
    total_cost_usd: 1.2,
    avg_cost_usd: 0.12,
    avg_latency_ms: 8000,
    cost_by_source: { provider: null, estimated: null, unknown: null },
    last_run_at: new Date().toISOString(),
    findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
    trend: [1, 2, 3],
    decisions: 8,
    low_sample: false,
    runs_delta: null,
    accept_rate_delta: null,
    cost_delta: null,
    ...overrides,
  };
}

describe("sortAgents", () => {
  it("sorts a low_sample agent last regardless of direction, even when its accept_rate is highest", () => {
    const full = row({ agent_id: "full", accept_rate: 0.5, low_sample: false });
    const low = row({ agent_id: "low", accept_rate: 0.99, low_sample: true });

    expect(sortAgents([low, full], "accept_rate", "desc").map((r) => r.agent_id)).toEqual(["full", "low"]);
    expect(sortAgents([low, full], "accept_rate", "asc").map((r) => r.agent_id)).toEqual(["full", "low"]);
  });

  it("sorts a null accept_rate last regardless of direction", () => {
    const known = row({ agent_id: "known", accept_rate: 0.1, low_sample: false });
    const unknown = row({ agent_id: "unknown", accept_rate: null, low_sample: false });

    expect(sortAgents([unknown, known], "accept_rate", "desc").map((r) => r.agent_id)).toEqual(["known", "unknown"]);
    expect(sortAgents([unknown, known], "accept_rate", "asc").map((r) => r.agent_id)).toEqual(["known", "unknown"]);
  });

  it("sorts a numeric field (runs) ascending/descending", () => {
    const a = row({ agent_id: "a", runs: 3 });
    const b = row({ agent_id: "b", runs: 9 });

    expect(sortAgents([a, b], "runs", "asc").map((r) => r.agent_id)).toEqual(["a", "b"]);
    expect(sortAgents([a, b], "runs", "desc").map((r) => r.agent_id)).toEqual(["b", "a"]);
  });

  it("sorts total_cost_usd, with null trailing regardless of direction", () => {
    const cheap = row({ agent_id: "cheap", total_cost_usd: 1 });
    const pricey = row({ agent_id: "pricey", total_cost_usd: 5 });
    const unknown = row({ agent_id: "unknown", total_cost_usd: null });

    expect(sortAgents([unknown, pricey, cheap], "total_cost_usd", "asc").map((r) => r.agent_id)).toEqual([
      "cheap",
      "pricey",
      "unknown",
    ]);
  });
});

describe("totalTrend", () => {
  it("sums per-agent trend arrays index-wise", () => {
    const rows = [row({ trend: [1, 2, 3] }), row({ trend: [10, 20, 30] })];
    expect(totalTrend(rows)).toEqual([11, 22, 33]);
  });

  it("returns an empty array for no agents", () => {
    expect(totalTrend([])).toEqual([]);
  });
});

describe("totalCostDelta", () => {
  it("sums only agents with a known cost_delta, skipping null", () => {
    const rows = [row({ cost_delta: 1.5 }), row({ cost_delta: null }), row({ cost_delta: 2.5 })];
    expect(totalCostDelta(rows)).toBe(4);
  });

  it("is null (not a fabricated 0) when no agent has a known delta", () => {
    const rows = [row({ cost_delta: null }), row({ cost_delta: null })];
    expect(totalCostDelta(rows)).toBeNull();
  });
});

describe("totalCostBySource", () => {
  it("sums each bucket independently across agents, null-is-not-zero per bucket", () => {
    const rows = [
      row({ cost_by_source: { provider: 1, estimated: null, unknown: null } }),
      row({ cost_by_source: { provider: 2, estimated: 0.5, unknown: null } }),
    ];
    expect(totalCostBySource(rows)).toEqual({ provider: 3, estimated: 0.5, unknown: null });
  });

  it("all buckets stay null when no agent has ever contributed to any of them", () => {
    const rows = [row({ cost_by_source: { provider: null, estimated: null, unknown: null } })];
    expect(totalCostBySource(rows)).toEqual({ provider: null, estimated: null, unknown: null });
  });
});

describe("parseRangeFromSearchParams", () => {
  it("prefers a from/to pair over range_days", () => {
    const sp = new URLSearchParams({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-08T00:00:00.000Z", range_days: "90" });
    expect(parseRangeFromSearchParams(sp)).toEqual({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-08T00:00:00.000Z" });
  });

  it("falls back to a valid range_days preset", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams({ range_days: "7" }))).toEqual({ days: 7 });
  });

  it("falls back to DEFAULT_RANGE for missing/invalid query params", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams())).toEqual(DEFAULT_RANGE);
    expect(parseRangeFromSearchParams(new URLSearchParams({ range_days: "not-a-number" }))).toEqual(DEFAULT_RANGE);
  });
});

describe("rangeToSearchParams", () => {
  it("writes a preset as range_days", () => {
    expect(rangeToSearchParams({ days: 30 }).toString()).toBe("range_days=30");
  });

  it("writes a custom range as from/to", () => {
    const sp = rangeToSearchParams({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-08T00:00:00.000Z" });
    expect(sp.get("from")).toBe("2026-01-01T00:00:00.000Z");
    expect(sp.get("to")).toBe("2026-01-08T00:00:00.000Z");
  });

  it("round-trips through parseRangeFromSearchParams", () => {
    const original = { from: "2026-01-01T00:00:00.000Z", to: "2026-01-08T00:00:00.000Z" };
    expect(parseRangeFromSearchParams(rangeToSearchParams(original))).toEqual(original);
  });
});
