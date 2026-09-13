import { getTradesFromFirestore, saveTradeToFirestore, uploadScreenshot } from "./firebase.js";

// Global App State
let tradesList = [];
let currentOutcome = 'WIN';
let fileBefore = null;
let fileAfter = null;

// ================= 1. EXPOSE FUNCTIONS TO GLOBAL WINDOW (Fix: switchView & selectOutcome not defined) =================
window.switchView = function(viewId) {
  const views = ['dashboard', 'journal', 'add-trade', 'patterns'];
  views.forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.remove('hidden');

  // ອັບເດດສີ Bottom Nav Bar
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

window.selectOutcome = function(type) {
  currentOutcome = type;
  const btnWin = document.getElementById('btn-outcome-win');
  const btnLoss = document.getElementById('btn-outcome-loss');
  const btnBe = document.getElementById('btn-outcome-be');

  if (!btnWin || !btnLoss || !btnBe) return;

  [btnWin, btnLoss, btnBe].forEach(b => {
    b.className = 'outcome-btn py-3 rounded-xl border border-transparent bg-surface-container text-on-surface-variant font-bold font-mono text-sm transition-all';
  });

  if (type === 'WIN') {
    btnWin.className = 'outcome-btn py-3 rounded-xl border border-secondary/40 bg-secondary text-surface font-bold font-mono text-sm shadow-md';
  } else if (type === 'LOSS') {
    btnLoss.className = 'outcome-btn py-3 rounded-xl border border-error/40 bg-error text-white font-bold font-mono text-sm shadow-md';
  } else {
    btnBe.className = 'outcome-btn py-3 rounded-xl border border-outline bg-surface-container-high text-on-surface font-bold font-mono text-sm shadow-md';
  }

  calculateAutoR();
};

// ================= 2. AUTO R-CALCULATION =================
function calculateAutoR() {
  const entryEl = document.getElementById('trade-entry');
  const slEl = document.getElementById('trade-sl');
  const tpEl = document.getElementById('trade-tp');
  const rrText = document.getElementById('calculated-rr-text');
  const badge = document.getElementById('realized-r-badge');

  if (!entryEl || !slEl || !tpEl || !rrText || !badge) return;

  const entry = parseFloat(entryEl.value) || 0;
  const sl = parseFloat(slEl.value) || 0;
  const tp = parseFloat(tpEl.value) || 0;

  const riskPoints = Math.abs(entry - sl);
  const rewardPoints = Math.abs(tp - entry);

  if (riskPoints === 0) return;

  const ratio = (rewardPoints / riskPoints).toFixed(1);
  rrText.innerText = `Risk: ${riskPoints.toFixed(1)} pts | Reward: ${rewardPoints.toFixed(1)} pts (1:${ratio})`;

  if (currentOutcome === 'WIN') {
    badge.innerText = `+${ratio}R`;
    badge.className = 'text-xl font-bold text-secondary';
  } else if (currentOutcome === 'LOSS') {
    badge.innerText = `-1.0R`;
    badge.className = 'text-xl font-bold text-error';
  } else {
    badge.innerText = `0.0R`;
    badge.className = 'text-xl font-bold text-on-surface-variant';
  }
}

// ================= 3. CORE STATISTICS (Fix: updateCoreStatistics is not defined) =================
function updateCoreStatistics(trades) {
  const statTotal = document.getElementById('stat-total-trades');
  const statWr = document.getElementById('stat-win-rate');
  const statWl = document.getElementById('stat-win-loss-count');
  const statTotalR = document.getElementById('stat-total-r');
  const statEv = document.getElementById('stat-expectancy');
  const statPf = document.getElementById('stat-profit-factor');
  const statStreak = document.getElementById('stat-max-streak');

  if (!statTotal) return;

  if (!trades || trades.length === 0) {
    statTotal.innerText = '0';
    statWr.innerText = '0%';
    if (statWl) statWl.innerText = '0W / 0L';
    statTotalR.innerText = '+0.0R';
    statEv.innerText = '+0.00R';
    if (statPf) statPf.innerText = '0.00';
    if (statStreak) statStreak.innerText = '0';
    return;
  }

  const total = trades.length;
  const wins = trades.filter(t => Number(t.result_r) > 0);
  const losses = trades.filter(t => Number(t.result_r) < 0);

  const winRate = ((wins.length / total) * 100).toFixed(1);
  const totalR = trades.reduce((acc, t) => acc + Number(t.result_r || 0), 0).toFixed(1);

  const avgWinR = wins.length ? (wins.reduce((acc, t) => acc + Number(t.result_r), 0) / wins.length) : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0) / losses.length) : 1;

  // Expectancy = (Win% * AvgWinR) - (Loss% * AvgLossR)
  const expectancy = (((wins.length / total) * avgWinR) - ((losses.length / total) * avgLossR)).toFixed(2);

  // Profit Factor
  const grossWin = wins.reduce((acc, t) => acc + Number(t.result_r), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0)) || 1;
  const pf = (grossWin / grossLoss).toFixed(2);

  // Max Losing Streak
  let maxStreak = 0;
  let curStreak = 0;
  trades.forEach(t => {
    if (Number(t.result_r) < 0) {
      curStreak++;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else {
      curStreak = 0;
    }
  });

  statTotal.innerText = total;
  statWr.innerText = `${winRate}%`;
  if (statWl) statWl.innerText = `${wins.length}W / ${losses.length}L`;
  statTotalR.innerText = `${Number(totalR) >= 0 ? '+' : ''}${totalR}R`;
  statEv.innerText = `${Number(expectancy) >= 0 ? '+' : ''}${expectancy}R`;
  if (statPf) statPf.innerText = pf;
  if (statStreak) statStreak.innerText = maxStreak;
}

// ================= 4. RENDER TRADE JOURNAL =================
function renderJournal(trades) {
  const container = document.getElementById('trade-list-container');
  if (!container) return;

  if (!trades || trades.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-on-surface-variant text-xs font-mono">
        ຍັງບໍ່ມີຂໍ້ມູນການເທຣດ. ກົດປຸ່ມ + ເພື່ອເລີ່ມຕົ້ນບັນທຶກ.
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map((t, idx) => {
    const isWin = Number(t.result_r) > 0;
    const dateStr = t.created_at?.toDate ? t.created_at.toDate().toLocaleDateString() : 'Just now';
    return `
      <div class="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high/60 hover:border-primary/50 transition-all">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center font-bold font-mono ${isWin ? 'text-secondary' : 'text-error'} text-xs">
              ${(t.symbol || 'TR').substring(0, 2)}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm font-mono">${t.symbol}</span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${t.direction === 'LONG' ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'} font-bold">${t.direction}</span>
                <span class="text-xs font-mono text-on-surface-variant">${t.timeframe || 'M15'}</span>
              </div>
              <div class="text-[11px] text-on-surface-variant font-mono">${dateStr}</div>
            </div>
          </div>
          <div class="text-right font-mono">
            <div class="text-sm font-bold ${isWin ? 'text-secondary' : 'text-error'}">${isWin ? '+' : ''}${t.result_r}R</div>
            <div class="text-[10px] text-primary font-semibold">Trade #${trades.length - idx}</div>
          </div>
        </div>
        <div class="mt-2 text-xs text-on-surface-variant italic">
          "${t.user_notes || (t.user_reasons ? t.user_reasons.join(', ') : 'No notes logged')}"
        </div>
      </div>
    `;
  }).join('');
}

// ================= 5. DRAG & DROP AND PASTE (CTRL+V) =================
function setupDropzones() {
  const dropBefore = document.getElementById('dropzone-before');
  const dropAfter = document.getElementById('dropzone-after');
  const inputBefore = document.getElementById('file-before');
  const inputAfter = document.getElementById('file-after');

  if (!dropBefore || !dropAfter) return;

  dropBefore.addEventListener('click', () => inputBefore.click());
  dropAfter.addEventListener('click', () => inputAfter.click());

  inputBefore.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'before'));
  inputAfter.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'after'));

  [dropBefore, dropAfter].forEach((zone, idx) => {
    const type = idx === 0 ? 'before' : 'after';
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('border-primary', 'bg-surface-container');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('border-primary', 'bg-surface-container');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('border-primary', 'bg-surface-container');
      if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0], type);
      }
    });
  });

  // Global Ctrl+V / Cmd+V
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (!fileBefore) {
          handleFileSelect(file, 'before');
        } else {
          handleFileSelect(file, 'after');
        }
        break;
      }
    }
  });
}

function handleFileSelect(file, type) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById(`preview-${type}`);
    const prompt = document.getElementById(`prompt-${type}`);
    if (preview && prompt) {
      preview.querySelector('img').src = e.target.result;
      preview.classList.remove('hidden');
      prompt.classList.add('hidden');
    }

    if (type === 'before') {
      fileBefore = file;
      calculateAutoR();
    } else {
      fileAfter = file;
    }
  };
  reader.readAsDataURL(file);
}

// ================= 6. QUICK SAVE & LOOP INITIALIZATION =================
function setupQuickSave() {
  const saveBtn = document.getElementById('btn-save-quick');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    saveBtn.innerText = 'Analyzing & Saving...';
    saveBtn.classList.add('opacity-70', 'pointer-events-none');

    const selectedReasons = Array.from(document.querySelectorAll('#quick-tags-container .q-tag-btn.active')).map(b => b.dataset.tag);
    const entry = parseFloat(document.getElementById('trade-entry').value) || 0;
    const sl = parseFloat(document.getElementById('trade-sl').value) || 0;
    const tp = parseFloat(document.getElementById('trade-tp').value) || 0;
    const realizedR = parseFloat(document.getElementById('realized-r-badge').innerText.replace('R', '').replace('+', '')) || 0;

    let imgBeforeUrl = null;
    let imgAfterUrl = null;
    if (fileBefore) imgBeforeUrl = await uploadScreenshot(fileBefore, 'before');
    if (fileAfter) imgAfterUrl = await uploadScreenshot(fileAfter, 'after');

    const tradePayload = {
      symbol: document.getElementById('trade-symbol').value.toUpperCase(),
      timeframe: document.getElementById('trade-tf').value,
      direction: document.getElementById('trade-direction').value,
      entry_price: entry,
      stop_loss: sl,
      take_profit: tp,
      outcome: currentOutcome,
      result_r: realizedR,
      user_reasons: selectedReasons,
      user_notes: document.getElementById('trade-optional-note').value,
      img_before: imgBeforeUrl,
      img_after: imgAfterUrl
    };

    try {
      const saved = await saveTradeToFirestore(tradePayload);
      tradesList.unshift(saved);
      updateCoreStatistics(tradesList);
      renderJournal(tradesList);

      // Reset Form ສຳລັບ Quick Mode
      resetQuickCapture(realizedR);
    } catch (err) {
      alert('Error saving trade: ' + err.message);
    } finally {
      saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span><span>Save Trade & Next Screenshot (⚡ Quick Mode)</span>';
      saveBtn.classList.remove('opacity-70', 'pointer-events-none');
    }
  });
}

function resetQuickCapture(lastR) {
  fileBefore = null;
  fileAfter = null;

  const pb = document.getElementById('preview-before');
  const prb = document.getElementById('prompt-before');
  const pa = document.getElementById('preview-after');
  const pra = document.getElementById('prompt-after');
  const note = document.getElementById('trade-optional-note');

  if (pb && prb) { pb.classList.add('hidden'); prb.classList.remove('hidden'); }
  if (pa && pra) { pa.classList.add('hidden'); pra.classList.remove('hidden'); }
  if (note) note.value = '';

  const toast = document.getElementById('quick-loop-toast');
  const toastText = document.getElementById('quick-saved-text');
  if (toast && toastText) {
    toastText.innerText = `Trade #${tradesList.length} Saved (${lastR > 0 ? '+' : ''}${lastR}R) ✓`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= 7. APP BOOTSTRAP =================
document.addEventListener('DOMContentLoaded', async () => {
  setupDropzones();
  setupQuickSave();

  // Tag selection toggler
  document.querySelectorAll('#quick-tags-container .q-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      btn.classList.toggle('bg-primary/20');
      btn.classList.toggle('text-primary');
      btn.classList.toggle('border-primary/40');
    });
  });

  // Calculate R on input change
  ['trade-entry', 'trade-sl', 'trade-tp', 'trade-direction'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateAutoR);
  });

  calculateAutoR();

  // Load from Firebase
  try {
    tradesList = await getTradesFromFirestore();
    updateCoreStatistics(tradesList);
    renderJournal(tradesList);
  } catch (err) {
    console.warn("Using offline mode / waiting for firestore connection:", err);
  }
});
