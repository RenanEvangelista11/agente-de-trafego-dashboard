require('dotenv').config({ quiet: true });

const axios = require('axios');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.DASHBOARD_PORT || 3030);
const META_API = 'v24.0';
const LEADS_SHEET_ID = '1zprz3qqHJYWY_Xr9Hy1ZKlJ1c36QBPzAsNDdcI5e47A';
// Os nomes das abas evitam depender do gid e deixam a fonte explícita.
const LP_URL = `https://docs.google.com/spreadsheets/d/${LEADS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=LP`;
const GROUP_URL = `https://docs.google.com/spreadsheets/d/${LEADS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Entrou%20grupo`;
const FORMS_URL = `https://docs.google.com/spreadsheets/d/${LEADS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Forms%201`;
const HOUR = 60 * 60 * 1000;
let cache = { generatedAt: null, data: null, loading: null, error: null };

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function csvRows(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field); if (row.some(value => value !== '')) rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function parseSheetDate(value) {
  const raw = String(value || '').trim();
  const brazilian = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
function objectRows(text) {
  const [header = [], ...data] = csvRows(text);
  return data.map(row => Object.fromEntries(header.map((name, position) => [normalize(name), String(row[position] || '').trim()])));
}
function value(row, ...names) {
  for (const name of names) {
    const found = row[normalize(name)];
    if (found !== undefined) return found;
  }
  return '';
}
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-11) : digits;
}
function actionValue(row, actionType) {
  return Number((row.actions || []).find(item => item.action_type === actionType)?.value || 0);
}
function emptyMetrics() {
  return { spend: 0, impressions: 0, reach: 0, clicks: 0, pageViews: 0, metaLeads: 0, leads: 0 };
}
function addMetrics(target, source) {
  for (const key of Object.keys(target)) target[key] += Number(source[key] || 0);
}
function finalize(metrics, fx) {
  const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
  return {
    ...metrics,
    spendBrl: metrics.spend * fx,
    ctr: ratio(metrics.clicks, metrics.impressions),
    clickToPageView: ratio(metrics.pageViews, metrics.clicks),
    pageConversion: ratio(metrics.leads, metrics.pageViews),
    cpm: metrics.impressions ? metrics.spend / metrics.impressions * 1000 : null,
    cpc: ratio(metrics.spend, metrics.clicks),
    cpvp: ratio(metrics.spend, metrics.pageViews),
    cpl: ratio(metrics.spend, metrics.leads),
  };
}
async function getFx() {
  const now = new Date();
  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(now.getTime() - offset * 86400000);
    const bcbDate = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`;
    try {
      const response = await axios.get("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)", { params: { '@dataCotacao': `'${bcbDate}'`, '$top': 1, '$format': 'json' }, timeout: 10000 });
      const rate = Number(response.data?.value?.[0]?.cotacaoVenda);
      if (rate) return rate;
    } catch (_) { /* tenta o dia útil anterior */ }
  }
  return 5;
}
async function metaRows(since, until) {
  const fields = 'campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,spend,impressions,reach,inline_link_clicks,actions,date_start,date_stop';
  // Este painel é exclusivo da captação atual. A conta vem do .env para não
  // misturar investimento de outros clientes no total.
  const accountIds = [process.env.META_AD_ACCOUNT_ID].filter(Boolean);
  if (!accountIds.length) throw new Error('Nenhuma conta Meta foi configurada.');
  const rowsByAccount = await Promise.all(accountIds.map(async accountId => {
    const normalizedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    let url = `https://graph.facebook.com/${META_API}/${normalizedAccountId}/insights`;
    let params = { access_token: process.env.META_ACCESS_TOKEN, level: 'ad', time_increment: 1, fields, time_range: JSON.stringify({ since, until }), limit: 500 };
    const output = [];
    for (let page = 0; page < 20 && url; page += 1) {
      const response = await axios.get(url, { params, timeout: 30000 });
      output.push(...(response.data.data || []));
      url = response.data.paging?.next; params = undefined;
    }
    return output;
  }));
  const output = rowsByAccount.flat();
  return output.map(row => ({
    date: row.date_start,
    campaign: row.campaign_name || '(sem campanha)', adset: row.adset_name || '(sem conjunto)', ad: row.ad_name || '(sem anúncio)',
    spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), reach: Number(row.reach || 0), clicks: Number(row.inline_link_clicks || 0),
    pageViews: actionValue(row, 'landing_page_view'), metaLeads: actionValue(row, 'offsite_conversion.fb_pixel_lead'), leads: 0,
  }));
}
async function leadSheetRows() {
  const response = await axios.get(LP_URL, { responseType: 'text', timeout: 30000 });
  return objectRows(response.data).map(row => {
    return {
      date: parseSheetDate(value(row, 'Data')),
      campaign: value(row, 'utm_campaign'),
      ad: value(row, 'utm_content'),
      adset: value(row, 'utm_term'),
      email: normalizeEmail(value(row, 'Email')), phone: normalizePhone(value(row, 'Telefone')),
    };
  });
}
async function groupSheetRows() {
  const response = await axios.get(GROUP_URL, { responseType: 'text', timeout: 30000 });
  return objectRows(response.data).map(row => ({ phone: normalizePhone(value(row, 'Número', 'Numero', 'Telefone')) })).filter(row => row.phone);
}
async function formSheetRows() {
  const response = await axios.get(FORMS_URL, { responseType: 'text', timeout: 30000 });
  return objectRows(response.data).map(row => ({
    email: normalizeEmail(value(row, 'E-mail', 'Email')), phone: normalizePhone(value(row, 'Celular', 'Telefone')),
    works: value(row, 'Você já trabalha com manutenção de celulares?'),
    experience: value(row, 'Há quanto tempo você atua na área?'),
    revenue: value(row, 'Quanto você costuma faturar por semana com reparos de celulares?'),
  }));
}
function percentage(numerator, denominator) { return denominator ? numerator / denominator : null; }
function responseBreakdown(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const answer = row[key] || 'Sem resposta';
    counts.set(answer, (counts.get(answer) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count, percentage: percentage(count, rows.length) })).sort((a, b) => b.count - a.count);
}
function qualityMetrics(leads, groups, forms) {
  const leadByEmail = new Map(); const leadByPhone = new Map();
  for (const lead of leads) {
    if (lead.email) leadByEmail.set(lead.email, lead);
    if (lead.phone) leadByPhone.set(lead.phone, lead);
  }
  const groupedPhones = new Set(groups.map(row => row.phone));
  const worksInArea = answer => ['Já faço alguns serviços', 'Trabalho profissionalmente'].map(normalize).includes(normalize(answer));
  const earnsOver3k = answer => ['Entre R$ 3.000 e R$ 5.000', 'Entre R$ 5.000 e R$ 10.000', 'Mais de R$ 10.000'].map(normalize).includes(normalize(answer));
  const creatives = new Map();
  const ensure = name => {
    const key = name || '(sem criativo)';
    if (!creatives.has(key)) creatives.set(key, { ad: key, leads: 0, groupEntries: 0, surveyResponses: 0, peopleInArea: 0, over3k: 0 });
    return creatives.get(key);
  };
  for (const lead of leads) {
    const bucket = ensure(lead.ad);
    bucket.leads += 1;
    if (lead.phone && groupedPhones.has(lead.phone)) bucket.groupEntries += 1;
  }
  let matchedResponses = 0;
  for (const form of forms) {
    const lead = leadByEmail.get(form.email) || leadByPhone.get(form.phone);
    if (!lead) continue;
    matchedResponses += 1;
    const bucket = ensure(lead.ad);
    bucket.surveyResponses += 1;
    if (worksInArea(form.works)) bucket.peopleInArea += 1;
    if (earnsOver3k(form.revenue)) bucket.over3k += 1;
  }
  const peopleInArea = forms.filter(row => worksInArea(row.works)).length;
  const over3k = forms.filter(row => earnsOver3k(row.revenue)).length;
  const groupEntries = leads.filter(row => row.phone && groupedPhones.has(row.phone)).length;
  return {
    leads: leads.length, groupEntries, groupRate: percentage(groupEntries, leads.length),
    surveyResponses: forms.length, matchedResponses, matchedRate: percentage(matchedResponses, forms.length),
    peopleInArea, peopleInAreaRate: percentage(peopleInArea, forms.length), over3k, over3kRate: percentage(over3k, forms.length),
    workBreakdown: responseBreakdown(forms, 'works'),
    experienceBreakdown: responseBreakdown(forms, 'experience'),
    revenueBreakdown: responseBreakdown(forms, 'revenue'),
    creatives: [...creatives.values()].map(row => ({
      ...row, groupRate: percentage(row.groupEntries, row.leads), surveyRate: percentage(row.surveyResponses, row.leads),
      areaRate: percentage(row.peopleInArea, row.surveyResponses), over3kRate: percentage(row.over3k, row.surveyResponses),
    })).sort((a, b) => b.surveyResponses - a.surveyResponses),
  };
}
function aggregate(meta, leads, fx) {
  const levels = { campaign: new Map(), adset: new Map(), ad: new Map(), daily: new Map() };
  const names = new Map();
  const ensure = (level, key) => { if (!levels[level].has(key)) levels[level].set(key, emptyMetrics()); return levels[level].get(key); };
  for (const row of meta) {
    const campaignKey = normalize(row.campaign); const adsetKey = `${campaignKey}|${normalize(row.adset)}`; const adKey = `${adsetKey}|${normalize(row.ad)}`;
    names.set(`campaign|${campaignKey}`, { campaign: row.campaign }); names.set(`adset|${adsetKey}`, { campaign: row.campaign, adset: row.adset }); names.set(`ad|${adKey}`, { campaign: row.campaign, adset: row.adset, ad: row.ad });
    addMetrics(ensure('campaign', campaignKey), row); addMetrics(ensure('adset', adsetKey), row); addMetrics(ensure('ad', adKey), row); addMetrics(ensure('daily', row.date), row);
  }
  for (const row of leads) {
    const campaignKey = normalize(row.campaign); const adsetKey = `${campaignKey}|${normalize(row.adset)}`; const adKey = `${adsetKey}|${normalize(row.ad)}`;
    ensure('campaign', campaignKey).leads += 1; ensure('adset', adsetKey).leads += 1; ensure('ad', adKey).leads += 1; ensure('daily', row.date).leads += 1;
    if (!names.has(`campaign|${campaignKey}`)) names.set(`campaign|${campaignKey}`, { campaign: row.campaign });
    if (!names.has(`adset|${adsetKey}`)) names.set(`adset|${adsetKey}`, { campaign: row.campaign, adset: row.adset });
    if (!names.has(`ad|${adKey}`)) names.set(`ad|${adKey}`, { campaign: row.campaign, adset: row.adset, ad: row.ad });
  }
  const convert = level => [...levels[level]].map(([key, metrics]) => ({ ...names.get(`${level}|${key}`), ...finalize(metrics, fx) })).sort((a, b) => b.spend - a.spend);
  // Mantém os registros completos para filtros e consolida cada visão pelo seu próprio nome.
  // Assim, um mesmo criativo/conjunto não aparece repetido apenas por estar em outra campanha.
  const records = convert('ad');
  const rollup = dimension => {
    const grouped = new Map();
    for (const row of records) {
      const key = normalize(row[dimension]) || '(SEM NOME)';
      if (!grouped.has(key)) grouped.set(key, { name: row[dimension], metrics: emptyMetrics() });
      addMetrics(grouped.get(key).metrics, row);
    }
    return [...grouped.values()]
      .map(({ name, metrics }) => ({ [dimension]: name, ...finalize(metrics, fx) }))
      .sort((a, b) => b.spend - a.spend);
  };
  return {
    campaign: rollup('campaign'), adset: rollup('adset'), ad: rollup('ad'), records,
    daily: [...levels.daily].map(([date, metrics]) => ({ date, ...finalize(metrics, fx) })).sort((a, b) => a.date.localeCompare(b.date))
  };
}
function defaultRange() {
  const end = new Date(); const start = new Date(end.getTime() - 6 * 86400000);
  const format = date => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return { since: format(start), until: format(end) };
}
async function refresh(force = false, since, until) {
  const range = { ...defaultRange(), ...(since && until ? { since, until } : {}) };
  const key = `${range.since}|${range.until}`;
  if (!force && cache.data?.key === key && Date.now() - cache.generatedAt < HOUR) return cache.data;
  if (cache.loading) return cache.loading;
  cache.loading = Promise.all([
    metaRows(range.since, range.until),
    leadSheetRows(),
    groupSheetRows().catch(() => []),
    formSheetRows().catch(() => []),
    getFx(),
  ]).then(([meta, leadRows, groupRows, formRows, fx]) => {
    const leads = leadRows.filter(row => row.date && row.campaign && row.date >= range.since && row.date <= range.until);
    const data = { key, range, fx, generatedAt: new Date().toISOString(), ...aggregate(meta, leads, fx), quality: qualityMetrics(leadRows, groupRows, formRows) };
    cache = { generatedAt: Date.now(), data, loading: null, error: null }; return data;
  }).catch(error => { cache.loading = null; cache.error = error.message; throw error; });
  return cache.loading;
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
}
async function dashboardHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/dashboard') {
    try { send(res, 200, JSON.stringify(await refresh(url.searchParams.get('refresh') === '1', url.searchParams.get('since'), url.searchParams.get('until')))); }
    catch (error) { send(res, 502, JSON.stringify({ error: 'Não foi possível atualizar os dados.', detail: error.message })); }
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html')), 'text/html; charset=utf-8');
  send(res, 404, JSON.stringify({ error: 'Não encontrado' }));
}
const app = http.createServer(dashboardHandler);
if (require.main === module) {
  app.listen(PORT, () => console.log(`Dashboard disponível em http://localhost:${PORT}`));
  setInterval(() => refresh(true).catch(() => {}), HOUR);
}
module.exports = dashboardHandler;
