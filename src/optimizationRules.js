const READ_INTERVAL_MS = 400;
const WRITE_INTERVAL_MS = 1500;

function calculateRpl(frontendTicket, backendConversionRate, backendTicket) {
  return frontendTicket + backendConversionRate * backendTicket;
}

function classifyByCpa(cpa, rpl) {
  if (!Number.isFinite(cpa) || !Number.isFinite(rpl) || rpl <= 0) {
    return { decision: 'needs-information', percentage: 0 };
  }
  if (cpa <= rpl / 5) return { decision: 'scale', percentage: 25 };
  if (cpa <= rpl / 3) return { decision: 'scale', percentage: 15 };
  if (cpa <= rpl / 1.5) return { decision: 'maintain', percentage: 0 };
  if (cpa <= rpl) return { decision: 'watch', percentage: 0 };
  return { decision: 'decrease', percentage: 25 };
}

function evaluatePerformance({ linkClicks, purchases, cpa, rpl }) {
  if (!Number.isFinite(linkClicks) || linkClicks < 0 || !Number.isFinite(purchases) || purchases < 0) {
    return {
      decision: 'needs-information',
      requiresConfirmation: false,
      reason: 'Informe inline_link_clicks e purchases válidos para aplicar o gate de amostra.',
    };
  }

  const sample = classifyBySample(linkClicks, purchases);
  if (sample === 'ignore' || sample === 'wait') {
    return {
      decision: 'wait',
      requiresConfirmation: false,
      reason: 'A amostra ainda não é suficiente para uma decisão.',
    };
  }
  if (sample === 'winner-candidate') {
    return {
      decision: 'monitor',
      requiresConfirmation: false,
      reason: 'Há venda, mas ainda não há 100 cliques para aplicar escala ou redução.',
    };
  }
  if (sample === 'kill-candidate') {
    return {
      decision: 'kill-candidate',
      requiresConfirmation: true,
      reason: 'Há 100 ou mais cliques sem purchase. Pausa só pode ocorrer após confirmação.',
    };
  }

  const classification = classifyByCpa(cpa, rpl);
  if (classification.decision === 'needs-information') {
    return {
      decision: 'needs-information',
      requiresConfirmation: false,
      reason: 'Informe CPA e RPL efetivo positivos para classificar a performance.',
    };
  }
  return {
    ...classification,
    requiresConfirmation: classification.decision === 'scale' || classification.decision === 'decrease',
    reason: 'Recomendação calculada por CPA versus RPL; nenhuma alteração foi executada.',
  };
}

function assessAccountHealth({ accountStatus, disableReason = 0, hasFundingSource, balance = 0 }) {
  if (accountStatus !== 1 || disableReason !== 0 || !hasFundingSource) return 'CRITICAL';
  if (Number(balance) < 0) return 'WARN';
  return 'OK';
}

function canExecuteMutation({ health, explicitlyConfirmed }) {
  return health === 'OK' && explicitlyConfirmed === true;
}

function classifyBySample(linkClicks, purchases) {
  if (linkClicks < 30) return 'ignore';
  if (linkClicks < 100 && purchases === 0) return 'wait';
  if (linkClicks < 100 && purchases > 0) return 'winner-candidate';
  if (purchases === 0) return 'kill-candidate';
  return 'apply-framework';
}

function analysisWindow(ageInDays) {
  if (ageInDays < 7) return { primary: 'maximum', comparison: 'yesterday' };
  if (ageInDays <= 30) return { primary: 'last_7d', comparison: 'last_1d_vs_last_15d' };
  return { primary: 'last_7d,last_15d', comparison: 'last_3d_vs_last_15d' };
}

function encodeBudget(newReais, oldReais) {
  if (oldReais === null || oldReais === undefined) return Math.trunc(newReais * 100);
  const oldDecade = Math.round(oldReais / 10);
  return Math.trunc(newReais) * 100 + (oldDecade % 100);
}

function omniPurchases(insight = {}) {
  const purchases = (insight.actions || [])
    .filter((action) => action.action_type === 'omni_purchase')
    .reduce((total, action) => total + Number(action.value || 0), 0);
  const revenue = (insight.action_values || [])
    .filter((action) => action.action_type === 'omni_purchase')
    .reduce((total, action) => total + Number(action.value || 0), 0);
  return { purchases, revenue };
}

module.exports = {
  READ_INTERVAL_MS,
  WRITE_INTERVAL_MS,
  calculateRpl,
  classifyByCpa,
  classifyBySample,
  evaluatePerformance,
  assessAccountHealth,
  canExecuteMutation,
  analysisWindow,
  encodeBudget,
  omniPurchases,
};
