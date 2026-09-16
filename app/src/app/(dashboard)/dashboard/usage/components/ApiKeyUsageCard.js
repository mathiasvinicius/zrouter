"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function fmtTime(iso) {
  if (!iso) return "Never";
  const diffMins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const COLUMNS = [
  { field: "name", label: "API Key", align: "left" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "promptTokens", label: "Input Tokens", align: "right" },
  { field: "completionTokens", label: "Output Tokens", align: "right" },
  { field: "cost", label: "Cost", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
  { field: "share", label: "Share", align: "right" },
];

export default function ApiKeyUsageCard({ summary = {}, totalRequests = 0, activeKey = "", onSelectKey }) {
  const [sortBy, setSortBy] = useState("requests");
  const [sortOrder, setSortOrder] = useState("desc");

  const totalCost = useMemo(
    () => Object.values(summary).reduce((sum, s) => sum + (s.cost || 0), 0),
    [summary]
  );

  const rows = useMemo(() => {
    const base = totalRequests || 1;
    return Object.entries(summary).map(([handle, s]) => ({
      handle,
      ...s,
      share: (s.requests || 0) / base,
    })).sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [summary, sortBy, sortOrder, totalRequests]);

  const toggleSort = (field) => {
    if (field === sortBy) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortOrder(field === "name" ? "asc" : "desc"); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-1 p-4 border-b border-border bg-bg-subtle/50 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold">Usage by API key</h3>
          <p className="text-xs text-text-muted">
            Where the traffic comes from — {rows.length} key{rows.length === 1 ? "" : "s"}, {fmt(totalRequests)} requests, ~{fmtCost(totalCost)} estimated
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeKey}
            onChange={(e) => onSelectKey(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
            style={{ colorScheme: "auto" }}
            title="Filter the whole page by API key"
          >
            <option value="">All keys</option>
            {rows.map((row) => (
              <option key={row.handle} value={row.handle}>
                {row.name}{row.unknown ? " (deleted)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-bg-subtle/30 text-text-muted uppercase text-xs">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.field}
                  onClick={() => toggleSort(col.field)}
                  className={`px-6 py-3 cursor-pointer hover:bg-bg-subtle/50 ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.label}
                  <span className="ml-1 opacity-60">{sortBy === col.field ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.handle}
                className={`transition-colors hover:bg-bg-subtle/40 ${row.unknown ? "text-text-muted" : ""}`}
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    {row.keyId ? (
                      <Link
                        href={`/dashboard/endpoint?key=${encodeURIComponent(row.keyId)}`}
                        className="font-medium text-primary hover:underline"
                        title="Open this key in the endpoint page"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-medium" title="Key no longer exists — history is kept">{row.name}</span>
                    )}
                    {row.unknown && <Badge variant="neutral" size="sm">deleted</Badge>}
                    {row.memoryBankId && <Badge variant="primary" size="sm">{row.memoryBankId}</Badge>}
                  </div>
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => onSelectKey(activeKey === row.handle ? "" : row.handle)}
                    className={`rounded-[8px] px-2 py-0.5 font-medium transition-colors ${activeKey === row.handle ? "bg-primary text-white" : "hover:bg-bg-hover"}`}
                    title="Filter the page by this key"
                  >
                    {fmt(row.requests)}
                  </button>
                </td>
                <td className="px-6 py-3 text-right text-text-muted">{fmt(row.promptTokens)}</td>
                <td className="px-6 py-3 text-right text-text-muted">{fmt(row.completionTokens)}</td>
                <td className="px-6 py-3 text-right font-medium text-warning">{fmtCost(row.cost)}</td>
                <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(row.lastUsed)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 sm:block">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(row.share * 100)}%` }} />
                    </div>
                    <span className="w-10 text-text-muted">{(row.share * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-6 py-8 text-center text-text-muted">
                  No key usage recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

ApiKeyUsageCard.propTypes = {
  summary: PropTypes.object,
  totalRequests: PropTypes.number,
  activeKey: PropTypes.string,
  onSelectKey: PropTypes.func,
};
