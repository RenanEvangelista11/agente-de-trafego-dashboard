// Dashboard somente de leitura. Tokens existem apenas nas variáveis de ambiente do servidor.
require('dotenv').config({ quiet: true });
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const API_VERSION = 'v24.0';
const CACHE_MS = 60 * 1000;
const GOOGLE_ADS_SHEET_ID = '1OBnw1IKSvhshT4bj6dsEw7oSX-6O6aig8z_zeF_JrAQ';
const GOOGLE_ADS_SHEET_NAME = 'Google ADs';
// Mantém a função de leitura da planilha em uma revisão distinta no deploy.
const GOOGLE_ADS_CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_ADS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(GOOGLE_ADS_SHEET_NAME)}`;
const ACCOUNT_IDS = [...new Set((process.env.META_DASHBOARD_ACCOUNT_IDS || 'act_1517457355761281,act_334556975977002,act_1026817869972346,act_3833965353594165').split(',').map(v => v.trim()).filter(Boolean).map(v => v.startsWith('act_') ? v : `act_${v}`))];
const meta = axios.create({ baseURL: `https://graph.facebook.com/${API_VERSION}`, httpsAgent: new https.Agent({ family: 4 }), timeout: 25000 });
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const n = value => Number(value || 0);
const action = (actions, type) => n((actions || []).find(item => item.action_type === type)?.value);
const ratio = (a, b) => b ? a / b : null;
let cache = { key: null, at: 0, data: null, loading: null };
let googleAdsCache = { key: null, at: 0, data: null, loading: null };
const SESSION_SECONDS = 12 * 60 * 60;

function dateRange(since, until) {
  const date = value => value.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const today = date(new Date()); const thirtyDaysAgo = date(new Date(Date.now() - 29 * 86400000));
  return { since: /^\d{4}-\d{2}-\d{2}$/.test(since || '') ? since : thirtyDaysAgo, until: /^\d{4}-\d{2}-\d{2}$/.test(until || '') ? until : today };
}
function metrics() { return { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, purchases: 0, results: 0, purchaseValue: 0 }; }
function add(target, source) { Object.keys(target).forEach(key => { target[key] += n(source[key]); }); }
function hasData(value) { return Object.values(value).some(metric => n(metric) !== 0); }
function finalise(value) { return { ...value, ctr: ratio(value.clicks, value.impressions), cpm: value.impressions ? value.spend / value.impressions * 1000 : null, cpc: ratio(value.spend, value.clicks), cpl: ratio(value.spend, value.leads), cpp: ratio(value.spend, value.purchases), cpr: ratio(value.spend, value.results), frequency: ratio(value.impressions, value.reach), roas: ratio(value.purchaseValue, value.spend) }; }
function csvRows(text) {
  const rows = [], row = []; let value = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row.splice(0)); value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function sheetNumber(value) {
  const raw = String(value ?? '').replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const normalised = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return n(normalised);
}
function sheetColumn(headers, name) { return headers.findIndex(header => String(header || '').trim().toLowerCase() === name.toLowerCase()); }
function googleAdsFailure() {
  return { source: 'Planilha Google Ads', available: false, currency: 'BRL', campaigns: [], adGroups: [], daily: [], metrics: finalise(metrics()), resultLabel: 'Conversões Google Ads', limitation: 'A planilha Google Ads não pôde ser atualizada neste momento. Os dados da Meta permanecem disponíveis separadamente.' };
}
async function loadGoogleAds(range, force) {
  const key = `${range.since}|${range.until}`;
  if (!force && googleAdsCache.data && googleAdsCache.key === key && Date.now() - googleAdsCache.at < CACHE_MS) return googleAdsCache.data;
  if (googleAdsCache.loading) return googleAdsCache.loading;
  googleAdsCache.loading = axios.get(GOOGLE_ADS_CSV_URL, { httpsAgent: new https.Agent({ family: 4 }), timeout: 25000, responseType: 'text' }).then(response => {
    const rows = csvRows(response.data || []);
    const headers = rows.shift() || [];
    const dayIndex = sheetColumn(headers, 'Day'), campaignIndex = sheetColumn(headers, 'Campaign Name'), groupIndex = sheetColumn(headers, 'Ad Group Name');
    const spendIndex = sheetColumn(headers, 'Cost (Spend)'), impressionsIndex = sheetColumn(headers, 'Impressions'), clicksIndex = sheetColumn(headers, 'Clicks'), conversionsIndex = sheetColumn(headers, 'Conversions');
    if ([dayIndex, campaignIndex, spendIndex, impressionsIndex, clicksIndex, conversionsIndex].some(index => index < 0)) throw new Error('Colunas obrigatórias não encontradas na planilha.');
    const total = metrics(), byCampaign = new Map(), byAdGroup = new Map(), byDay = new Map();
    for (const source of rows) {
      const date = String(source[dayIndex] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < range.since || date > range.until) continue;
      const values = { spend: sheetNumber(source[spendIndex]), impressions: sheetNumber(source[impressionsIndex]), clicks: sheetNumber(source[clicksIndex]), results: sheetNumber(source[conversionsIndex]) };
      const campaign = String(source[campaignIndex] || '(sem campanha)');
      const adGroup = groupIndex < 0 ? '(grupo de anúncios não informado)' : String(source[groupIndex] || '(grupo de anúncios não informado)');
      add(total, values);
      if (!byCampaign.has(campaign)) byCampaign.set(campaign, { name: campaign, values: metrics() });
      add(byCampaign.get(campaign).values, values);
      const groupKey = `${campaign}\u0000${adGroup}`;
      if (!byAdGroup.has(groupKey)) byAdGroup.set(groupKey, { campaign, name: adGroup, values: metrics() });
      add(byAdGroup.get(groupKey).values, values);
      if (!byDay.has(date)) byDay.set(date, metrics());
      add(byDay.get(date), values);
    }
    const mapRows = rowsMap => [...rowsMap.values()].filter(row => hasData(row.values)).map(row => ({ ...row, ...finalise(row.values), resultLabel: 'Conversões Google Ads' })).sort((a, b) => b.spend - a.spend);
    const data = {
      source: 'Planilha Google Ads', available: true, currency: 'BRL', resultLabel: 'Conversões Google Ads',
      metrics: finalise(total), campaigns: mapRows(byCampaign), adGroups: mapRows(byAdGroup),
      daily: [...byDay.entries()].filter(([, values]) => hasData(values)).map(([date, values]) => ({ date, ...finalise(values) })).sort((a, b) => a.date.localeCompare(b.date)),
      limitation: 'A planilha não possui coluna de alcance, moeda ou dados de anúncio; custos são exibidos em BRL conforme a configuração deste dashboard.',
    };
    googleAdsCache = { key, at: Date.now(), data, loading: null }; return data;
  }).catch(() => { const data = googleAdsFailure(); googleAdsCache = { key, at: Date.now(), data, loading: null }; return data; });
  return googleAdsCache.loading;
}
function health(account) { if (n(account.account_status) !== 1 || n(account.disable_reason) !== 0 || !account.funding_source_details) return 'CRITICAL'; return n(account.balance) < 0 ? 'WARN' : 'OK'; }
function campaignCategory(campaign, adsets) {
  const destinations = new Set(adsets.map(row => String(row.destination_type || '').toUpperCase()));
  if (destinations.has('WHATSAPP')) return 'Mensagens · WhatsApp';
  if (['MESSENGER', 'INSTAGRAM_DIRECT'].some(value => destinations.has(value))) return 'Mensagens';
  const objective = String(campaign.objective || '').toUpperCase();
  if (objective.includes('LEAD')) return 'Leads';
  if (objective.includes('TRAFFIC') || objective.includes('LINK_CLICKS') || objective.includes('WEBSITE_CLICKS')) return 'Tráfego';
  if (objective.includes('SALES') || objective.includes('CONVERSION')) return 'Vendas';
  if (objective.includes('AWARENESS') || objective.includes('BRAND_AWARENESS') || objective.includes('REACH')) return 'Reconhecimento';
  if (objective.includes('ENGAGEMENT') || objective.includes('POST_ENGAGEMENT') || objective.includes('PAGE_LIKES')) return 'Engajamento';
  if (objective.includes('APP')) return 'Aplicativo';
  return campaign.objective || 'Sem objetivo informado pela Meta';
}
function resultDefinition(category) {
  const definitions = {
    'Mensagens · WhatsApp': { label: 'Conversas no WhatsApp', actions: ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'] },
    Mensagens: { label: 'Conversas iniciadas', actions: ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply'] },
    Leads: { label: 'Leads Meta', actions: ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped'] },
    Tráfego: { label: 'PageViews / cliques de link', actions: ['landing_page_view', 'link_click'] },
    Vendas: { label: 'Compras', actions: ['omni_purchase'] },
    Engajamento: { label: 'Engajamentos', actions: ['post_engagement', 'page_engagement'] },
    Reconhecimento: { label: 'Alcance', actions: [] },
  };
  return definitions[category] || { label: 'Resultado Meta', actions: [] };
}
function primaryResult(category, actions, reach, clicks) {
  const definition = resultDefinition(category);
  if (category === 'Reconhecimento') return { label: definition.label, value: reach };
  for (const actionType of definition.actions) {
    const found = (actions || []).find(item => item.action_type === actionType);
    if (found) return { label: definition.label, value: n(found.value) };
  }
  if (category === 'Tráfego') return { label: definition.label, value: clicks };
  return { label: definition.label, value: 0 };
}
function passwordFor(accountId) { return process.env[`DASHBOARD_PASSWORD_${accountId.toUpperCase()}`] || ''; }
function cookieName(accountId) { return `meta_dashboard_${accountId.replace(/[^A-Za-z0-9]/g, '_')}`; }
function sign(value) { return crypto.createHmac('sha256', process.env.DASHBOARD_AUTH_SECRET || '').update(value).digest('base64url'); }
function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left || ''); const rightBuffer = Buffer.from(right || '');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
function cookieValue(req, name) {
  const pair = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}
function hasSession(req, accountId) {
  if (!process.env.DASHBOARD_AUTH_SECRET) return false;
  const value = cookieValue(req, cookieName(accountId)); const [id, expiresAt, signature] = value.split('.');
  const payload = `${id}.${expiresAt}`;
  return id === accountId && Number(expiresAt) > Date.now() && secureEqual(signature, sign(payload));
}
function sessionCookie(accountId) {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000; const payload = `${accountId}.${expiresAt}`;
  return `${cookieName(accountId)}=${encodeURIComponent(`${payload}.${sign(payload)}`)}; Max-Age=${SESSION_SECONDS}; Path=/api/dashboard; HttpOnly; Secure; SameSite=Strict`;
}
async function requestBody(req) {
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('Corpo da solicitação excede o limite.'); }
  return JSON.parse(body || '{}');
}

async function pages(endpoint, params) {
  let after; const output = [];
  do {
    const response = await meta.get(endpoint, { params: { ...params, ...(after ? { after } : {}), access_token: process.env.META_ACCESS_TOKEN } });
    output.push(...(response.data.data || [])); after = response.data.paging?.cursors?.after;
    if (after) await sleep(450);
  } while (after);
  return output;
}
async function loadAccount(id, range, info) {
  if (info.health === 'CRITICAL') return { ...info, metrics: finalise(metrics()), campaigns: [], objectives: [], daily: [], limitation: 'Health check CRITICAL: métricas não foram consultadas para esta conta.' };
  const campaignRows = await pages(`/${id}/campaigns`, { fields: 'id,name,objective,effective_status,status', limit: 500 }); await sleep(450);
  const adsetRows = await pages(`/${id}/adsets`, { fields: 'campaign_id,destination_type,optimization_goal,effective_status,status', limit: 500 }); await sleep(450);
  const adsetsByCampaign = new Map();
  for (const adset of adsetRows) {
    if (!adsetsByCampaign.has(adset.campaign_id)) adsetsByCampaign.set(adset.campaign_id, []);
    adsetsByCampaign.get(adset.campaign_id).push(adset);
  }
  const campaignsById = new Map(campaignRows.map(row => [row.id, {
    id: row.id, name: row.name || '(sem nome)', objective: campaignCategory(row, adsetsByCampaign.get(row.id) || []),
    status: row.effective_status || row.status || 'UNKNOWN',
  }]));
  const campaignInsightFields = 'date_start,campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,actions,action_values';
  const adInsightFields = 'date_start,campaign_id,campaign_name,ad_id,ad_name,spend,impressions,reach,inline_link_clicks,actions,action_values';
  const insightRows = await pages(`/${id}/insights`, { level: 'campaign', time_increment: 1, time_range: JSON.stringify(range), fields: campaignInsightFields, limit: 500 }); await sleep(450);
  // Criativos não precisam de quebra diária: uma linha por anúncio reduz a paginação sem mudar o filtro de data.
  const adInsightRows = await pages(`/${id}/insights`, { level: 'ad', time_increment: 'all_days', time_range: JSON.stringify(range), fields: adInsightFields, limit: 500 });
  const total = metrics(), byCampaign = new Map(), byCreative = new Map(), byDay = new Map();
  for (const source of insightRows) {
    const campaign = campaignsById.get(source.campaign_id) || { id: source.campaign_id || '', name: source.campaign_name || '(sem campanha)', objective: 'Sem objetivo informado pela Meta', status: 'UNKNOWN' }; const key = campaign.id || campaign.name;
    const result = primaryResult(campaign.objective, source.actions, n(source.reach), n(source.inline_link_clicks));
    const row = { spend: n(source.spend), impressions: n(source.impressions), reach: n(source.reach), clicks: n(source.inline_link_clicks), leads: action(source.actions, 'lead'), purchases: action(source.actions, 'omni_purchase'), results: result.value, purchaseValue: action(source.action_values, 'omni_purchase') };
    add(total, row);
    if (!byCampaign.has(key)) byCampaign.set(key, { ...campaign, values: metrics() }); add(byCampaign.get(key).values, row);
    const dailyKey = `${source.date_start}|${campaign.objective}`;
    if (!byDay.has(dailyKey)) byDay.set(dailyKey, { objective: campaign.objective, values: metrics() }); add(byDay.get(dailyKey).values, row);
  }
  for (const source of adInsightRows) {
    const campaign = campaignsById.get(source.campaign_id) || { id: source.campaign_id || '', name: source.campaign_name || '(sem campanha)', objective: 'Sem objetivo informado pela Meta', status: 'UNKNOWN' };
    const result = primaryResult(campaign.objective, source.actions, n(source.reach), n(source.inline_link_clicks));
    const row = { spend: n(source.spend), impressions: n(source.impressions), reach: n(source.reach), clicks: n(source.inline_link_clicks), leads: action(source.actions, 'lead'), purchases: action(source.actions, 'omni_purchase'), results: result.value, purchaseValue: action(source.action_values, 'omni_purchase') };
    const key = `${campaign.id || campaign.name}|${source.ad_id || source.ad_name || '(sem criativo)'}`;
    if (!byCreative.has(key)) byCreative.set(key, { ...campaign, id: source.ad_id || '', name: source.ad_name || '(sem criativo)', campaign: campaign.name, campaignId: campaign.id || '', values: metrics() });
    add(byCreative.get(key).values, row);
  }
  const campaigns = [...byCampaign.values()].filter(row => hasData(row.values)).map(row => ({ ...row, ...finalise(row.values), resultLabel: resultDefinition(row.objective).label })).sort((a, b) => b.spend - a.spend);
  const creatives = [...byCreative.values()].filter(row => hasData(row.values)).map(row => ({ ...row, ...finalise(row.values), resultLabel: resultDefinition(row.objective).label })).sort((a, b) => b.spend - a.spend);
  return { ...info, metrics: finalise(total), campaigns, creatives, objectives: [...new Set(campaigns.map(row => row.objective))].sort((a, b) => a.localeCompare(b, 'pt-BR')), daily: [...byDay.entries()].filter(([, row]) => hasData(row.values)).map(([key, row]) => ({ date: key.split('|')[0], objective: row.objective, ...finalise(row.values) })).sort((a, b) => a.date.localeCompare(b.date)), limitation: info.currency && info.currency !== 'BRL' ? `A moeda da conta é ${info.currency}; valores em BRL não foram convertidos.` : null };
}
async function dashboard(since, until, requestedAccount) {
  if (!process.env.META_ACCESS_TOKEN) throw new Error('A integração Meta não está configurada no servidor.');
  const range = dateRange(since, until), accounts = [];
  if (requestedAccount && !ACCOUNT_IDS.includes(requestedAccount)) throw new Error('Conta não permitida neste dashboard.');
  const ids = requestedAccount ? [requestedAccount] : ACCOUNT_IDS;
  const accessible = await pages('/me/adaccounts', { fields: 'id,name,currency,account_status,disable_reason,funding_source_details,balance,spend_cap', limit: 100 });
  const byId = new Map(accessible.map(row => [row.id, { id: row.id, name: row.name || row.id, currency: row.currency || null, health: health(row) }]));
  for (const id of ids) {
    const info = byId.get(id) || { id, name: id, currency: null, health: 'CRITICAL' };
    accounts.push(await loadAccount(id, range, info)); await sleep(450);
  }
  return { source: 'Meta Ads API', range, generatedAt: new Date().toISOString(), refreshIntervalSeconds: 60, accounts };
}
async function getData(force, since, until, accountId, includeGoogleAds = false) {
  const range = dateRange(since, until), key = `${range.since}|${range.until}|${accountId || 'all'}`;
  const metaData = (!force && cache.data && cache.key === key && Date.now() - cache.at < CACHE_MS)
    ? cache.data
    : cache.loading
      ? cache.loading
      : (cache.loading = dashboard(range.since, range.until, accountId).then(data => { cache = { key, at: Date.now(), data, loading: null }; return data; }).catch(error => { cache.loading = null; throw error; }));
  const data = await metaData;
  return includeGoogleAds ? { ...data, googleAds: await loadGoogleAds(range, force) } : data;
}
function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers }); res.end(body); }
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/session' && req.method === 'POST') {
    try {
      const { account, password } = await requestBody(req);
      if (!ACCOUNT_IDS.includes(account) || !process.env.DASHBOARD_AUTH_SECRET || !passwordFor(account) || !secureEqual(String(password), passwordFor(account))) return send(res, 401, JSON.stringify({ error: 'Senha inválida.' }));
      return send(res, 204, '', 'text/plain; charset=utf-8', { 'Set-Cookie': sessionCookie(account) });
    } catch (_) { return send(res, 400, JSON.stringify({ error: 'Solicitação inválida.' })); }
  }
  if (url.pathname === '/api/dashboard') {
    const accountId = url.searchParams.get('account');
    if (!ACCOUNT_IDS.includes(accountId || '') || !hasSession(req, accountId)) return send(res, 401, JSON.stringify({ error: 'Autenticação necessária.' }));
    try { return send(res, 200, JSON.stringify(await getData(url.searchParams.get('refresh') === '1', url.searchParams.get('since'), url.searchParams.get('until'), accountId))); } catch (error) { return send(res, 502, JSON.stringify({ error: 'Não foi possível atualizar os dados da Meta.', detail: error.message })); }
  }
  if (url.pathname === '/clientes') return send(res, 200, '<!doctype html><title>Acesso restrito</title><p>Acesso restrito. Use o link individual do seu dashboard.</p>', 'text/html; charset=utf-8');
  if (url.pathname === '/client-dashboard' || url.pathname.startsWith('/clientes/')) return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'public', 'client-dashboard.html')), 'text/html; charset=utf-8');
  if (['/', '/dashboard', '/meta-dashboard', '/meta-dashboard.html'].includes(url.pathname)) return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'public', 'meta-dashboard.html')), 'text/html; charset=utf-8');
  return send(res, 404, JSON.stringify({ error: 'Não encontrado' }));
}
function publicClientHandler(accountId, options = {}) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method && req.method !== 'GET') return send(res, 405, JSON.stringify({ error: 'Método não permitido.' }));
    try { return send(res, 200, JSON.stringify(await getData(url.searchParams.get('refresh') === '1', url.searchParams.get('since'), url.searchParams.get('until'), accountId, options.googleAds === true))); }
    catch (error) { return send(res, 502, JSON.stringify({ error: 'Não foi possível atualizar os dados da Meta.', detail: error.message })); }
  };
}
function googleAdsHandler() {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method && req.method !== 'GET') return send(res, 405, JSON.stringify({ error: 'Método não permitido.' }));
    const range = dateRange(url.searchParams.get('since'), url.searchParams.get('until'));
    return send(res, 200, JSON.stringify({ source: 'Planilha Google Ads', range, generatedAt: new Date().toISOString(), refreshIntervalSeconds: 60, googleAds: await loadGoogleAds(range, url.searchParams.get('refresh') === '1') }));
  };
}
if (require.main === module) http.createServer(handler).listen(Number(process.env.DASHBOARD_PORT || 3030), () => console.log('Dashboard disponível em http://localhost:3030'));
module.exports = { handler, publicClientHandler, googleAdsHandler };
