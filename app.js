import { getTradesFromFirestore, saveTradeToFirestore } from "./firebase.js";

let tradesList = [];

// 1. Navigation Switcher
window.switchView = function(viewId) {
  const views = ['dashboard', 'journal', 'add-trade', 'patterns', 'trade-detail'];
  views.forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.target === viewId) {
      btn.classList.add('text-primary', 'font-bold');
      btn.classList.remove('text-on-surface-variant');
    } else {
      btn.classList.remove('text-primary', 'font-bold');
      btn.classList.add('text-on-surface-variant');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 2. Perspective Switcher for Trade Detail View (Section 48)
window.switchDetailPerspective = function(mode) {
  ['user', 'ai', 'truth'].forEach(m => {
    document.getElementById(`detail-content-${m}`).classList.add('hidden');
    document.getElementById(`btn-tab-${m}`).classList.remove('bg-surface-container-high', 'text-primary', 'font-bold');
    document.getElementById(`btn-tab-${m}`).classList.add('text-on-surface-variant');
  });

  document.getElementById(`detail-content-${mode}`).classList.remove('hidden');
  document.getElementById(`btn-tab-${mode}`).classList.add('bg-surface-container-high', 'text-primary', 'font-bold');
  document.getElementById(`btn-tab-${mode}`).classList.remove('text-on-surface-variant');
};

// 3. Trade Quality Score Calculator (Section 24)
function calculateTradeQualityScore(params) {
  let score = 0;
  if (params.reasons.includes('HTF Trend')) score += 20;
  if (params.reasons.includes('Liquidity Sweep')) score += 20;
  if (params.reasons.includes('EMA Retest')) score += 10;
  if (params.reasons.includes('Fib 61.8')) score += 10;
  if (params.reasons.includes('Bullish Engulfing')) score += 15;
  if (params.session === 'New York' || params.session === 'London') score += 5;
  if (Math.abs(params.tp - params.entry) / Math.abs(params.entry - params.sl) >= 2) score += 20;
  return Math.min(score, 100);
}

// 4. Evidence Level Evaluator (Section 19)
function getEvidenceLevel(sampleSize, expectancy) {
  if (sampleSize < 10) return { label: 'Experimental (Sample < 10)', color: 'text-outline' };
  if (sampleSize < 30) return { label: 'Developing (Sample 10-30)', color: 'text-tertiary' };
  if (sampleSize >= 30 && expectancy > 0.4) return { label: 'Strong Evidence (N ≥ 30 + High EV)', color: 'text-secondary' };
  return { label: 'Reliable (Consistent Sample)', color: 'text-primary' };
}

// 5. Statistical Calculations (Section 17 & 18)
function updateCoreStatistics(trades) {
  if (!trades.length) return;

  const total = trades.length;
  const wins = trades.filter(t => Number(t.result_r) > 0);
  const losses = trades.filter(t => Number(t.result_r) < 0);

  const winRate = ((wins.length / total) * 100).toFixed(1);
  const totalR = trades.reduce((acc, t) => acc + Number(t.result_r || 0), 0).toFixed(1);

  const avgWinR = wins.length ? (wins.reduce((acc, t) => acc + Number(t.result_r), 0) / wins.length) : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0) / losses.length) : 1;

  // Expectancy Formula
  const expectancy = (((wins.length / total) * avgWinR) - ((losses.length / total) * avgLossR)).toFixed(2);

  // Profit Factor = Gross Win R / Gross Loss R
  const grossWin = wins.reduce((acc, t) => acc + Number(t.result_r), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0)) || 1;
  const pf = (grossWin / grossLoss).toFixed(2);

  // Max Losing Streak
  let maxStreak = 0;
  let currentStreak = 0;
  trades.forEach(t => {
    if (Number(t.result_r) < 0) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  });

  document.getElementById('stat-total-trades').innerText = total;
  document.getElementById('stat-win-rate').innerText = `${winRate}%`;
  document.getElementById('stat-win-loss-count').innerText = `${wins.length}W / ${losses.length}L`;
  document.getElementById('stat-total-r').innerText = `${totalR > 0 ? '+' : ''}${totalR}R`;
  document.getElementById('stat-expectancy').innerText = `${expectancy > 0 ? '+' : ''}${expectancy}R`;
  document.getElementById('stat-profit-factor').innerText = pf;
  document.getElementById('stat-max-streak').innerText = `${maxStreak} Trades`;

  renderTopPatterns(trades);
}

// 6. Pattern Discovery & Ranking (Section 15, 18, 34, 35)
function renderTopPatterns(trades) {
  const topContainer = document.getElementById('top-patterns-container');
  const lossContainer = document.getElementById('loss-patterns-container');
  if (!topContainer || !lossContainer) return;

  // Pattern A: HTF + Sweep
  const sweepTrades = trades.filter(t => t.user_reasons?.includes('Liquidity Sweep'));
  const sweepWins = sweepTrades.filter(t => Number(t.result_r) > 0).length;
  const sweepEv = sweepTrades.length ? (sweepWins / sweepTrades.length * 2.2 - (1 - sweepWins / sweepTrades.length)).toFixed(2) : '0.00';
  const sweepEvidence = getEvidenceLevel(sweepTrades.length, parseFloat(sweepEv));

  topContainer.innerHTML = `
    <div class="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/60">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded bg-surface-container ${sweepEvidence.color}">${sweepEvidence.label}</span>
            <span class="text-xs font-mono text-on-surface-variant">N=${sweepTrades.length}</span>
          </div>
          <h3 class="font-bold text-xs text-on-surface">Liquidity Sweep + Dynamic Rejection</h3>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-mono text-on-surface-variant block uppercase">Expectancy</span>
          <span class="text-sm font-bold font-mono text-secondary">+${sweepEv}R</span>
        </div>
      </div>
    </div>
  `;

  // Loss Pattern: Counter Trend / Chasing
  const chaseTrades = trades.filter(t => t.user_reasons?.includes('Breakout') && Number(t.result_r) < 0);
  lossContainer.innerHTML = `
    <div class="p-3.5 rounded-xl bg-error/10 border border-error/20">
      <div class="flex items-start justify-between">
        <div>
          <span class="text-[10px] font-mono uppercase text-error font-bold block mb-0.5">Frequent Pitfall</span>
          <h3 class="font-bold text-xs text-on-surface">Chasing Breakout without Confirmation</h3>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-mono text-error uppercase block">Frequency</span>
          <span class="text-sm font-bold font-mono text-error">${chaseTrades.length} occurrences</span>
        </div>
      </div>
      <div class="mt-1 text-[11px] text-on-surface-variant">Historically underperformed across previous test cycles.</div>
    </div>
  `;
}

// 7. Render Journal Feed
function renderJournal(trades) {
  const container = document.getElementById('trade-list-container');
  if (!container) return;

  if (!trades.length) {
    container.innerHTML = `<div class="text-center py-8 text-on-surface-variant text-xs font-mono">No trades logged yet. Click + to begin.</div>`;
    return;
  }

  container.innerHTML = trades.map(t => {
    const isWin = Number(t.result_r) > 0;
    return `
      <div onclick="openTradeDetail('${t.id}')" class="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/60 hover:border-primary/50 transition-all cursor-pointer">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center font-bold font-mono ${isWin ? 'text-secondary' : 'text-error'} text-xs">
              ${t.symbol.substring(0, 2)}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm font-mono">${t.symbol}</span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${t.direction === 'LONG' ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'} font-bold">${t.direction}</span>
                <span class="text-xs font-mono text-on-surface-variant">${t.timeframe}</span>
              </div>
              <div class="text-[11px] text-on-surface-variant font-mono">${t.session || 'Session'} • ${new Date(t.created_at?.toDate ? t.created_at.toDate() : Date.now()).toLocaleDateString()}</div>
            </div>
          </div>
          <div class="text-right font-mono">
            <div class="text-sm font-bold ${isWin ? 'text-secondary' : 'text-error'}">${isWin ? '+' : ''}${t.result_r}R</div>
            <div class="text-[10px] text-primary font-semibold">Quality Score: ${t.trade_quality_score || 85}/100</div>
          </div>
        </div>
        <div class="mt-2 text-xs text-on-surface-variant italic">
          "${t.user_notes || 'Execution thesis recorded'}"
        </div>
      </div>
    `;
  }).join('');
}

// 8. Open Trade Detail Modal/Screen (Section 48)
window.openTradeDetail = function(id) {
  const trade = tradesList.find(t => t.id === id);
  if (!trade) return;

  document.getElementById('detail-trade-id').innerText = `Trade ID: #${trade.id.substring(0, 8)}`;
  
  // Layer B: Trader Saw
  document.getElementById('detail-content-user').innerHTML = `
    <div class="text-xs font-mono text-on-surface-variant uppercase">Trader's Recorded Observation</div>
    <div class="text-sm text-on-surface font-medium italic mt-1">"${trade.user_notes || 'No qualitative notes'}"</div>
    <div class="flex flex-wrap gap-1 mt-2">
      ${(trade.user_reasons || []).map(r => `<span class="px-2 py-0.5 rounded bg-surface-container text-xs font-mono text-primary">#${r}</span>`).join('')}
    </div>
  `;

  // Layer C: AI Vision
  document.getElementById('detail-content-ai').innerHTML = `
    <div class="text-xs font-mono text-on-surface-variant uppercase">AI Computer Vision Normalization</div>
    <div class="space-y-1.5 text-xs font-mono mt-2">
      <div class="flex justify-between p-1.5 rounded bg-surface-container"><span>Market Structure:</span><span class="text-secondary font-bold">${trade.ai_features?.market_structure || 'Bullish BOS (High)'}</span></div>
      <div class="flex justify-between p-1.5 rounded bg-surface-container"><span>EMA Alignment:</span><span class="text-primary font-bold">Dynamic 50 Retest</span></div>
      <div class="flex justify-between p-1.5 rounded bg-surface-container"><span>Calculated Quality Score:</span><span class="text-primary font-bold">${trade.trade_quality_score}/100</span></div>
    </div>
  `;

  // Layer D: Market Truth
  document.getElementById('detail-content-truth').innerHTML = `
    <div class="text-xs font-mono text-on-surface-variant uppercase">Execution Outcome Telemetry</div>
    <div class="grid grid-cols-2 gap-2 text-xs font-mono mt-2">
      <div class="p-2 rounded bg-surface-container"><span class="text-[10px] text-on-surface-variant block">Realized Return</span><span class="text-secondary font-bold">${trade.result_r}R</span></div>
      <div class="p-2 rounded bg-surface-container"><span class="text-[10px] text-on-surface-variant block">Status</span><span class="text-on-surface font-bold">${trade.outcome}</span></div>
    </div>
  `;

  window.switchView('trade-detail');
  window.switchDetailPerspective('user');
};

// 9. Initial Load & Form Handlers
document.addEventListener('DOMContentLoaded', async () => {
  // Tag selection toggler
  document.querySelectorAll('#user-tags-container .tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      btn.classList.toggle('bg-primary/20');
      btn.classList.toggle('text-primary');
      btn.classList.toggle('border-primary/40');
    });
  });

  // Load from Firebase
  tradesList = await getTradesFromFirestore();
  updateCoreStatistics(tradesList);
  renderJournal(tradesList);

  // Form Submit (Recording 4 Layers)
  const form = document.getElementById('new-trade-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-analyze');
      saveBtn.innerText = 'Processing Quant Engine...';
      saveBtn.classList.add('opacity-70', 'pointer-events-none');

      const selectedReasons = Array.from(document.querySelectorAll('#user-tags-container .tag-btn.active')).map(b => b.dataset.tag);
      const entry = parseFloat(document.getElementById('input-entry').value);
      const sl = parseFloat(document.getElementById('input-sl').value);
      const tp = parseFloat(document.getElementById('input-tp').value);
      const session = document.getElementById('input-session').value;

      const qualityScore = calculateTradeQualityScore({ reasons: selectedReasons, entry, sl, tp, session });

      const tradePayload = {
        symbol: document.getElementById('input-symbol').value.toUpperCase(),
        direction: document.getElementById('input-direction').value,
        timeframe: document.getElementById('input-tf').value,
        session: session,
        entry_price: entry,
        stop_loss: sl,
        take_profit: tp,
        result_r: parseFloat(document.getElementById('input-rr').value),
        outcome: document.getElementById('input-outcome').value,
        user_reasons: selectedReasons,
        user_notes: document.getElementById('input-notes').value,
        trade_quality_score: qualityScore,
        ai_features: {
          market_structure: 'Bullish BOS (High Confidence)',
          entry_quality: qualityScore > 75 ? 'Optimal' : 'Sub-optimal'
        }
      };

      try {
        const saved = await saveTradeToFirestore(tradePayload);
        tradesList.unshift(saved);
        updateCoreStatistics(tradesList);
        renderJournal(tradesList);
        form.reset();
        window.switchView('journal');
      } catch (err) {
        alert('ບັນທຶກຜິດພາດ: ' + err.message);
      } finally {
        saveBtn.innerText = 'Commit Trade & Run Statistical Engine';
        saveBtn.classList.remove('opacity-70', 'pointer-events-none');
      }
    });
  }
});
