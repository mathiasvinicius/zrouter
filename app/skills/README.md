# Skills do ZRouter

Estas instruções são servidas pelo próprio 9Router em `/skills/`. Use a origem
do seu servidor (local ou Tailscale), não os arquivos da versão pública antiga.
Comece pela [skill de entrada](9router/SKILL.md), que explica autenticação,
descoberta de modelos e seleção da combinação vinculada à chave.

| Capacidade | Instruções |
|---|---|
| Chat e código | [9router-chat](9router-chat/SKILL.md) |
| Identidade e memória Neo4j | [9router-memory](9router-memory/SKILL.md) |
| Imagens | [9router-image](9router-image/SKILL.md) |
| Vídeo | [9router-video](9router-video/SKILL.md) |
| Síntese de voz | [9router-tts](9router-tts/SKILL.md) |
| Transcrição | [9router-stt](9router-stt/SKILL.md) |
| Embeddings | [9router-embeddings](9router-embeddings/SKILL.md) |
| Busca web | [9router-web-search](9router-web-search/SKILL.md) |
| Leitura de URL | [9router-web-fetch](9router-web-fetch/SKILL.md) |

Exemplo para um cliente que consegue ler URLs: `Leia
http://<seu-servidor>:20128/skills/9router/SKILL.md e siga apenas as
capacidades realmente disponíveis à sua chave.` Não inclua a API key na URL.

Para chamadas de API, configure `NINEROUTER_URL` com a mesma origem e
`NINEROUTER_KEY` com a chave de usuário apropriada. A memória automática
do 9Router é isolada pelo `bank` da chave no Neo4j; a skill de memória
explica quando há, ou não, uma ferramenta de busca adicional no cliente.
