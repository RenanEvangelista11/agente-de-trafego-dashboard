# Base de inteligência operacional

Esta é a síntese operacional do playbook fornecido em 15/08/2026. A regra executável e de segurança está em `REGRAS.md`.

## Contexto de aplicação

O método foi calibrado para infoprodutos brasileiros de quiz/DR, com produto de entrada de baixo ticket e monetização adicional em backend. Seu eixo financeiro é RPL efetivo, e não ROAS isolado do front-end.

## Lógica de decisão

1. Proteger a qualidade do dado com health check, janela de análise e gate de amostra.
2. Medir purchases por `omni_purchase` e cliques por `inline_link_clicks`.
3. Calcular RPL: ticket front + (conversão de backend × ticket de backend).
4. Classificar CPA em relação ao RPL e produzir recomendação de escalar, manter, vigiar ou reduzir.
5. Tratar CTR, CPC e conversão como diagnósticos, não como gatilhos isolados.

## Limite de autonomia

O playbook descreve alterações operacionais, mas neste projeto toda escrita na Meta continua bloqueada até confirmação explícita do responsável. O agente, por padrão, lê, calcula, explica e propõe.

## Dados obrigatórios por produto

- ticket de frontend;
- ticket médio de backend;
- conversão frontend → backend;
- identificação da campanha e idade;
- spend, CPA, purchases e `inline_link_clicks` por janela.

Se um deles estiver ausente, o agente pede a informação; não cria uma premissa nova.
