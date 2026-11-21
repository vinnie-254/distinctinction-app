let currentUser = null;
let isProUser = false;
let latestTextbookDiagram = null;
let isLightTextbookTheme = true;

// --- Automatic Tab Switcher (Works Immediately on Page Load) ---
function activateTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.add('hidden');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');

  if (tabId === 'diagrams' && latestTextbookDiagram) {
    renderTextbookDiagram(latestTextbookDiagram);
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

window.showTab = function(id) {
  activateTab(id);
};

function unlockProUI() {
  isProUser = true;
  const badge = document.getElementById('plan-badge');
  badge.textContent = 'PRO MEMBER';
  badge.classList.add('pro');
  document.getElementById('qbank-locked').classList.add('hidden');
  document.getElementById('qbank-unlocked').classList.remove('hidden');
}

function renderSavedBanks(banks) {
  const list = document.getElementById('saved-banks-list');
  list.innerHTML = '';
  (banks || []).forEach(bank => {
    const item = document.createElement('li');
    item.innerHTML = '<strong>' + bank.title + '</strong> — ' + bank.questions.length + ' exam questions saved';
    list.appendChild(item);
  });
}

// --- 1. Send Uploaded File to Backend AI ---
document.getElementById('process-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('doc-upload');
  const statusMsg = document.getElementById('status-msg');
  const selectedFile = fileInput.files.item(0);

  if (!selectedFile) return alert('Please choose a PDF or TXT file first.');

  try {
    statusMsg.style.color = '#38bdf8';
    statusMsg.textContent = '⏳ Analyzing document, drafting computerized textbook figure & 20 exam questions...';

    const formData = new FormData();
    formData.append('document', selectedFile);

    const response = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await response.json();

    if (!response.ok || data.error) throw new Error(data.error || 'Server failed to generate study pack.');

    renderStudyMaterials(data);
    statusMsg.style.color = '#34d399';
    statusMsg.textContent = '✅ "' + (data.topicTitle || selectedFile.name) + '" ready! Click the tabs below to explore.';

    if (isProUser && currentUser) {
      const saveRes = await fetch('/api/qbank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          title: data.topicTitle || selectedFile.name,
          questions: data.questions
        })
      });
      const saveData = await saveRes.json();
      if (saveData.banks) renderSavedBanks(saveData.banks);
    }
  } catch (err) {
    console.error(err);
    statusMsg.style.color = '#f87171';
    statusMsg.textContent = '❌ Error: ' + err.message;
  }
});

// --- 2. Render Summary, Computerized Textbook Diagram, Flashcards & 20 Questions ---
function renderStudyMaterials(data) {
  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = '<h2 style="margin-bottom: 16px; color: #fff;">📘 ' + (data.topicTitle || 'Comprehensive Study Notes') + '</h2>';
  
  (Array.isArray(data.summaryPoints) ? data.summaryPoints : []).forEach(section => {
    const bulletsHtml = (Array.isArray(section.bullets) ? section.bullets : []).map(b => '<li>' + b + '</li>').join('');
    summaryEl.innerHTML +=
      '<div class="summary-section">' +
        '<h3>' + (section.heading || 'Key Concepts') + '</h3>' +
        '<ul>' + bulletsHtml + '</ul>' +
      '</div>';
  });

  if (data.textbookDiagram && Array.isArray(data.textbookDiagram.nodes)) {
    latestTextbookDiagram = data.textbookDiagram;
    const figLabel = data.textbookDiagram.figureNumber || 'Figure 1.1';
    document.getElementById('diagram-title').textContent = '📐 ' + figLabel + ': ' + (data.textbookDiagram.title || 'Conceptual Schematic');
    document.getElementById('diagram-desc').textContent = data.textbookDiagram.caption || 'Click any labeled component below to highlight its textbook notes.';

    const pictorialGrid = document.getElementById('pictorial-cards');
    pictorialGrid.innerHTML = '';
    data.textbookDiagram.nodes.forEach((node, idx) => {
      const card = document.createElement('div');
      card.className = 'pictorial-card';
      card.id = 'node-card-' + idx;
      card.style.cursor = 'pointer';
      card.innerHTML =
        '<h4><span class="color-dot" style="background:' + (node.color || '#2563eb') + '"></span>' + (idx + 1) + '. ' + node.label + '</h4>' +
        '<div style="color:#fcd34d; font-size:0.78rem; font-weight:700; margin-top:2px;">' + (node.sublabel || '') + '</div>' +
        '<p style="color:#f1f5f9; font-size:0.86rem; margin-top:6px; line-height:1.5;">' + node.detail + '</p>';
      card.onclick = () => highlightTextbookNode(idx);
      pictorialGrid.appendChild(card);
    });

    renderTextbookDiagram(data.textbookDiagram);
  }

  const fcContainer = document.getElementById('flashcard-container');
  fcContainer.innerHTML = '';
  (Array.isArray(data.flashcards) ? data.flashcards : []).forEach((fc, index) => {
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.textContent = 'Q' + (index + 1) + ': ' + fc.front;
    let flipped = false;
    card.onclick = () => {
      flipped = !flipped;
      card.classList.toggle('flipped', flipped);
      card.textContent = flipped ? ('💡 ' + fc.back) : ('Q' + (index + 1) + ': ' + fc.front);
    };
    fcContainer.appendChild(card);
  });

  const quizContainer = document.getElementById('quiz-container');
  const questions = Array.isArray(data.questions) ? data.questions : [];
  quizContainer.innerHTML = '<h3 style="margin-bottom:16px;">🎯 ' + questions.length + ' Comprehensive Practice Questions</h3>';
  questions.forEach((q, idx) => {
    quizContainer.innerHTML +=
      '<div class="quiz-item">' +
        '<div class="quiz-q">Question ' + (idx + 1) + ': ' + q.question + '</div>' +
        '<div class="quiz-a"><strong>Model Answer:</strong> ' + q.answer + '</div>' +
      '</div>';
  });
}

// --- 3. Computerized Textbook SVG Diagram Renderer ---
function renderTextbookDiagram(diagram) {
  const wrapper = document.getElementById('textbook-canvas-wrapper');
  if (!wrapper || !diagram) return;

  const bg = isLightTextbookTheme ? '#f8fafc' : '#0b1120';
  const gridColor = isLightTextbookTheme ? '#e2e8f0' : '#1e293b';
  const titleColor = isLightTextbookTheme ? '#0f172a' : '#f8fafc';
  const subTextColor = isLightTextbookTheme ? '#475569' : '#94a3b8';
  const cardBg = isLightTextbookTheme ? '#ffffff' : '#111827';
  const arrowColor = isLightTextbookTheme ? '#334155' : '#94a3b8';
  const badgeBg = isLightTextbookTheme ? '#f1f5f9' : '#1e293b';

  
    const svgNS = 'http://w3.org';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', 'textbook-svg-diagram');
  svg.setAttribute('viewBox', '0 0 1000 580');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '580');
  svg.setAttribute('style', 'min-width:720px; display:block; background:' + bg + ';');

  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML =
    '<pattern id="tb-grid" width="25" height="25" patternUnits="userSpaceOnUse">' +
      '<path d="M 25 0 L 0 0 0 25" fill="none" stroke="' + gridColor + '" stroke-width="0.8"/>' +
    '</pattern>' +
    '<marker id="tb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="' + arrowColor + '"/>' +
    '</marker>' +
    '<filter id="tb-shadow" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="' + (isLightTextbookTheme ? '0.10' : '0.45') + '"/>' +
    '</filter>';
  svg.appendChild(defs);

  const bgRect = document.createElementNS(svgNS, 'rect');
  bgRect.setAttribute('width', '1000');
  bgRect.setAttribute('height', '580');
  bgRect.setAttribute('fill', 'url(#tb-grid)');
  svg.appendChild(bgRect);

  const frame = document.createElementNS(svgNS, 'rect');
  frame.setAttribute('x', '14');
  frame.setAttribute('y', '14');
  frame.setAttribute('width', '972');
  frame.setAttribute('height', '552');
  frame.setAttribute('rx', '10');
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', gridColor);
  frame.setAttribute('stroke-width', '2');
  svg.appendChild(frame);

  const figHeader = document.createElementNS(svgNS, 'text');
  figHeader.setAttribute('x', '34');
  figHeader.setAttribute('y', '44');
  figHeader.setAttribute('fill', titleColor);
  figHeader.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
  figHeader.setAttribute('font-size', '17');
  figHeader.setAttribute('font-weight', '800');
  figHeader.textContent = (diagram.figureNumber || 'FIGURE 1.1') + ' — ' + (diagram.title || '').toUpperCase();
  svg.appendChild(figHeader);

  const nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
  const boxW = 196;
  const boxH = 74;

  // Draw Arrows First
  (Array.isArray(diagram.arrows) ? diagram.arrows : []).forEach(arrow => {
    const src = nodes.find(n => n.id === arrow.from) || nodes.at(arrow.from);
    const dst = nodes.find(n => n.id === arrow.to) || nodes.at(arrow.to);
    if (!src || !dst) return;

    const dx = dst.x - src.x;
    const dy = dst.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    const startX = src.x + ux * 92;
    const startY = src.y + uy * 40;
    const endX = dst.x - ux * 98;
    const endY = dst.y - uy * 44;


const midX = (startX + endX) / 2 - uy * 18;
const midY = (startY + endY) / 2 + ux * 18;
const path = document.createElementNS(svgNS, 'path');
path.setAttribute('d', 'M ' + startX + ' ' + startY + ' Q ' + midX + ' ' + midY + ' ' + endX + ' ' + endY);
path.setAttribute('fill', 'none');
path.setAttribute('stroke', arrowColor);
path.setAttribute('stroke-width', '2.4');
if (arrow.dashed) path.setAttribute('stroke-dasharray', '6,5');
path.setAttribute('marker-end', 'url(#tb-arrow)');
svg.appendChild(path);
if (arrow.actionLabel) {
const labelText = arrow.actionLabel.slice(0, 22);
const pillW = Math.max(76, labelText.length * 7.2 + 16);
const pill = document.createElementNS(svgNS, 'rect');
pill.setAttribute('x', midX - pillW / 2);
pill.setAttribute('y', midY - 11);
pill.setAttribute('width', pillW);
pill.setAttribute('height', '22');
pill.setAttribute('rx', '11');
pill.setAttribute('fill', badgeBg);
pill.setAttribute('stroke', gridColor);
pill.setAttribute('stroke-width', '1.2');
svg.appendChild(pill);
const txt = document.createElementNS(svgNS, 'text');
txt.setAttribute('x', midX);
txt.setAttribute('y', midY + 4);
txt.setAttribute('text-anchor', 'middle');
txt.setAttribute('fill', subTextColor);
txt.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
txt.setAttribute('font-size', '11');
txt.setAttribute('font-weight', '700');
txt.textContent = labelText;
svg.appendChild(txt);
}
});
// Draw Textbook Component Boxes + Numbered Badges
nodes.forEach((node, idx) => {
const accent = node.color || '#2563eb';
const g = document.createElementNS(svgNS, 'g');
g.style.cursor = 'pointer';
g.onclick = () => highlightTextbookNode(idx);
const x = Math.max(115, Math.min(885, node.x || 200));
const y = Math.max(105, Math.min(470, node.y || 200));
const rect = document.createElementNS(svgNS, 'rect');
rect.setAttribute('id', 'svg-node-box-' + idx);
rect.setAttribute('x', x - boxW / 2);
rect.setAttribute('y', y - boxH / 2);
rect.setAttribute('width', boxW);
rect.setAttribute('height', boxH);
rect.setAttribute('rx', node.shape === 'pill' ? '37' : '10');
rect.setAttribute('fill', cardBg);
rect.setAttribute('stroke', accent);
rect.setAttribute('stroke-width', '2.5');
rect.setAttribute('filter', 'url(#tb-shadow)');
g.appendChild(rect);
const topBar = document.createElementNS(svgNS, 'rect');
topBar.setAttribute('x', x - boxW / 2);
topBar.setAttribute('y', y - boxH / 2);
topBar.setAttribute('width', boxW);
topBar.setAttribute('height', '8');
topBar.setAttribute('rx', '4');
topBar.setAttribute('fill', accent);
g.appendChild(topBar);
const badgeCircle = document.createElementNS(svgNS, 'circle');
badgeCircle.setAttribute('cx', x - boxW / 2 + 16);
badgeCircle.setAttribute('cy', y - boxH / 2 + 25);
badgeCircle.setAttribute('r', '11');
badgeCircle.setAttribute('fill', accent);
g.appendChild(badgeCircle);
const badgeNum = document.createElementNS(svgNS, 'text');
badgeNum.setAttribute('x', x - boxW / 2 + 16);
badgeNum.setAttribute('y', y - boxH / 2 + 29);
badgeNum.setAttribute('text-anchor', 'middle');
badgeNum.setAttribute('fill', '#ffffff');
badgeNum.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
badgeNum.setAttribute('font-size', '11');
badgeNum.setAttribute('font-weight', '800');
badgeNum.textContent = String(idx + 1);
g.appendChild(badgeNum);
const titleEl = document.createElementNS(svgNS, 'text');
titleEl.setAttribute('x', x - boxW / 2 + 34);
titleEl.setAttribute('y', y - boxH / 2 + 29);
titleEl.setAttribute('fill', titleColor);
titleEl.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
titleEl.setAttribute('font-size', '13.5');
titleEl.setAttribute('font-weight', '800');
titleEl.textContent = (node.label || '').slice(0, 21);
g.appendChild(titleEl);
const subEl = document.createElementNS(svgNS, 'text');
subEl.setAttribute('x', x);
subEl.setAttribute('y', y + 18);
subEl.setAttribute('text-anchor', 'middle');
subEl.setAttribute('fill', subTextColor);
subEl.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
subEl.setAttribute('font-size', '11.5');
subEl.setAttribute('font-weight', '600');
subEl.textContent = (node.sublabel || '').slice(0, 28);
g.appendChild(subEl);
svg.appendChild(g);
});
const captionText = document.createElementNS(svgNS, 'text');
captionText.setAttribute('x', '34');
captionText.setAttribute('y', '548');
captionText.setAttribute('fill', subTextColor);
captionText.setAttribute('font-family', 'Plus Jakarta Sans, Arial, sans-serif');
captionText.setAttribute('font-size', '12');
captionText.setAttribute('font-style', 'italic');
captionText.textContent = (diagram.caption || '').slice(0, 125);
svg.appendChild(captionText);
wrapper.innerHTML = '';
wrapper.appendChild(svg);
}
function highlightTextbookNode(idx) {
if (!latestTextbookDiagram) return;
const node = latestTextbookDiagram.nodes.at(idx);
if (!node) return;
document.querySelectorAll('.pictorial-card').forEach((card, i) => {
card.style.borderColor = i === idx ? (node.color || '#2563eb') : 'rgba(244, 114, 148, 0.22)';
card.style.background = i === idx ? 'rgba(128, 0, 32, 0.32)' : 'rgba(255, 241, 244, 0.045)';
if (i === idx) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
latestTextbookDiagram.nodes.forEach((n, i) => {
const box = document.getElementById('svg-node-box-' + i);
if (box) box.setAttribute('stroke-width', i === idx ? '4.5' : '2.5');
});
}
document.getElementById('toggle-theme-btn').addEventListener('click', (e) => {
isLightTextbookTheme = !isLightTextbookTheme;
e.target.textContent = isLightTextbookTheme ? '🌙 Dark Blueprint Mode' : '☀️ Light Textbook Mode';
if (latestTextbookDiagram) renderTextbookDiagram(latestTextbookDiagram);
});
document.getElementById('download-diagram-btn').addEventListener('click', () => {
const svgEl = document.getElementById('textbook-svg-diagram');
if (!svgEl) return alert('Generate a study pack first to download the diagram.');
const svgData = new XMLSerializer().serializeToString(svgEl);
const canvas = document.createElement('canvas');
canvas.width = 2000;
canvas.height = 1160;
const ctx = canvas.getContext('2d');
const img = new Image();
img.onload = () => {
ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
const link = document.createElement('a');
link.download = (latestTextbookDiagram?.title || 'textbook-diagram').replace(/\s+/g, '_') + '.png';
link.href = canvas.toDataURL('image/png');
link.click();
};
img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
});
// --- 4. Student Login & Paystack M-Pesa/Card Checkout ---
document.getElementById('login-btn').addEventListener('click', async () => {
const email = prompt('Enter your student email:');
const password = prompt('Enter a password (minimum 6 characters):');
if (!email || !password) return;
try {
const res = await fetch('/api/auth', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ email, password })
});
const data = await res.json();
if (!res.ok || data.error) return alert(data.error || 'Login failed');
currentUser = data.user;
document.getElementById('login-btn').textContent = data.user.email;
if (data.isPro) {
unlockProUI();
renderSavedBanks(data.banks);
}
alert('Welcome, ' + data.user.email + '!');
} catch (err) {
alert('Error signing in: ' + err.message);
}
});
async function triggerUpgrade() {
if (!currentUser) return alert('Please click "Sign In" at the top right first so we can save your Pro subscription!');
if (typeof PaystackPop !== 'undefined') {
const handler = PaystackPop.setup({
key: 'pk_test_f739e28dbc09d1901d09cfc2a79ada433',
email: currentUser.email,
amount: 500 * 100, // KES 500
currency: 'KES',
callback: async function(response) {
await verifyAndUnlockPro(response.reference, currentUser.id);
}
});
handler.openIframe();
} else {
try {
const res = await fetch('/api/paystack/initialize', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ email: currentUser.email, userId: currentUser.id })
});
const data = await res.json();
if (data.authorization_url) {
window.location.href = data.authorization_url;
} else {
alert(data.error || 'Could not open Paystack checkout.');
}
} catch (err) {
alert('Checkout error: ' + err.message);
}
}
}
async function verifyAndUnlockPro(reference, userId) {
const res = await fetch('/api/verify-payment', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ reference, userId })
});
const result = await res.json();
if (result.verified) {
unlockProUI();
alert('🎉 Welcome to Distinction Pro! Your subscription is permanently saved.');
}
}
window.addEventListener('DOMContentLoaded', async () => {
const params = new URLSearchParams(window.location.search);
const reference = params.get('reference') || params.get('trxref');
const userId = params.get('userId');
if (reference && userId) {
await verifyAndUnlockPro(reference, userId);
window.history.replaceState({}, document.title, '/');
}
});
document.getElementById('upgrade-btn').addEventListener('click', triggerUpgrade);
document.getElementById('qbank-upgrade-btn').addEventListener('click', triggerUpgrade);
// --- 5. Focus Timer ---
let timeLeft = 25 * 60;
let timerId = null;
document.getElementById('start-timer').onclick = () => {
if (timerId) return;
timerId = setInterval(() => {
if (--timeLeft <= 0) {
clearInterval(timerId);
timerId = null;
alert('Focus session complete!');
return;
}
const m = Math.floor(timeLeft / 60);
const s = timeLeft % 60;
document.getElementById('timer-display').textContent = m + ':' + (s < 10 ? '0' : '') + s;
}, 1000);
};
document.getElementById('reset-timer').onclick = () => {
clearInterval(timerId);
timerId = null;
timeLeft = 25 * 60;
document.getElementById('timer-display').textContent = '25:00';
};