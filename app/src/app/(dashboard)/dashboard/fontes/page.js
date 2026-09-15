"use client";

// Fontes — knowledge-source status page (Notion / Open Notebook / Neo4j).
// Card pattern follows OmniRoute health/free-tiers on ZRouter components.

import { useEffect, useState } from "react";
import { Card, Button, Badge } from "@/shared/components";
import { SOURCE_META } from "../sourcesMeta";

function StatusPill({ status }) {
  if (!status) return null;
  const ok = status.ok;
  const label = status.status === "not-configured" ? "not-configured" : ok ? "ok" : "erro";
  const styles = !status.configured
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
    : ok
      ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
      : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${styles}`}>
      <span className={`size-1.5 rounded-full ${
        !status.configured ? "bg-amber-500" : ok ? "bg-green-500" : "bg-red-500"
      }`} />
      {label}
    </span>
  );
}

function SourceCard({ origin, meta, status, keys }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/sources/status");
      const data = await res.json();
      setResult(data?.status?.[origin] ?? null);
    } catch {
      setResult(null);
    } finally {
      setTesting(false);
    }
  };

  const shown = result || status;
  const enabledKeys = keys.filter((key) => key.sources?.[origin]?.enabled === true);
  const scopeKey = meta.scopes[0].key;

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-[10px] bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-main truncate">{meta.label}</h3>
            <p className="text-xs text-text-muted truncate">{meta.description}</p>
          </div>
        </div>
        <StatusPill status={shown} />
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-text-muted">Escopo configurado</span>
          <span className="font-mono text-xs truncate max-w-[55%] text-right">
            {enabledKeys.flatMap((key) => key.sources[origin][scopeKey] || []).filter(Boolean).length > 0
              ? [...new Set(enabledKeys.flatMap((key) => key.sources[origin][scopeKey]))].join(", ")
              : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Keys ligadas</span>
          <span className="font-mono">{enabledKeys.length}</span>
        </div>
        {shown?.latencyMs !== undefined && shown?.ok && (
          <div className="flex justify-between">
            <span className="text-text-muted">Latência</span>
            <span className="font-mono">{shown.latencyMs} ms</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {enabledKeys.length > 0 ? enabledKeys.map((key) => (
          <a
            key={key.id}
            href="/dashboard/endpoint#require-api-key"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            title={`Abrir key ${key.name}`}
          >
            <span className="material-symbols-outlined text-[12px]">vpn_key</span>
            {key.name}
          </a>
        )) : (
          <p className="text-xs text-text-muted">Nenhuma key com esta fonte ligada.</p>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="self-start">
        {testing ? "Testando…" : "Testar conexão"}
      </Button>
    </Card>
  );
}

export default function FontesPage() {
  const [status, setStatus] = useState(null);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statusRes, keysRes] = await Promise.all([
          fetch("/api/sources/status"),
          fetch("/api/keys"),
        ]);
        if (cancelled) return;
        if (statusRes.ok) setStatus(await statusRes.json());
        if (keysRes.ok) setKeys((await keysRes.json()).keys || []);
      } catch {
        /* keep whatever we have */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-text-main">Fontes</h1>
          <p className="text-sm text-text-muted">
            Fontes de conhecimento por API key — Notion, Open Notebook e Neo4j.
          </p>
        </div>
        <Badge variant="default">Entrega 1</Badge>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Carregando status…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(SOURCE_META).map(([origin, meta]) => (
            <SourceCard key={origin} origin={origin} meta={meta} status={status?.[origin]} keys={keys} />
          ))}
        </div>
      )}
    </div>
  );
}
