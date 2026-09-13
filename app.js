import { getTradesFromFirestore, saveTradeToFirestore } from "./firebase.js";

let tradesList = [];

// 1. ສະຫຼັບໜ້າຈໍ (Navigation)
window.switchView = function(viewId) {
  const views = ['dashboard', 'journal', 'add-trade'];
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

// 2. ຄິດໄລ່ສະຖິຕິຕາມ Master System Prompt
function updateStatistics(trades) {
  if (!trades || trades.length === 0) return;

  const total = trades.length;
  const wins = trades.filter(t => Number(t.result_r) > 0);
  const losses = trades.filter(t => Number(t.result_r) < 0);

  const winRate = ((wins.length / total) * 100).toFixed(1);
  const totalR = trades.reduce((acc, t) => acc + Number(t.result_r || 0), 0).toFixed(1);
  
  const avgWinR = wins.length ? (wins.reduce((acc, t) => acc + Number(t.result_r), 0) / wins.length) : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0) / losses.length) : 1;

  // Expectancy = (Win Rate × Avg Win R) - (Loss Rate × Avg Loss R)
  const expectancy = (((wins.length / total) * avgWinR) - ((losses.length / total) * avgLossR)).toFixed(2);

  document.getElementById('stat-total-trades').innerText = total;
  document.getElementById('stat-win-rate').innerText = `${winRate}% (${wins.length}W / ${losses.length}L)`;
  document.getElementById('stat-total-r').innerText = `${totalR > 0 ? '+' : ''}${totalR}R`;
  document.getElementById('stat-expectancy').innerText = `${expectancy > 0 ? '+' : ''}${expectancy}R`;
}

// 3. ສະແດງລາຍການ Trade Feed
function renderTrades(trades) {
  const container = document.getElementById('trade-list-container');
  if (!container) return;

  if (trades.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-on-surface-variant text-xs font-mono">
        ຍັງບໍ່ມີຂໍ້ມູນການເທຣດ. ກົດປຸ່ມ + ເພື່ອເລີ່ມຕົ້ນບັນທຶກ.
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map(t => {
    const isWin = Number(t.result_r) > 0;
    const dateStr = t.created_at?.toDate ? t.created_at.toDate().toLocaleDateString() : 'Just now';
    return `
      <div class="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/60 hover:border-primary/50 transition-all">
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
              <div class="text-[11px] text-on-surface-variant font-mono">${dateStr}</div>
            </div>
          </div>
          <div class="text-right font-mono">
            <div class="text-sm font-bold ${isWin ? 'text-secondary' : 'text-error'}">${isWin ? '+' : ''}${t.result_r}R</div>
            <div class="text-[10px] text-primary font-semibold">Score: ${t.ai_edge_score || 88}/100</div>
          </div>
        </div>
        <div class="mt-2 text-xs text-on-surface-variant italic">
          "${t.user_notes || 'No execution notes'}"
        </div>
      </div>
    `;
  }).join('');
}

// 4. ເລີ່ມຕົ້ນໂຫຼດແອັບ
document.addEventListener('DOMContentLoaded', async () => {
  tradesList = await getTradesFromFirestore();
  updateStatistics(tradesList);
  renderTrades(tradesList);

  // Form Submit
  const form = document.getElementById('new-trade-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-analyze');
      saveBtn.innerText = 'ກຳລັງບັນທຶກເຂົ້າ Firebase...';
      saveBtn.classList.add('opacity-70', 'pointer-events-none');

      const newTrade = {
        symbol: document.getElementById('input-symbol').value.toUpperCase(),
        direction: document.getElementById('input-direction').value,
        timeframe: document.getElementById('input-tf').value,
        result_r: parseFloat(document.getElementById('input-rr').value),
        outcome: parseFloat(document.getElementById('input-rr').value) > 0 ? 'WIN' : 'LOSS',
        user_notes: document.getElementById('input-notes').value,
        ai_edge_score: Math.floor(Math.random() * 15) + 85
      };

      try {
        const saved = await saveTradeToFirestore(newTrade);
        tradesList.unshift(saved);
        updateStatistics(tradesList);
        renderTrades(tradesList);
        form.reset();
        window.switchView('journal');
      } catch (err) {
        alert('ບັນທຶກຜິດພາດ: ' + err.message);
      } finally {
        saveBtn.innerText = 'Commit Trade & Run AI Engine';
        saveBtn.classList.remove('opacity-70', 'pointer-events-none');
      }
    });
  }
});
