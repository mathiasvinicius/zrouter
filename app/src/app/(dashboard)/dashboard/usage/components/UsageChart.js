"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;
const fmtRequests = (n) => String(n || 0);

const VIEW_MODES = [
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
  { value: "cost", label: "Cost" },
];

const VIEW_CONFIG = {
  tokens:   { dataKey: "tokens",   color: "#6366f1", gradId: "gradTokens",   formatter: fmtTokens,   label: "Tokens" },
  requests: { dataKey: "requests", color: "#14b8a6", gradId: "gradRequests", formatter: fmtRequests, label: "Requests" },
  cost:     { dataKey: "cost",     color: "#f59e0b", gradId: "gradCost",     formatter: fmtCost,     label: "Cost" },
};

// Colour per key series. Fixed palette, brand-first, so each key keeps its colour
// across re-sorts and refreshes (series are ordered by the server payload).
const SERIES_COLORS = ["#033f7b", "#1461a3", "#5d94c4", "#f59e0b", "#16a34a", "#dc2626", "#7c3aed", "#0891b2"];

export default function UsageChart({ period = "7d", apiKey = "", groupBy = "" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");
  const [byKey, setByKey] = useState(false);
  const [groups, setGroups] = useState([]);

  const cfg = VIEW_CONFIG[viewMode] || VIEW_CONFIG.tokens;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (apiKey) params.set("apiKey", apiKey);
      if (groupBy) params.set("groupBy", groupBy);
      const res = await fetch(`/api/usage/chart?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        // groupBy=apiKey returns { groups, rows } — everything else is a plain array.
        if (Array.isArray(json)) {
          setByKey(false);
          setData(json);
        } else {
          setByKey(true);
          setData(json?.rows || []);
          setGroups(json?.groups || []);
        }
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period, apiKey, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = byKey
    ? data.some((d) => groups.some((g) => d[`${g.key}::tokens`] > 0 || d[`${g.key}::cost`] > 0))
    : data.some((d) => d.tokens > 0 || d.cost > 0);

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div
        className="grid w-full items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:w-auto sm:self-start"
        style={{ gridTemplateColumns: `repeat(${VIEW_MODES.length}, minmax(0, 1fr))` }}
      >
        {VIEW_MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setViewMode(m.value)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === m.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">Loading...</div>
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data for this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={cfg.formatter}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) => {
                if (byKey) return [cfg.formatter(value), name];
                return [cfg.formatter(value), cfg.label];
              }}
            />
            {byKey ? groups.map((g, i) => (
              <Area
                key={g.key}
                type="monotone"
                dataKey={`${g.key}::${viewMode}`}
                name={`${g.name}${g.unknown ? " (deleted)" : ""}`}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                fill="none"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )) : (
              <Area
                type="monotone"
                dataKey={cfg.dataKey}
                stroke={cfg.color}
                strokeWidth={2}
                fill={`url(#${cfg.gradId})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
  apiKey: PropTypes.string,
  groupBy: PropTypes.string,
};
