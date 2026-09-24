# Agente de tráfego para Meta Ads

Este projeto será um agente local para consultar e ajudar a gerir campanhas no Meta Ads. Ele não deverá criar, alterar ou publicar anúncios sem a sua confirmação explícita.

## Antes de começar

1. Abra o aplicativo **Terminal** no Mac. Você pode pressionar `Command + Espaço`, digitar `Terminal` e pressionar **Enter**.
2. Copie e cole este comando e pressione **Enter**:

   ```bash
   cd ~/Desktop/agente-de-trafego
   ```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Baixa as bibliotecas necessárias para o projeto. |
| `npm run verificar` | Confere se as credenciais e ao menos uma conta Meta foram configuradas. As contas monitoradas ficam em `config/meta-accounts.js`. Não mostra valores, não chama a Meta e não cria nem altera anúncios. |
| `npm run testar:token` | Consulta a Meta somente para verificar se o token é válido e quando expira. Não cria nem altera anúncios. |
| `npm run testar:regras` | Testa os cálculos e os bloqueios de segurança da inteligência de otimização, sem acessar a Meta. |
| `npm run dashboard` | Abre o dashboard local em `http://localhost:3030`. As fontes são consultadas somente em leitura; no dashboard publicado a atualização automática ocorre a cada 60 segundos. |
| `npm start` | Inicia o agente em modo seguro. Nesta fase, ele apenas confirma que está preparado e não realiza nenhuma ação na Meta. |

## Replicar um dashboard de cliente

A skill versionada em .codex/skills/meta-google-dashboard orienta um Codex a criar um dashboard isolado no mesmo padrão da Dra. Roberta.

Após clonar este projeto, envie ao Codex:

~~~
Use $meta-google-dashboard.
Cliente: <nome que aparecerá no dashboard>
Slug: <url-curta-sem-espacos>
Conta Meta: act_<id>
Planilha Google Ads: <link ou "não usar">
Publicação: <sim/não>
Link: <público separado/necessita senha>
~~~

Para o dashboard com Google Ads atualizar em produção, a planilha precisa estar compartilhada em leitura e conter dados diários. O formato suportado está documentado em .codex/skills/meta-google-dashboard/references/entrada.md.

## Arquivos e pastas

| Item | Para que serve |
| --- | --- |
| `.env` | Guarda suas credenciais da Meta somente no seu computador. Nunca envie este arquivo a ninguém. |
| `config/meta-accounts.js` | Define as contas Meta que o agente pode consultar. |
| `.gitignore` | Impede que o `.env` seja enviado para um repositório Git. |
| `REGRAS.md` | Regras que o agente usa para analisar campanhas e bloquear ações sem confirmação. |
| `docs/INTELIGENCIA-OPERACIONAL.md` | Resumo do playbook que fundamenta as regras operacionais. |
| `src/` | Onde ficará o código principal do agente. |
| `scripts/` | Onde ficarão comandos auxiliares. |

## Segurança

- Nunca coloque credenciais fora do `.env`.
- Não execute ações que possam gerar gastos sem confirmar antes.
- Os endpoints de dashboard fazem somente consultas às fontes configuradas.
