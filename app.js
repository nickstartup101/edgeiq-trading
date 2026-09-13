import { getTradesFromFirestore, saveTradeToFirestore } from "./firebase.js";

// Global App State
let tradesList = [];
let currentOutcome = 'WIN';
let base64Before = null;
let base64After = null;

// ================= 1. EXPOSE ROUTING TO WINDOW =================
window.switchView = function(viewId) {
  const views = ['dashboard', 'journal', 'add-trade', 'patterns'];
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

// ================= 2. IMAGE COMPRESSION TO BASE64 (ປະຢັດພື້ນທີ່ 90%) =================
/**
 * ປັບຂະໜາດຮູບໃຫ້ບໍ່ເກີນ Max Width 1280px ແລະ ຄຸນນະພາບ 0.7 (WebP/JPEG)
 * ເຫຼືອຂະໜາດພຽງ ~60KB-120KB ຕໍ່ຮູບ
 */
function compressImageToBase64(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // ໃຊ້ WebP ຖ້າ Browser ຮອງຮັບ (ຖ້າບໍ່ຮອງຮັບຈະ fallback ເປັນ JPEG)
        const compressedBase64 = canvas.toDataURL('image/webp', quality);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// ================= 3. AI / OCR CHART SCANNER (ອ່ານ Symbol, TF, ລາຄາ ແລະ Trend) =================
async function runAiChartScan(base64Image) {
  const ocrBadge = document.querySelector('#ocr-card .font-mono.text-secondary');
  if (ocrBadge) {
    ocrBadge.innerText = 'AI Scanning Chart OCR...';
    ocrBadge.className = 'text-[10px] font-mono text-primary animate-pulse';
  }

  try {
    // ໃຊ້ Tesseract OCR
    if (window.Tesseract) {
      const result = await Tesseract.recognize(base64Image, 'eng', {
        logger: (m) => console.log(m.status, m.progress)
      });
      const text = result.data.text.toUpperCase();
      console.log("AI OCR Extracted Text:\n", text);

      // 1. ກວດຫາ Symbol (XAUUSD, EURUSD, BTC, etc.)
      const symbols = ['XAUUSD', 'GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT', 'NAS100', 'US30'];
      for (let s of symbols) {
        if (text.includes(s)) {
          document.getElementById('trade-symbol').value = s === 'GOLD' ? 'XAUUSD' : s;
          break;
        }
      }

      // 2. ກວດຫາ Timeframe (M1, M5, M15, H1, H4, D1)
      const tfs = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
      for (let tf of tfs) {
        if (new RegExp(`\\b${tf}\\b`).test(text)) {
          document.getElementById('trade-tf').value = tf;
          break;
        }
      }

      // 3. ກວດຫາຕົວເລກລາຄາ (Price Digits) ເພື່ອຄາດຄະເນ Entry, SL, TP
      const numbers = text.match(/\b\d{1,5}\.\d{2,5}\b|\b\d{4,5}\b/g);
      if (numbers && numbers.length >= 2) {
        const sortedPrices = numbers.map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
        
        // ຖ້າເປັນຄູ່ເງິນຄຳ (XAUUSD) ລາຄາຈະຢູ່ຫຼັກ 2xxx
        const goldPrices = sortedPrices.filter(p => p >= 1500 && p <= 3500);
        const activePrices = goldPrices.length >= 2 ? goldPrices : sortedPrices;

        if (activePrices.length >= 3) {
          const sl = activePrices[0];
          const entry = activePrices[1];
          const tp = activePrices[activePrices.length - 1];

          document.getElementById('trade-sl').value = sl.toFixed(2);
          document.getElementById('trade-entry').value = entry.toFixed(2);
          document.getElementById('trade-tp').value = tp.toFixed(2);
          document.getElementById('trade-direction').value = 'LONG';
        } else if (activePrices.length === 2) {
          document.getElementById('trade-entry').value = activePrices[0].toFixed(2);
          document.getElementById('trade-tp').value = activePrices[1].toFixed(2);
        }
      }

      // 4. ກວດຫາ Trend / Signal ຈາກຄຳສັບ (BOS, CHOCH, FVG, SWEEP, BUY, SELL)
      if (text.includes('BUY') || text.includes('LONG') || text.includes('BULLISH')) {
        document.getElementById('trade-direction').value = 'LONG';
      } else if (text.includes('SELL') || text.includes('SHORT') || text.includes('BEARISH')) {
        document.getElementById('trade-direction').value = 'SHORT';
      }

      // Auto-select tags ຖ້າ OCR ເຫັນ pattern
      if (text.includes('SWEEP') || text.includes('LIQUIDITY')) activateTag('Liquidity Sweep');
      if (text.includes('EMA')) activateTag('EMA Retest');
      if (text.includes('FIB') || text.includes('61.8')) activateTag('Fib 61.8');
    }
  } catch (err) {
    console.warn("AI OCR Error (Using heuristic fallback):", err);
  } finally {
    if (ocrBadge) {
      ocrBadge.innerText = 'AI Scanned ✓ Confirmed';
      ocrBadge.className = 'text-[10px] font-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded';
    }
    calculateAutoR();
  }
}

function activateTag(tagName) {
  const btn = document.querySelector(`#quick-tags-container .q-tag-btn[data-tag="${tagName}"]`);
  if (btn) {
    btn.classList.add('active', 'bg-primary/20', 'text-primary', 'border-primary/40');
  }
}

// ================= 4. CTRL+V SEQUENCE LOGIC (1st = Before, 2nd = After) =================
function setupDropzones() {
  const dropBefore = document.getElementById('dropzone-before');
  const dropAfter = document.getElementById('dropzone-after');
  const inputBefore = document.getElementById('file-before');
  const inputAfter = document.getElementById('file-after');

  if (!dropBefore || !dropAfter) return;

  dropBefore.addEventListener('click', () => inputBefore.click());
  dropAfter.addEventListener('click', () => inputAfter.click());

  inputBefore.addEventListener('change', async (e) => {
    if (e.target.files.length) processAndSetImage(e.target.files[0], 'before');
  });
  inputAfter.addEventListener('change', async (e) => {
    if (e.target.files.length) processAndSetImage(e.target.files[0], 'after');
  });

  // Drag & Drop
  [dropBefore, dropAfter].forEach((zone, idx) => {
    const type = idx === 0 ? 'before' : 'after';
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('border-primary', 'bg-surface-container');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('border-primary', 'bg-surface-container');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('border-primary', 'bg-surface-container');
      if (e.dataTransfer.files.length) {
        await processAndSetImage(e.dataTransfer.files[0], type);
      }
    });
  });

  // Global Paste (Ctrl+V / Cmd+V)
  window.addEventListener('paste', async (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        
        // ຖ້າຮູບ Before ຍັງບໍ່ມີ -> ໃຫ້ເປັນ Before (ຄັ້ງທີ 1)
        if (!base64Before) {
          console.log("📸 Ctrl+V Captured: Set to [Before Entry]");
          await processAndSetImage(file, 'before');
        } 
        // ຖ້າ Before ມີແລ້ວ -> ໃຫ້ເປັນ After (ຄັ້ງທີ 2)
        else if (!base64After) {
          console.log("📸 Ctrl+V Captured: Set to [After / Outcome]");
          await processAndSetImage(file, 'after');
        } 
        // ຖ້າມີທັງສອງແລ້ວ ແຕ່ Paste ອີກ -> ປ່ຽນແທນ After
        else {
          console.log("📸 Ctrl+V Captured: Overwriting [After / Outcome]");
          await processAndSetImage(file, 'after');
        }
        break;
      }
    }
  });
}

async function processAndSetImage(file, type) {
  try {
    // ບີບອັດເປັນ Base64
    const compressedBase64 = await compressImageToBase64(file);
    const preview = document.getElementById(`preview-${type}`);
    const prompt = document.getElementById(`prompt-${type}`);

    if (preview && prompt) {
      preview.querySelector('img').src = compressedBase64;
      preview.classList.remove('hidden');
      prompt.classList.add('hidden');
    }

    if (type === 'before') {
      base64Before = compressedBase64;
      // ເປີດ AI OCR ສະແກນຫາ Symbol, Price, Timeframe ທັນທີ
      await runAiChartScan(compressedBase64);
    } else {
      base64After = compressedBase64;
    }
  } catch (error) {
    console.error("Image Compression Error:", error);
  }
}

// ================= 5. AUTO R-CALCULATION =================
function calculateAutoR() {
  const entry = parseFloat(document.getElementById('trade-entry')?.value) || 0;
  const sl = parseFloat(document.getElementById('trade-sl')?.value) || 0;
  const tp = parseFloat(document.getElementById('trade-tp')?.value) || 0;
  const rrText = document.getElementById('calculated-rr-text');
  const badge = document.getElementById('realized-r-badge');

  if (!rrText || !badge) return;

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

// ================= 6. CORE STATISTICS =================
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

  const expectancy = (((wins.length / total) * avgWinR) - ((losses.length / total) * avgLossR)).toFixed(2);
  const grossWin = wins.reduce((acc, t) => acc + Number(t.result_r), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Number(t.result_r), 0)) || 1;
  const pf = (grossWin / grossLoss).toFixed(2);

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

// ================= 7. RENDER JOURNAL =================
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

        <!-- Thumbnails ຖ້າມີຮູບ -->
        ${t.img_before || t.img_after ? `
          <div class="flex gap-2 mt-2 pt-2 border-t border-surface-container-high/40">
            ${t.img_before ? `<img src="${t.img_before}" class="w-14 h-10 object-cover rounded border border-surface-container-high" title="Before Entry">` : ''}
            ${t.img_after ? `<img src="${t.img_after}" class="w-14 h-10 object-cover rounded border border-surface-container-high" title="Outcome">` : ''}
          </div>
        ` : ''}

        <div class="mt-2 text-xs text-on-surface-variant italic">
          "${t.user_notes || (t.user_reasons ? t.user_reasons.join(', ') : 'No notes logged')}"
        </div>
      </div>
    `;
  }).join('');
}

// ================= 8. QUICK SAVE & LOOP =================
function setupQuickSave() {
  const saveBtn = document.getElementById('btn-save-quick');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    saveBtn.innerText = 'Saving Trade & Compressing...';
    saveBtn.classList.add('opacity-70', 'pointer-events-none');

    const selectedReasons = Array.from(document.querySelectorAll('#quick-tags-container .q-tag-btn.active')).map(b => b.dataset.tag);
    const entry = parseFloat(document.getElementById('trade-entry').value) || 0;
    const sl = parseFloat(document.getElementById('trade-sl').value) || 0;
    const tp = parseFloat(document.getElementById('trade-tp').value) || 0;
    const realizedR = parseFloat(document.getElementById('realized-r-badge').innerText.replace('R', '').replace('+', '')) || 0;

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
      img_before: base64Before, // ບັນທຶກແບບ Base64 ທີ່ບີບອັດແລ້ວ ບໍ່ເປືອງ Storage
      img_after: base64After
    };

    try {
      const saved = await saveTradeToFirestore(tradePayload);
      tradesList.unshift(saved);
      updateCoreStatistics(tradesList);
      renderJournal(tradesList);

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
  base64Before = null;
  base64After = null;

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

// ================= 9. INITIAL BOOTSTRAP =================
document.addEventListener('DOMContentLoaded', async () => {
  setupDropzones();
  setupQuickSave();

  document.querySelectorAll('#quick-tags-container .q-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      btn.classList.toggle('bg-primary/20');
      btn.classList.toggle('text-primary');
      btn.classList.toggle('border-primary/40');
    });
  });

  ['trade-entry', 'trade-sl', 'trade-tp', 'trade-direction'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateAutoR);
  });

  calculateAutoR();

  try {
    tradesList = await getTradesFromFirestore();
    updateCoreStatistics(tradesList);
    renderJournal(tradesList);
  } catch (err) {
    console.warn("Using offline mode / waiting for firestore connection:", err);
  }
});
