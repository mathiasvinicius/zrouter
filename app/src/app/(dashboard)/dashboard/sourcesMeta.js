// Shared metadata for the knowledge-source origins (modal + Fontes page).
export const SOURCE_META = {
  notion: {
    label: "Notion",
    description: "Páginas e databases (read-only)",
    icon: "description",
    scopes: [
      { key: "pages", label: "IDs de pages" },
      { key: "databases", label: "IDs de databases" },
    ],
  },
  "open-notebook": {
    label: "Open Notebook",
    description: "Notebooks autorizados",
    icon: "menu_book",
    scopes: [
      { key: "notebooks", label: "IDs de notebooks" },
    ],
  },
  neo4j: {
    label: "Neo4j",
    description: "Banks de memória",
    icon: "hub",
    scopes: [
      { key: "banks", label: "Banks" },
    ],
  },
};

export const SOURCE_ORIGINS = Object.keys(SOURCE_META);
