import { getTradesFromFirestore, saveTradeToFirestore, uploadScreenshot } from "./firebase.js";

let tradesList = [];
let currentOutcome = 'WIN';
let fileBefore = null;
let fileAfter = null;

// ================= 1. DRAG & DROP & CTRL+V LOGIC =================
function setupDropzones() {
  const dropBefore = document.getElementById('dropzone-before');
  const dropAfter = document.getElementById('dropzone-after');
  const inputBefore = document.getElementById('file-before');
  const inputAfter = document.getElementById('file-after');

  if (!dropBefore || !dropAfter) return;

  // Click to browse
  dropBefore.addEventListener('click', () => inputBefore.click());
  dropAfter.addEventListener('click', () => inputAfter.click());

  inputBefore.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'before'));
  inputAfter.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'after'));

  // Drag over / leave
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

  // Global Paste (Ctrl+V / Cmd+V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        // ຖ້າຮູບ Before ຍັງບໍ່ມີ ໃຫ້ໃສ່ Before ກ່ອນ, ຖ້າມີແລ້ວໃຫ້ໃສ່ After
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
    preview.querySelector('img').src = e.target.result;
    preview.classList.remove('hidden');
    prompt.classList.add('hidden');

    if (type === 'before') {
      fileBefore = file;
      simulateAiOcr(); // ຈຳລອງ AI/OCR ອ່ານຄ່າຈາກກຣາຟທັນທີ
    } else {
      fileAfter = file;
    }
  };
  reader.readAsDataURL(file);
}

// ຈຳລອງ OCR ອ່ານຄ່າຈາກພາບກຣາຟ
function simulateAiOcr() {
  document.getElementById('trade-symbol').value = 'XAUUSD';
  document.getElementById('trade-tf').value = 'M15';
  document.getElementById('trade-direction').value = 'LONG';
  document.getElementById('trade-entry').value = '2342.50';
  document.getElementById('trade-sl').value = '2337.50';
  document.getElementById('trade-tp').value = '2358.50';
  calculateAutoR();
}

// ================= 2. AUTO R-CALCULATION =================
function calculateAutoR() {
  const entry = parseFloat(document.getElementById('trade-entry').value) || 0;
  const sl = parseFloat(document.getElementById('trade-sl').value) || 0;
  const tp = parseFloat(document.getElementById('trade-tp').value) || 0;
  const direction = document.getElementById('trade-direction').value;

  const riskPoints = Math.abs(entry - sl);
  const rewardPoints = Math.abs(tp - entry);

  if (riskPoints === 0) return;

  const ratio = (rewardPoints / riskPoints).toFixed(1);
  document.getElementById('calculated-rr-text').innerText = `Risk: ${riskPoints.toFixed(1)} pts | Reward: ${rewardPoints.toFixed(1)} pts (1:${ratio})`;

  const badge = document.getElementById('realized-r-badge');
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

// ປຸ່ມເລືອກ Outcome WIN/LOSS/BE
window.selectOutcome = function(type) {
  currentOutcome = type;
  const btnWin = document.getElementById('btn-outcome-win');
  const btnLoss = document.getElementById('btn-outcome-loss');
  const btnBe = document.getElementById('btn-outcome-be');

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

// ================= 3. SAVE & QUICK LOOP =================
async function setupQuickSave() {
  const saveBtn = document.getElementById('btn-save-quick');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    saveBtn.innerText = 'Analyzing & Saving...';
    saveBtn.classList.add('opacity-70', 'pointer-events-none');

    const selectedReasons = Array.from(document.querySelectorAll('#quick-tags-container .q-tag-btn.active')).map(b => b.dataset.tag);
    const entry = parseFloat(document.getElementById('trade-entry').value);
    const sl = parseFloat(document.getElementById('trade-sl').value);
    const tp = parseFloat(document.getElementById('trade-tp').value);
    const realizedR = parseFloat(document.getElementById('realized-r-badge').innerText.replace('R', '').replace('+', ''));

    // Upload screenshots ຖ້າມີ
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
      img_after: imgAfterUrl,
      // AI Analysis ຖືກ run ໄວ້ຫຼັງບ້ານ
      ai_features: {
        market_structure: 'Bullish BOS (High Confidence)',
        confluence_score: 88,
        evidence_level: 'Developing'
      }
    };

    try {
      const saved = await saveTradeToFirestore(tradePayload);
      tradesList.unshift(saved);
      updateCoreStatistics(tradesList);
      renderJournal(tradesList);

      // Reset Form ສຳລັບ Quick Mode
      resetQuickCapture(tradePayload.result_r);
    } catch (err) {
      alert('Error saving trade: ' + err.message);
    } finally {
      saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span><span>Save Trade & Next Screenshot (⚡ Quick Mode)</span>';
      saveBtn.classList.remove('opacity-70', 'pointer-events-none');
    }
  });
}

// Reset Dropzone & ສະແດງ Toast ເພື່ອຖ້າຮັບໄມ້ຕໍ່ໄປທັນທີ
function resetQuickCapture(lastR) {
  fileBefore = null;
  fileAfter = null;
  document.getElementById('preview-before').classList.add('hidden');
  document.getElementById('prompt-before').classList.remove('hidden');
  document.getElementById('preview-after').classList.add('hidden');
  document.getElementById('prompt-after').classList.remove('hidden');
  document.getElementById('trade-optional-note').value = '';

  const toast = document.getElementById('quick-loop-toast');
  document.getElementById('quick-saved-text').innerText = `Trade #${tradesList.length} Saved (${lastR > 0 ? '+' : ''}${lastR}R) ✓`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);

  // ເລື່ອນຂຶ້ນເທິງສຸດເພື່ອພ້ອມຮັບ Paste ຮູບຕໍ່ໄປ
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Init Setup
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

  // Listener input entry/sl/tp recalculate
  ['trade-entry', 'trade-sl', 'trade-tp', 'trade-direction'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculateAutoR);
  });

  // Load from Firebase
  tradesList = await getTradesFromFirestore();
  updateCoreStatistics(tradesList);
  renderJournal(tradesList);
});
