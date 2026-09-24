---
name: meta-google-dashboard
description: Crie um dashboard isolado de tráfego por cliente, usando Meta Ads e, opcionalmente, uma planilha Google Ads. Use ao receber um ID de conta Meta e/ou uma planilha para um novo cliente; não use para alterar campanhas.
---

# Dashboard Meta + Google Ads por cliente

Crie um dashboard separado no projeto de Gestor de Tráfego, preservando o padrão visual e funcional do dashboard da Dra. Roberta.

## Entrada obrigatória

Leia [o contrato de entrada](references/entrada.md). Antes de criar arquivos, confirme que há:

- nome de exibição do cliente;
- meta_account_id no formato act_...;
- slug exclusivo para a URL;
- autorização explícita para publicar, se o pedido incluir deploy.

Uma planilha Google é opcional. Se recebida, ela abastece apenas uma guia Google Ads daquele cliente.

## Regras inegociáveis

- Faça somente leituras de Meta, planilhas e integrações. Nunca crie, edite, pause, ative ou publique objetos de anúncios.
- Antes da consulta de métricas Meta, valide acesso e saúde da conta sem mostrar segredos.
- Mantenha um endpoint fixo por cliente e associe nele somente o meta_account_id aprovado. Nunca aceite uma conta arbitrária em parâmetro público.
- Crie uma URL exclusiva /slug e não inclua clientes em uma página pública de índice.
- Não coloque tokens, arquivos .env, identificadores de acesso ou dados de outros clientes no Git.
- Valores monetários são BRL apenas quando a fonte confirmar BRL ou quando o usuário determinar essa convenção. Se a planilha não declarar moeda, informe essa limitação; não faça conversão inventada.

## Meta Ads

1. Busque campanhas e conjuntos e classifique as guias pelo objetivo/destino efetivo encontrado, distinguindo ao menos mensagens de WhatsApp, leads, tráfego, vendas, reconhecimento e engajamento quando houver dados.
2. Não crie guia, tabela ou série diária para categorias sem métricas no período.
3. Para resultado principal, use a métrica Meta disponível para o objetivo. Se ela não vier, use o fallback documentado no código e mostre o rótulo correspondente — nunca atribua resultado inexistente.
4. Aplique filtro de data e de guia às métricas, gráficos diários, campanha e criativo. Gráficos devem agregar apenas os dias existentes no filtro e exibir tooltip nativo com data e valor.

## Planilha Google Ads

Use a guia Google Ads somente quando a planilha estiver acessível em leitura pelo servidor de produção. Primeiro leia os metadados e uma faixa pequena para confirmar as colunas.

O formato já suportado é:

Day, Campaign Name, Ad Group Name, Ad Name, Cost (Spend), Impressions, Clicks, Conversions.

Mapeie somente as colunas presentes. Para esse formato, exponha investimento, impressões, cliques, conversões, CTR, CPC, CPM e custo por conversão, mais gráficos diários e tabelas por campanha/grupo de anúncios. Se não houver alcance, moeda ou anúncio preenchido, declare a limitação e não simule as métricas/tabelas ausentes.

Identifique sempre a guia como Planilha Google Ads, separada de Meta Ads API.

## Implementação no projeto

- Adicione rota de página em vercel.json, endpoint Meta dedicado em api/slug.js e, quando aplicável, endpoint Google dedicado.
- Atualize o mapa de clientes em public/client-dashboard-v2.html; use a extensão Google apenas para clientes com essa fonte.
- Reaproveite src/meta-dashboard.js para saúde, cache, filtro de datas e consulta somente leitura.
- Preserve os dashboards existentes e teste o novo endpoint com um intervalo de datas que tenha dados.

## Validação e entrega

1. Valide sintaxe dos arquivos Node e JavaScript do navegador.
2. Consulte o endpoint de cada fonte em leitura e confirme conta, período, fonte, guias e ausência de erro.
3. Só publique após autorização explícita. Após publicar, valide o domínio público e o alias final.
4. Entregue o link individual, período de validação, fontes usadas e limitações reais.

## Exemplo de pedido

> Crie um dashboard para Nome do Cliente, slug nome-do-cliente, conta Meta act_123..., planilha Google <link>, link público separado e publique após validar.
