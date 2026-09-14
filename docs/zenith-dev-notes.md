# ZRouter (desenvolvimento no Zenith)

Fork de trabalho da árvore local `9router-custom/app`, criado em 2026-09-14. O 9Router de produção continua em `127.0.0.1:20128`; o ZRouter usa `127.0.0.1:20129`, container e SQLite próprios. Nenhuma chave, combinação ou base de produção foi copiada.

## Estado atual

- Código independente em `./app`; imagem `zrouter:dev` compilada localmente.
- Compose em `./docker-compose.yml`, dados em `./data`, senha inicial em `./.env` (arquivo privado; nunca versionar).
- Backend de memória configurado para o Neo4j local. Ainda não há perfis/chaves no SQLite do ZRouter.
- Open Notebook oficial já estava clonado em `/opt/containers/open-notebook` (`https://github.com/lfnovo/open-notebook`, `main` atualizado) e roda separadamente em `5055` (API) e `8502` (UI). Seu SurrealDB e seus dados permanecem sob controle do próprio Open Notebook.
- Notion e Open Notebook **ainda não estão conectados ao ZRouter**. A especificação de integração está em [docs/roadmap.md](docs/roadmap.md).

## Operação

```bash
docker compose -f /opt/containers/zrouter/docker-compose.yml config --quiet
docker compose -f /opt/containers/zrouter/docker-compose.yml up -d --build
docker ps --filter name=^zrouter$
curl -I http://127.0.0.1:20129/
```

O acesso inicial ao dashboard é somente pelo loopback. A senha fica em `/opt/containers/zrouter/.env`; não compartilhar esse arquivo. Antes de disponibilizar remotamente, implementar autenticação/segregação de fontes e rever a superfície de rede.

## Princípio de produto

ZRouter é um roteador enxuto com fontes de conhecimento úteis, não uma cópia integral do OmniRoute nem um segundo Open Notebook. Cada recurso novo exige um caso de uso, teste de integração e indicação clara de custo/latência. O 9Router de produção não muda até um cutover explicitamente validado.

