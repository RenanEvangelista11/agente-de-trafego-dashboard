// Extensão exclusiva para a fonte Google Ads da Dra. Roberta (revisão de leitura separada).
(function () {
  const previousRender = window.render;
  let googleLoading = false;

  function requestGoogleData() {
    if (slug !== 'dra-roberta' || googleLoading || data.googleAds) return;
    googleLoading = true;
    const query = new URLSearchParams({ since: $('since').value, until: $('until').value });
    fetch('/api/dra-roberta-google?' + query).then(response => response.json()).then(payload => {
      if (payload.googleAds) { data.googleAds = payload.googleAds; window.render(); }
    }).catch(() => {}).finally(() => { googleLoading = false; });
  }

  function googleCard(label, value, detail) {
    return "<article class='card'><div class='label'>" + esc(label) + "</div><div class='value'>" + value + "</div><div class='detail'>" + esc(detail) + "</div></article>";
  }
  function googleRows(rows, includeCampaign) {
    return rows.map(row => "<tr><td>" + esc(row.name) + "</td>" + (includeCampaign ? "<td>" + esc(row.campaign) + "</td>" : "") + "<td>" + brl(row.spend) + "</td><td>" + fmt(row.impressions) + "</td><td>" + fmt(row.clicks) + "</td><td>" + pct(row.ctr) + "</td><td>" + brl(row.cpc) + "</td><td>" + fmt(row.results) + "</td><td>" + brl(row.cpr) + "</td></tr>").join('') || "<tr><td class='empty' colspan='" + (includeCampaign ? 9 : 8) + "'>Sem dados neste período.</td></tr>";
  }
  function googleTable(title, rows, includeCampaign) {
    return "<section class='panel'><div class='head'><b>" + title + "</b><span class='muted'>" + fmt(rows.length) + " itens com dados</span></div><div class='table'><table><thead><tr><th>" + (includeCampaign ? "Grupo de anúncios" : "Campanha") + "</th>" + (includeCampaign ? "<th>Campanha</th>" : "") + "<th>Investimento</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPC</th><th>Conversões</th><th>Custo / conversão</th></tr></thead><tbody>" + googleRows(rows, includeCampaign) + "</tbody></table></div></section>";
  }
  function googleView(account) {
    const google = data.googleAds;
    $('title').textContent = account.name;
    $('subtitle').textContent = account.id + " · Google Ads · Planilha Google Ads · " + data.range.since + " a " + data.range.until;
    if (!google.available) {
      $('app').innerHTML = "<div class='status'><span class='badge critical'>INTEGRAÇÃO</span><span>" + esc(google.limitation) + "</span></div>";
      return;
    }
    const m = google.metrics;
    $('app').innerHTML = "<div class='status'><span class='badge ok'>PLANILHA GOOGLE ADS</span><span>Atualizado em " + new Date(data.generatedAt).toLocaleString('pt-BR') + "</span><span>" + esc(google.limitation || '') + "</span></div>" +
      "<section class='grid'>" +
      googleCard('Investimento', brl(m.spend), 'Google Ads · período selecionado') +
      googleCard('Conversões', fmt(m.results), 'Coluna Conversions da planilha') +
      googleCard('Custo / conversão', brl(m.cpr), 'Investimento / conversões') +
      googleCard('Cliques', fmt(m.clicks), 'CTR ' + pct(m.ctr) + ' · CPC ' + brl(m.cpc)) +
      googleCard('Impressões', fmt(m.impressions), 'CPM ' + brl(m.cpm)) +
      "</section><section class='two'><section class='panel'><div class='head'><b>Investimento por dia</b><span class='muted'>Planilha · filtro de data aplicado</span></div><div class='chart'>" + chart(google.daily, 'spend', google, '') + "</div></section><section class='panel'><div class='head'><b>Conversões por dia</b><span class='muted'>Coluna Conversions</span></div><div class='chart'>" + chart(google.daily, 'results', google, 'result') + "</div></section></section>" +
      googleTable('Resultados por campanha', google.campaigns, false) + googleTable('Resultados por grupo de anúncios', google.adGroups, true);
  }
  function addGoogleTab() {
    const tabs = $('tabs');
    if (!tabs || tabs.querySelector("[data-objective='__google_ads__']")) return;
    const button = document.createElement('button');
    button.className = 'tab' + (objective === '__google_ads__' ? ' active' : '');
    button.dataset.objective = '__google_ads__';
    button.textContent = 'Google Ads';
    button.onclick = () => { objective = '__google_ads__'; window.render(); };
    tabs.appendChild(button);
  }
  window.render = function () {
    previousRender();
    if (!data || slug !== 'dra-roberta') return;
    if (!data.googleAds) { requestGoogleData(); return; }
    addGoogleTab();
    if (objective === '__google_ads__') googleView(data.accounts[0]);
  };
  if (typeof data !== 'undefined' && data) window.render();
}());
