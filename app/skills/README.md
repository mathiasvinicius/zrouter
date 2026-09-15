# Skills do ZRouter

Estas instruções são servidas pelo próprio ZRouter em `/skills/`. Use a origem
do seu servidor (local ou Tailscale), não os arquivos da versão pública antiga.
Comece pela [skill de entrada](zrouter/SKILL.md), que explica autenticação,
descoberta de modelos e seleção da combinação vinculada à chave.

| Capacidade | Instruções |
|---|---|
| Chat e código | [zrouter-chat](zrouter-chat/SKILL.md) |
| Identidade e memória Neo4j | [zrouter-memory](zrouter-memory/SKILL.md) |
| Imagens | [zrouter-image](zrouter-image/SKILL.md) |
| Vídeo | [zrouter-video](zrouter-video/SKILL.md) |
| Síntese de voz | [zrouter-tts](zrouter-tts/SKILL.md) |
| Transcrição | [zrouter-stt](zrouter-stt/SKILL.md) |
| Embeddings | [zrouter-embeddings](zrouter-embeddings/SKILL.md) |
| Busca web | [zrouter-web-search](zrouter-web-search/SKILL.md) |
| Leitura de URL | [zrouter-web-fetch](zrouter-web-fetch/SKILL.md) |

Exemplo para um cliente que consegue ler URLs: `Leia
http://<seu-servidor>:<porta>/skills/zrouter/SKILL.md e siga apenas as
capacidades realmente disponíveis à sua chave.` Não inclua a API key na URL.

Para chamadas de API, configure `ZROUTER_URL` com a mesma origem e
`ZROUTER_KEY` com a chave de usuário apropriada. A memória automática
do ZRouter é isolada pelo `bank` da chave no Neo4j; a skill de memória
explica quando há, ou não, uma ferramenta de busca adicional no cliente.
