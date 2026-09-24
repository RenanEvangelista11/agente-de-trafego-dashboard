# Contrato de entrada — dashboard por cliente

Envie este bloco para o Codex:

~~~
Cliente: <nome que aparecerá no dashboard>
Slug: <url-curta-sem-espacos>
Conta Meta: act_<id>
Planilha Google Ads: <link ou "não usar">
Publicação: <sim/não>
Link: <público separado/necessita senha>
~~~

## Requisitos da planilha

- Compartilhada em leitura para a integração e acessível pelo servidor de produção.
- Uma guia com dados diários e cabeçalhos conhecidos. O formato padrão é Day, Campaign Name, Ad Group Name, Ad Name, Cost (Spend), Impressions, Clicks, Conversions.
- Se a moeda não estiver na fonte, confirme que os valores devem ser exibidos em BRL.

## O que o Codex devolve

- URL individual do dashboard.
- Fontes conectadas e período validado.
- Métricas que a fonte de fato possui e limitações de colunas ausentes.
- Confirmação de que a conta Meta consultada é exatamente a informada.
