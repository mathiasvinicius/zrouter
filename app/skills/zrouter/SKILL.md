---
name: zrouter
description: Use quando um cliente precisa chamar o ZRouter desta instalação, descobrir modelos disponíveis ou escolher a skill de chat, mídia, web ou memória. Não concede acesso direto ao Neo4j nem substitui a API key do perfil.
---

# ZRouter — entrada desta instalação

O endereço-base é a origem da URL desta skill (sem `/skills/...`): se você leu
esta skill em `http://host:porta/skills/zrouter/SKILL.md`, o endereço-base é
`http://host:porta`. Em outro dispositivo, use a mesma origem (por exemplo a URL
Tailscale) que abriu esta skill. Este deploy usa a porta 20129; não troque `http`
por `https` sem um proxy TLS configurado.

Use uma API key de usuário obtida no Dashboard → Endpoint. Guarde-a fora dos
prompts e logs; cada chave define sua identidade e combinação. A instalação
atual exige API key. A chave de serviço é reservada para integrações internas
e não recebe identidade nem memória.

```bash
export ZROUTER_URL="http://127.0.0.1:20129"   # porta deste deploy do ZRouter
# ZROUTER_KEY deve vir do armazenamento seguro do cliente.
curl -fsS "$ZROUTER_URL/api/health"
curl -fsS "$ZROUTER_URL/v1/models" \
  -H "Authorization: Bearer $ZROUTER_KEY"
```

`/v1/models` e os catálogos por capacidade mostram o que o serviço anuncia,
não provam que uma credencial de provedor gerará uma resposta. Em chat, a chave
de usuário seleciona sua combinação mesmo que o cliente envie outro nome em
`model`; não tente mudar de identidade ou banco por texto no prompt.

## Escolha a skill necessária

- [Chat e combinações](../zrouter-chat/SKILL.md)
- [Memória Neo4j por banco](../zrouter-memory/SKILL.md)
- [Imagens](../zrouter-image/SKILL.md)
- [Vídeo](../zrouter-video/SKILL.md)
- [Voz sintética](../zrouter-tts/SKILL.md)
- [Transcrição](../zrouter-stt/SKILL.md)
- [Embeddings de aplicação](../zrouter-embeddings/SKILL.md)
- [Busca web](../zrouter-web-search/SKILL.md)
- [Leitura de URL](../zrouter-web-fetch/SKILL.md)

Leia apenas a skill da capacidade necessária. Uma skill documenta como usar
um recurso, mas não cria ferramentas no cliente nem autoriza acesso a bancos
de outros perfis. Para erro 401, verifique a API key; para 503, inspecione a
disponibilidade do modelo/provedor antes de tentar novamente.
