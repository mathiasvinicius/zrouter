"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/shared/components";
import { getModelsByProviderId } from "@/shared/constants/models";
import DiscoverModelsModal from "./DiscoverModelsModal";

// Provider-level "Modelos Disponíveis" controls (Entrega 2 B + C):
// - Importar de /models (modal)
// - Buscar automaticamente modelos upstream (autoDiscoverModels)
// - Sincronização automática (autoSyncModels, lazy 12h)
export default function ModelSyncControls({ providerId, importAlias, customModels }) {
  const [showDiscover, setShowDiscover] = useState(false);
  const [toggles, setToggles] = useState({ autoDiscoverModels: false, autoSyncModels: false });
  const [loaded, setLoaded] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const settings = await res.json();
        const next = {
          autoDiscoverModels: (settings.autoDiscoverModels || {})[providerId] === true,
          autoSyncModels: (settings.autoSyncModels || {})[providerId] === true,
        };
        if (cancelled) return;
        setToggles(next);
        setLoaded(true);

        // Contract B: page-open background re-discover when cache is stale (>6h).
        if (next.autoDiscoverModels) {
          fetch(`/api/providers/${providerId}/models/discover`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data?.sync) setSyncToast(data.sync); })
            .catch(() => {});
        }
        // Contract C: lazy sync on page open (12h window, diff toast).
        if (next.autoSyncModels) {
          setSyncing(true);
          fetch(`/api/providers/${providerId}/models/sync`, { method: "POST" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data && !data.skipped) setSyncToast(data);
            })
            .catch(() => {})
            .finally(() => setSyncing(false));
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [providerId]);

  const saveToggle = async (key, value) => {
    setToggles((prev) => ({ ...prev, [key]: value }));
    try {
      await fetch(`/api/providers/${providerId}/models/sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      setToggles((prev) => ({ ...prev, [key]: !value }));
    }
  };

  const existingIds = new Set(customModels.map((m) => m.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          checked={loaded && toggles.autoDiscoverModels}
          onChange={(v) => saveToggle("autoDiscoverModels", v)}
          label="Buscar automaticamente modelos upstream"
          size="sm"
        />
        <Toggle
          checked={loaded && toggles.autoSyncModels}
          onChange={(v) => saveToggle("autoSyncModels", v)}
          label="Sincronização automática"
          size="sm"
        />
        <button
          onClick={() => setShowDiscover(true)}
          className="flex items-center gap-1.5 px-3 h-7 rounded-[8px] border border-border text-xs font-semibold text-text-main hover:border-brand-500/40 hover:bg-surface-2 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          Importar de /models
        </button>
        {syncing && <span className="text-[10px] text-text-muted">sincronizando…</span>}
        {syncToast && (syncToast.added?.length || syncToast.disabled?.length) ? (
          <span className="text-[10px] text-text-muted">
            {`+${syncToast.added.length} novos / -${syncToast.disabled.length} desabilitados`}
          </span>
        ) : null}
      </div>
      <DiscoverModelsModal
        isOpen={showDiscover}
        onClose={() => setShowDiscover(false)}
        providerId={providerId}
        existingIds={[...existingIds, ...getModelsByProviderId(providerId).map((m) => m.id)]}
        importAlias={importAlias}
        onImported={() => window.dispatchEvent(new CustomEvent("customModelChanged"))}
      />
    </>
  );
}
