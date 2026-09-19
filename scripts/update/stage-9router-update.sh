#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "uso: $0 <tag-ou-commit-9router>" >&2
  exit 2
fi

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "worktree precisa estar limpa antes de preparar um update" >&2
  exit 3
fi

base="$(git tag -l 'zrouter-base-*' --sort=-v:refname | head -n 1)"
if [[ -z "$base" ]]; then
  echo "nenhuma tag zrouter-base-* encontrada" >&2
  exit 4
fi

git rev-parse --verify "${base}^{commit}" >/dev/null
git rev-parse --verify "${target}^{commit}" >/dev/null

echo "Aplicando árvore vendorizada: ${base} -> ${target} em app/"
set +e
git diff --binary "$base" "$target" | git apply --3way --directory=app --index
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo "Update aplicado parcialmente; resolva os conflitos UU/AA e preserve os customs do ZRouter." >&2
  git status --short
  exit 10
fi

echo "Update aplicado sem conflitos. Revise, teste e só então atualize upstreams.lock.json e a tag base."
