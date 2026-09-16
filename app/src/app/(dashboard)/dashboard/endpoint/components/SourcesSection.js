"use client";

// "Fontes de Conhecimento" section for the API-key create/edit modals.
// Visual pattern follows the OmniRoute api-manager/tokens modals (dark card rows,
// toggle chips, inline scope lists with +/× buttons) on ZRouter components.

import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import Button from "@/shared/components/Button";
import Toggle from "@/shared/components/Toggle";
import { SOURCE_META } from "../../sourcesMeta";

const EMPTY_SOURCES = {
  notion: { enabled: false, pages: [], databases: [] },
  "open-notebook": { enabled: false, notebooks: [] },
  neo4j: { enabled: false, banks: [] },
};

export function emptyKeySources() {
  return JSON.parse(JSON.stringify(EMPTY_SOURCES));
}

function ScopeList({ label, values, onChange, disabled }) {
  const items = Array.isArray(values) ? values : [];
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <p className="text-xs text-text-muted">{label}</p>
      {items.map((value, index) => (
        <div key={`${label}-${index}`} className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(items.map((item, i) => (i === index ? event.target.value : item)))}
            className="flex-1 px-2.5 py-1.5 rounded-md bg-surface-2 border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-xs font-mono text-text-main disabled:opacity-50"
            placeholder={label}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-500 disabled:opacity-30 transition-colors"
            aria-label={`Remove ${label}`}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...items, ""])}
        className="self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:bg-surface-2 hover:text-text-main disabled:opacity-30 transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">add</span>
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

ScopeList.propTypes = {
  label: PropTypes.string.isRequired,
  values: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

// "Todos" marker stored in the key's notebooks list. The backend treats "*" as
// "no notebook restriction"; an empty list still means NOTHING (unchanged).
const ALL_NOTEBOOKS = "*";
const NOTEBOOKS_CACHE_MS = 60_000;
let notebooksCache = null; // {at, notebooks} — endpoint already caches; this avoids refetch flicker.

function NotebookPicker({ values, onChange, disabled }) {
  const items = (Array.isArray(values) ? values : []).map(String);
  const all = items.includes(ALL_NOTEBOOKS);
  const [state, setState] = useState(() => (notebooksCache ? { status: "ready", notebooks: notebooksCache.notebooks } : { status: "idle", notebooks: [] }));
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    if (notebooksCache && Date.now() - notebooksCache.at < NOTEBOOKS_CACHE_MS) return;
    let alive = true;
    setState({ status: "loading", notebooks: [] });
    (async () => {
      try {
        const res = await fetch("/api/sources/open-notebook/notebooks");
        const data = await res.json();
        if (!Array.isArray(data?.notebooks) || data.error) throw new Error(data?.error || "unavailable");
        notebooksCache = { at: Date.now(), notebooks: data.notebooks };
        if (alive) setState({ status: "ready", notebooks: data.notebooks });
      } catch (error) {
        if (alive) setState({ status: "error", notebooks: [], error: String(error?.message || error) });
      }
    })();
    return () => { alive = false; };
  }, []);

  const known = new Set(state.notebooks.map((nb) => nb.id));
  const selected = items.filter((id) => id !== ALL_NOTEBOOKS);
  // Ids that were typed before (or whose notebook was deleted) stay selected and removable.
  const unknown = selected.filter((id) => !known.has(id));
  const toggleAll = () => onChange(all ? selected : [...selected, ALL_NOTEBOOKS]);
  const toggleNotebook = (id) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const chip = (active) => `inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-colors disabled:opacity-50 ${
    active ? "border-brand-500/40 bg-brand-500/10 text-text-main" : "border-transparent bg-surface-2 text-text-muted hover:text-text-main"
  }`;

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <p className="text-xs text-text-muted">Cadernos autorizados</p>

      <Toggle size="sm" checked={all} disabled={disabled} onChange={toggleAll}
        label="Todos os cadernos" description={all ? "Sem restrição: vê todo o Open Notebook." : "Restrinja a key a cadernos específicos."} />

      {state.status === "loading" && (
        <p className="text-xs text-text-muted animate-pulse">Carregando cadernos…</p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-red-500 dark:text-red-400">
          Não foi possível carregar os cadernos ({state.error}). Os IDs já salvos seguem válidos.
        </p>
      )}
      {state.status === "ready" && state.notebooks.length === 0 && !unknown.length && (
        <p className="text-xs text-text-muted">Nenhum caderno disponível no Open Notebook.</p>
      )}

      {state.status === "ready" && state.notebooks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {state.notebooks.map((nb) => (
            <button key={nb.id} type="button" disabled={disabled} onClick={() => toggleNotebook(nb.id)}
              title={nb.description || nb.id} className={chip(selected.includes(nb.id))}>
              <span className="material-symbols-outlined text-[14px]">
                {selected.includes(nb.id) ? "check_box" : "check_box_outline_blank"}
              </span>
              {nb.name || nb.id}
            </button>
          ))}
        </div>
      )}

      {!all && unknown.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs text-text-main">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            Caderno desconhecido · {id}
          </span>
          <button type="button" disabled={disabled} onClick={() => toggleNotebook(id)}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-500 disabled:opacity-30 transition-colors"
            aria-label="Remover caderno">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ))}

      {all && (
        <p className="text-xs text-text-muted">“Todos” tem precedência: os cadernos específicos ficam guardados, mas não restringem nada.</p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={manualId}
          disabled={disabled}
          onChange={(event) => setManualId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !manualId.trim()) return;
            event.preventDefault();
            toggleNotebook(manualId.trim());
            setManualId("");
          }}
          placeholder="notebook:… (ou use os cadernos acima)"
          className="flex-1 px-2.5 py-1.5 rounded-md bg-surface-2 border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-xs font-mono text-text-main disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || !manualId.trim()}
          onClick={() => { toggleNotebook(manualId.trim()); setManualId(""); }}
          className="self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:bg-surface-2 hover:text-text-main disabled:opacity-30 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Add id
        </button>
      </div>
    </div>
  );
}

NotebookPicker.propTypes = {
  values: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

function SourceCard({ origin, meta, entry, onChange }) {
  const [testing, setTesting] = useState(false);
  const disabled = !entry.enabled;
  const update = (patch) => onChange(origin, { ...entry, ...patch });

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/sources/status");
      const data = await res.json();
      const originStatus = data?.[origin];
      if (originStatus) update({ testResult: originStatus });
    } catch {
      update({ testResult: null });
    } finally {
      setTesting(false);
    }
  };

  const testResult = entry.testResult;
  return (
    <div className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors ${
      entry.enabled ? "border-brand-500/40 bg-brand-500/5" : "border-border bg-surface/40"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-[18px] ${entry.enabled ? "text-primary" : "text-text-muted"}`}>
            {meta.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-main truncate">{meta.label}</p>
            <p className="text-xs text-text-muted truncate">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} title="Testar conexão">
            {testing ? "Testando…" : "Testar"}
          </Button>
          <Toggle size="sm" checked={entry.enabled} onChange={(checked) => update({ enabled: checked, testResult: undefined })} />
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs ${
          testResult.ok ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>
          <span className="material-symbols-outlined text-[14px]">
            {testResult.ok ? "check_circle" : "cancel"}
          </span>
          {testResult.ok
            ? `✓ Conectado · ${testResult.latencyMs ?? "–"}ms`
            : `✗ ${testResult.status || "erro"}`}
        </div>
      )}

      {entry.enabled && meta.scopes.map((scope) => (
        scope.key === "notebooks" ? (
          <NotebookPicker
            key={scope.key}
            values={entry[scope.key] || []}
            disabled={disabled}
            onChange={(values) => update({ [scope.key]: values })}
          />
        ) : (
          <ScopeList
            key={scope.key}
            label={scope.label}
            values={entry[scope.key] || []}
            disabled={disabled}
            onChange={(values) => update({ [scope.key]: values })}
          />
        )
      ))}
    </div>
  );
}

SourceCard.propTypes = {
  origin: PropTypes.string.isRequired,
  meta: PropTypes.shape({
    icon: PropTypes.string,
    label: PropTypes.string,
    description: PropTypes.string,
    scopes: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string })),
  }).isRequired,
  entry: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default function SourcesSection({ sources, onChange }) {
  const value = sources || EMPTY_SOURCES;
  const update = (origin, entry) => onChange({ ...value, [origin]: entry });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-text-main">Fontes de Conhecimento</p>
      <p className="text-xs text-text-muted -mt-1">
        Fontes que esta key pode consultar. O que não estiver ligado, ela não vê.
      </p>
      {Object.entries(SOURCE_META).map(([origin, meta]) => (
        <SourceCard
          key={origin}
          origin={origin}
          meta={meta}
          entry={value[origin] || { enabled: false }}
          onChange={update}
        />
      ))}
    </div>
  );
}

SourcesSection.propTypes = {
  sources: PropTypes.object,
  onChange: PropTypes.func.isRequired,
};
