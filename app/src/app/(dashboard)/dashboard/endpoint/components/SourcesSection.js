"use client";

// "Fontes de Conhecimento" section for the API-key create/edit modals.
// Visual pattern follows the OmniRoute api-manager/tokens modals (dark card rows,
// toggle chips, inline scope lists with +/× buttons) on ZRouter components.

import PropTypes from "prop-types";
import { useState } from "react";
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
        <ScopeList
          key={scope.key}
          label={scope.label}
          values={entry[scope.key] || []}
          disabled={disabled}
          onChange={(values) => update({ [scope.key]: values })}
        />
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
