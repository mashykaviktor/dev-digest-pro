import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import perfMessages from "../../../../../messages/en/agentPerformance.json";

const RANGE = { from: "2026-08-24T00:00:00.000Z", to: "2026-09-23T00:00:00.000Z" };

let PERF: AgentPerf = {
  summary: { runs: 0, total_cost_usd: null, avg_accept_rate: null, most_active_agent: null, range_days: 30, range: RANGE },
  agents: [],
  cost_by_agent: [],
  cost_by_model: [],
};
let LOADING = false;
let IS_ERROR = false;
const REFETCH = vi.fn();

vi.mock("@/lib/hooks/agent-performance", () => ({
  useAgentPerformance: () => ({ data: PERF, isLoading: LOADING, isError: IS_ERROR, refetch: REFETCH }),
  // `PerfRangePicker` (a real, unmocked component) imports this helper from
  // the same module — the mock above replaces the whole module, so it must
  // be re-provided here too.
  isCustomPerfRange: (v: unknown) => !!v && typeof v === "object" && "from" in (v as object),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// specs/16-agent-performance-dashboard.md step 8 — the selected range is
// mirrored into the URL query string, via `useRouter`/`useSearchParams`.
// `replace` is hoisted (not a fresh `vi.fn()` per render) so tests can
// assert on what it was called with.
const ROUTER_REPLACE = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: ROUTER_REPLACE }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AgentPerfView } from "./AgentPerfView";

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
    cost_by_source: { provider: 1.2, estimated: null, unknown: null },
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  LOADING = false;
  IS_ERROR = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agentPerformance: perfMessages }}>{ui}</NextIntlClientProvider>);
}

describe("AgentPerfView", () => {
  it("renders no figures when no agent run exists in range (AC-47)", () => {
    PERF = { summary: { runs: 0, total_cost_usd: null, avg_accept_rate: null, most_active_agent: null, range_days: 30, range: RANGE }, agents: [], cost_by_agent: [], cost_by_model: [] };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.empty.title)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("presents total runs, total cost and most-active agent with its count (AC-41)", () => {
    // total_cost_usd (tile) intentionally differs from the single agent's
    // avg_cost_usd (table cell) so the two don't collide in the same assertion.
    PERF = {
      summary: { runs: 10, total_cost_usd: 3.4, avg_accept_rate: 0.75, most_active_agent: "Security", range_days: 30, range: RANGE },
      agents: [row({ total_cost_usd: 1.2, avg_cost_usd: 0.12 })],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.summary.totalRuns)).toBeInTheDocument();
    expect(screen.getByText("$3.40")).toBeInTheDocument();
    expect(screen.getAllByText("Security").length).toBeGreaterThan(0);
  });

  it("shows a not-applicable accept rate (never 0%) for a CI-only agent, plus the explanatory note (AC-46)", () => {
    PERF = {
      summary: { runs: 5, total_cost_usd: 0.5, avg_accept_rate: null, most_active_agent: "CI Bot", range_days: 30, range: RANGE },
      agents: [
        row({
          agent_id: "a2",
          agent_name: "CI Bot",
          runs_local: 0,
          runs_ci: 5,
          accept_rate: null,
          accepted: 0,
          dismissed: 0,
          decisions: 0,
        }),
      ],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getAllByText(perfMessages.notApplicable).length).toBeGreaterThan(0);
    expect(screen.getByText(perfMessages.ciOnlyNote)).toBeInTheDocument();
  });

  it("switching the range preset changes the requested range and mirrors it into the URL (AC-43, plan step 8)", () => {
    PERF = { summary: { runs: 3, total_cost_usd: 0.1, avg_accept_rate: 0.5, most_active_agent: "Security", range_days: 30, range: RANGE }, agents: [row({})], cost_by_agent: [], cost_by_model: [] };
    renderWithIntl(<AgentPerfView />);
    const sevenDayBtn = screen.getByRole("radio", { name: "7 days" });
    fireEvent.click(sevenDayBtn);
    expect(sevenDayBtn).toHaveAttribute("aria-checked", "true");
    expect(ROUTER_REPLACE).toHaveBeenCalledWith(expect.stringContaining("range_days=7"));
  });

  it("shows the error state with a retry action when the fetch fails (AC-6's error path)", () => {
    IS_ERROR = true;
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(perfMessages.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(REFETCH).toHaveBeenCalledTimes(1);
  });

  it("renders the cost-provenance line when at least one bucket is known (AC-7)", () => {
    PERF = {
      summary: { runs: 4, total_cost_usd: 2.5, avg_accept_rate: 0.5, most_active_agent: "Security", range_days: 30, range: RANGE },
      agents: [row({ cost_by_source: { provider: 2.5, estimated: null, unknown: null } })],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.cost.reconciled.replace("{amount}", "$2.50"))).toBeInTheDocument();
  });

  it("a server-synthesized zero-run row shows N/A markers and, expanded, its accepted/dismissed/pending detail (AC-4)", () => {
    PERF = {
      summary: { runs: 3, total_cost_usd: 0.1, avg_accept_rate: 0.5, most_active_agent: "Security", range_days: 30, range: RANGE },
      agents: [
        row({
          agent_id: "a3",
          agent_name: "Idle Agent",
          runs: 0,
          runs_local: 0,
          runs_ci: 0,
          accepted: 0,
          dismissed: 0,
          pending: 0,
          decisions: 0,
          accept_rate: null,
          avg_cost_usd: null,
          avg_latency_ms: null,
          cost_by_source: { provider: null, estimated: null, unknown: null },
        }),
      ],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.table.noRunsInPeriod)).toBeInTheDocument();

    const expandBtn = screen.getByRole("button", { name: perfMessages.table.expand.replace("{name}", "Idle Agent") });
    fireEvent.click(expandBtn);

    expect(expandBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(perfMessages.table.accepted)).toBeInTheDocument();
    expect(screen.getByText(perfMessages.table.pending)).toBeInTheDocument();
    // cost_by_source is entirely null — must fall back to N/A, never a fabricated "$0.00 reconciled" line.
    expect(screen.getAllByText(perfMessages.notApplicable).length).toBeGreaterThan(0);
  });

  it("marks a low-sample agent's accept rate with the low-sample chip (clarification #2)", () => {
    PERF = {
      summary: { runs: 19, total_cost_usd: 0.1, avg_accept_rate: 0.5, most_active_agent: "Security", range_days: 30, range: RANGE },
      agents: [row({ decisions: 19, low_sample: true })],
      cost_by_agent: [],
      cost_by_model: [],
    };
    renderWithIntl(<AgentPerfView />);
    expect(screen.getByText(perfMessages.table.lowSample)).toBeInTheDocument();
  });

  it("renders the D4 loading skeleton (4 tiles + table area + 2 cards) while isLoading", () => {
    LOADING = true;
    PERF = { summary: { runs: 0, total_cost_usd: null, avg_accept_rate: null, most_active_agent: null, range_days: 30, range: RANGE }, agents: [], cost_by_agent: [], cost_by_model: [] };
    const { container } = renderWithIntl(<AgentPerfView />);
    expect(container.querySelectorAll(".skeleton").length).toBe(7);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(perfMessages.empty.title)).not.toBeInTheDocument();
  });
});
