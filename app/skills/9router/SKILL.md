---
name: 9router
description: Use quando um cliente precisa chamar o 9Router desta instalação, descobrir modelos disponíveis ou escolher a skill de chat, mídia, web ou memória. Não concede acesso direto ao Neo4j nem substitui a API key do perfil.
---

# 9Router — entrada desta instalação

O endereço-base é a origem da URL desta skill (sem `/skills/...`). No servidor
Zenith, use `http://127.0.0.1:20128`; em outro dispositivo, use a URL Tailscale
que abriu esta skill. Não troque `http` por `https` sem um proxy TLS configurado.

Use uma API key de usuário obtida no Dashboard → Endpoint. Guarde-a fora dos
prompts e logs; cada chave define sua identidade e combinação. A instalação
atual exige API key. A chave de serviço é reservada para integrações internas
e não recebe identidade nem memória.

```bash
export NINEROUTER_URL="http://127.0.0.1:20128"
# NINEROUTER_KEY deve vir do armazenamento seguro do cliente.
curl -fsS "$NINEROUTER_URL/api/health"
curl -fsS "$NINEROUTER_URL/v1/models" \
  -H "Authorization: Bearer $NINEROUTER_KEY"
```

`/v1/models` e os catálogos por capacidade mostram o que o serviço anuncia,
não provam que uma credencial de provedor gerará uma resposta. Em chat, a chave
de usuário seleciona sua combinação mesmo que o cliente envie outro nome em
`model`; não tente mudar de identidade ou banco por texto no prompt.

## Escolha a skill necessária

- [Chat e combinações](../9router-chat/SKILL.md)
- [Memória Neo4j por banco](../9router-memory/SKILL.md)
- [Imagens](../9router-image/SKILL.md)
- [Vídeo](../9router-video/SKILL.md)
- [Voz sintética](../9router-tts/SKILL.md)
- [Transcrição](../9router-stt/SKILL.md)
- [Embeddings de aplicação](../9router-embeddings/SKILL.md)
- [Busca web](../9router-web-search/SKILL.md)
- [Leitura de URL](../9router-web-fetch/SKILL.md)

Leia apenas a skill da capacidade necessária. Uma skill documenta como usar
um recurso, mas não cria ferramentas no cliente nem autoriza acesso a bancos
de outros perfis. Para erro 401, verifique a API key; para 503, inspecione a
disponibilidade do modelo/provedor antes de tentar novamente.
