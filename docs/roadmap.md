# Seleção de recursos e arquitetura

## Fronteiras

| Sistema | Responsabilidade no desenho inicial |
| --- | --- |
| ZRouter | Autenticação de clientes, providers/combinações, permissões por chave, busca em fontes e contexto limitado por tokens. |
| Neo4j | Memória persistente separada por `bank`; não indexar automaticamente todo conteúdo externo como memória pessoal. |
| Open Notebook | Ingestão, extração, organização em notebooks e busca textual/semântica. Consumir sua API REST; não embutir SurrealDB, worker, podcasts ou uma segunda UI inteira. |
| Notion | Fonte externa de páginas/blocos. Conector de leitura server-side; integração token/OAuth restrito às páginas compartilhadas. Não tratá-lo como provider de inferência. |

Fluxo pretendido: `chave ZRouter → permissões (bank + fontes) → busca local/Notion/Open Notebook → trechos com origem → limite de contexto → provider da combinação`. Busca não deve fazer chamada Gemini/LLM. A geração continua no provider escolhido; contexto de fonte é opt-in por chave ou requisição.

## Entregas em ordem

1. **Contrato comum de fontes.** `search(query, scope, limit)` e `get(id)` retornam `sourceId`, `title`, `url`, `excerpt`, `updatedAt`, `bank`, `origin` e score. Configuração e credenciais ficam no servidor; autorizações de leitura por chave/bank são testadas antes de qualquer busca. Teto de tempo, tamanho e resultados; deduplicação e marcação de conteúdo como dado, nunca instrução.
2. **Notion read-only.** Buscar páginas/databases e ler árvores de blocos por REST ou MCP oficial, com paginação, backoff e tratamento de 401/403/429. Token em armazenamento criptografado, nunca no prompt ou logs. Começar sem escrita (`append_blocks` fica fora da primeira entrega). Testar com páginas explicitamente compartilhadas com a integração.
3. **Open Notebook por API.** Usar o serviço existente (`/api/notebooks`, `/api/sources`, `/api/search`) com credencial de serviço server-side. Retornar passagens e referências, não executar `/api/search/ask` para cada chamada: isso acrescentaria uma segunda geração e custo. Não copiar/alterar dados do SurrealDB. Testar uma busca com fonte real autorizada.
4. **Roteamento de contexto.** Integrar as duas fontes no caminho de chat apenas depois de testes de permissão, isolamento entre banks e orçamento de tokens. Mostrar ao cliente quais fontes foram consultadas, latência e citações verificáveis por ID/URL; permitir desligar a busca por requisição.
5. **Providers por demanda.** A base já tem mais de 120 módulos de registro, inclusive OpenAI/Anthropic compatíveis, Ollama, OpenRouter, Groq, Mistral e Together. Não importar catálogos inteiros. Primeiros candidatos ausentes: Requesty e Novita AI; só registrar após contrato de API/modelos e teste de geração real com credenciais próprias. Priorizar também qualidade das combinações existentes: fallback previsível, diagnóstico do provider efetivo e controle de pensamento por combinação.
6. **Interface.** Aproveitar padrões de navegação, cartões de fontes, pesquisa e citações do Open Notebook (MIT, atribuição preservada), mas montar uma única página de “Fontes” no ZRouter: Notion, Open Notebook e Neo4j, cada uma com status, escopo, teste e permissões. Evitar importar dashboards de podcast, automação, A2A ou dezenas de estratégias de roteamento.

## Critérios de aceitação antes de ligar um recurso

- Testes unitários do adaptador, de autorização entre bancos e de respostas vazias/erros.
- Teste real de busca/leitura com fonte autorizada e prova de que outra chave não vê a fonte.
- Nenhuma credencial ou documento integral em logs; cache com prazo e limite.
- Uma chamada de chat com contexto e uma sem, incluindo streaming e fallback, sem regressão no 9Router de produção.
- Medir tokens, latência e provider efetivamente usado. Sem chamar LLM para busca simples.

## Referências de implementação

- Open Notebook: `https://github.com/lfnovo/open-notebook`; API local em `http://127.0.0.1:5055/openapi.json`, licença MIT em `/opt/containers/open-notebook/LICENSE`.
- Notion MCP oficial: `https://developers.notion.com/docs/mcp`; referência da implementação do OmniRoute: `https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/frameworks/NOTION_CONTEXT.md`.
- OmniRoute como catálogo de ideias, não dependência: `https://github.com/diegosouzapw/OmniRoute`.

