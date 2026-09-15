"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

// "Importar de /models" modal: discover (cache-aware) → local search →
// checkbox select → import as compatible models via /api/models/custom.
export default function DiscoverModelsModal({ isOpen, onClose, providerId, importAlias, existingIds = [], onImported }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [discovered, setDiscovered] = useState([]);
  const [discoveredAt, setDiscoveredAt] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const runDiscover = useCallback(async (ignoreCache) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/providers/${providerId}/models/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ignoreCache }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Discovery failed");
        setDiscovered([]);
        return;
      }
      setDiscovered(data.models || []);
      setDiscoveredAt(data.discoveredAt || null);
      setFromCache(data.fromCache === true);
      setSelected(new Set());
      setImportedCount(0);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/providers/${providerId}/models/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ignoreCache: false }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Discovery failed");
          setDiscovered([]);
          return;
        }
        setDiscovered(data.models || []);
        setDiscoveredAt(data.discoveredAt || null);
        setFromCache(data.fromCache === true);
        setSelected(new Set());
        setImportedCount(0);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, providerId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return discovered;
    return discovered.filter((m) => m.id.toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q));
  }, [discovered, query]);

  const importable = filtered.filter((m) => !existingIds.includes(m.id));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (importing || selected.size === 0) return;
    setImporting(true);
    try {
      let count = 0;
      for (const id of selected) {
        const res = await fetch("/api/models/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAlias: importAlias || providerId, id, type: "llm", source: "discovered" }),
        });
        if (res.ok) count += 1;
      }
      setImportedCount(count);
      setSelected(new Set());
      onImported?.(count);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Importar de /models" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
            <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            Discovering models...
          </div>
        ) : (
          <>
            {error && <p className="text-xs text-red-500 break-words">{error}</p>}
            {discoveredAt && !error && (
              <p className="text-[10px] text-text-muted">
                {fromCache ? "cache" : "upstream"} · {new Date(discoveredAt).toLocaleString()} · {discovered.length} models
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
              />
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => runDiscover(true)} disabled={loading}>
                Recarregar
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              {importable.length === 0 ? (
                <p className="p-4 text-xs text-text-muted">
                  {discovered.length === 0 ? "No models discovered." : "All discovered models are already added."}
                </p>
              ) : (
                importable.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-sidebar/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-mono text-text-main">{m.id}</span>
                    {m.name && m.name !== m.id && (
                      <span className="max-w-[40%] truncate text-[10px] italic text-text-muted">{m.name}</span>
                    )}
                  </label>
                ))
              )}
            </div>
            {importedCount > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400">{importedCount} modelo(s) importado(s).</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleImport} disabled={selected.size === 0 || importing}>
                {importing ? "Importing..." : `Import selected (${selected.size})`}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
