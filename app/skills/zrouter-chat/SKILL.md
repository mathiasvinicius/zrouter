---
name: zrouter-chat
description: Use para chat e geração de código pelo ZRouter desta instalação, inclusive combinações vinculadas à API key, fallback e streaming. Não use para escolher outro perfil por meio do campo model.
---

# Chat pelo ZRouter

Leia a [skill de entrada](../zrouter/SKILL.md) para endereço e autenticação.
Use `POST /v1/chat/completions` no formato OpenAI ou `POST /v1/messages`
no formato Anthropic quando o cliente exigir esse protocolo.

Uma API key comum seleciona sua combinação no banco de dados. O ZRouter
substitui o `model` solicitado pela combinação vinculada à chave; enviar
outro modelo não troca identidade, SOUL, memória nem provedor. Descubra as
combinações anunciadas em `GET /v1/models` e confirme no Dashboard → Endpoint
qual pertence à chave. A EVE do Hermes usa `prime-codes`, mas outras chaves
podem usar combinações diferentes.

```bash
curl -fsS "$ZROUTER_URL/v1/chat/completions" \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"prime-codes","messages":[{"role":"user","content":"Olá"}],"stream":false}'
```

O exemplo `prime-codes` é apropriado somente quando essa for a combinação
atribuída à chave. Com `stream:true`, a resposta é SSE, não um único JSON.
Uma resposta HTTP 200 sem texto pode ter consumido o limite em raciocínio;
verifique `finish_reason`, conteúdo e tokens antes de declarar sucesso.

Para chaves de usuário com memória habilitada, o ZRouter injeta automaticamente
SOUL, modelo mental e memórias relevantes para o próprio banco. Consulte a
[skill de memória](../zrouter-memory/SKILL.md) antes de propor busca manual.
Chaves de serviço não recebem esses blocos e preservam o modelo solicitado.
