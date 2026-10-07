import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MetricCard } from "./MetricCard";

afterEach(cleanup);

describe("MetricCard", () => {
  it("renders label and value with no delta", () => {
    render(<MetricCard label="Total runs" value={42} />);
    expect(screen.getByText("Total runs")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders deltaLabel alongside the delta value when both are given", () => {
    render(<MetricCard label="Total cost" value="$3.40" delta={1.2} deltaLabel="vs. previous period" />);
    expect(screen.getByText("1.20")).toBeInTheDocument();
    expect(screen.getByText("vs. previous period")).toBeInTheDocument();
  });

  it("omits the deltaLabel text when delta is given but deltaLabel is not", () => {
    render(<MetricCard label="Total cost" value="$3.40" delta={1.2} />);
    expect(screen.getByText("1.20")).toBeInTheDocument();
    expect(screen.queryByText("vs. previous period")).not.toBeInTheDocument();
  });

  it("renders nothing delta-related when delta is omitted, even with a deltaLabel", () => {
    render(<MetricCard label="Total cost" value="$3.40" deltaLabel="vs. previous period" />);
    expect(screen.queryByText("vs. previous period")).not.toBeInTheDocument();
  });
});
