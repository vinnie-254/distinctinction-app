let currentUser = null;
let isProUser = false;
let latestDiagramData = null;

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
    item.innerHTML = `<strong>${bank.title}</strong> — ${bank.questions.length} exam questions saved`;
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
    statusMsg.textContent = '⏳ Analyzing entire document, building 3D diagram & generating 20 exam questions...';

    const formData = new FormData();
    formData.append('document', selectedFile);

    const response = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await response.json();

    if (!response.ok || data.error) throw new Error(data.error || 'Server failed to generate study pack.');

    renderStudyMaterials(data);
    statusMsg.style.color = '#34d399';
    statusMsg.textContent = `✅ "${data.topicTitle || selectedFile.name}" ready!`;

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

// --- 2. Render Summary, 3D Diagram, Flashcards & 20 Questions ---
function renderStudyMaterials(data) {
  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = `<h2 style="margin-bottom: 16px; color: #fff;">📘 ${data.topicTitle || 'Comprehensive Study Notes'}</h2>`;
  
  (Array.isArray(data.summaryPoints) ? data.summaryPoints : []).forEach(section => {
    const bulletsHtml = (Array.isArray(section.bullets) ? section.bullets : []).map(b => `<li>${b}</li>`).join('');
    summaryEl.innerHTML += `
      <div class="summary-section">
        <h3>${section.heading || 'Key Concepts'}</h3>
        <ul>${bulletsHtml}</ul>
      </div>`;
  });

  if (data.diagram3D && Array.isArray(data.diagram3D.nodes)) {
    latestDiagramData = data.diagram3D;
    document.getElementById('diagram-title').textContent = `🧊 3D Model: ${data.diagram3D.title || '3D Concept Model'}`;
    document.getElementById('diagram-desc').textContent = `${data.diagram3D.description || ''} (Drag to rotate in 3D • Scroll to zoom)`;

    const pictorialGrid = document.getElementById('pictorial-cards');
    pictorialGrid.innerHTML = '';
    data.diagram3D.nodes.forEach((node, idx) => {
      pictorialGrid.innerHTML += `
        <div class="pictorial-card">
          <h4><span class="color-dot" style="background:${node.color || '#38bdf8'}"></span>${idx + 1}. ${node.label}</h4>
          <p style="color:#94a3b8; font-size:0.85rem; margin-top:6px;">${node.detail}</p>
        </div>`;
    });
    render3DScene(data.diagram3D);
  }

  const fcContainer = document.getElementById('flashcard-container');
  fcContainer.innerHTML = '';
  (Array.isArray(data.flashcards) ? data.flashcards : []).forEach((fc, index) => {
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.textContent = `Q${index + 1}: ${fc.front}`;
    let flipped = false;
    card.onclick = () => {
      flipped = !flipped;
      card.classList.toggle('flipped', flipped);
      card.textContent = flipped ? `💡 ${fc.back}` : `Q${index + 1}: ${fc.front}`;
    };
    fcContainer.appendChild(card);
  });

  const quizContainer = document.getElementById('quiz-container');
  const questions = Array.isArray(data.questions) ? data.questions : [];
  quizContainer.innerHTML = `<h3 style="margin-bottom:16px;">🎯 ${questions.length} Comprehensive Practice Questions</h3>`;
  questions.forEach((q, idx) => {
    quizContainer.innerHTML += `
      <div class="quiz-item">
        <div class="quiz-q">Question ${idx + 1}: ${q.question}</div>
        <div class="quiz-a"><strong>Model Answer:</strong> ${q.answer}</div>
      </div>`;
  });
}

// --- 3. Interactive Three.js 3D Diagram Engine ---
function render3DScene(diagram) {
  const container = document.getElementById('three-canvas-container');
  container.innerHTML = '';
  if (typeof THREE === 'undefined') return;

  const width = container.clientWidth || 800;
  const height = 420;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 2, 11);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const pointLight = new THREE.PointLight(0xffffff, 1.2);
  pointLight.position.set(10, 10, 10);
  scene.add(pointLight);

  const nodeMeshes = [];
  diagram.nodes.forEach(node => {
    let geometry;
    if (node.shape === 'box') geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    else if (node.shape === 'cylinder') geometry = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 32);
    else if (node.shape === 'torus') geometry = new THREE.TorusGeometry(0.65, 0.25, 16, 50);
    else geometry = new THREE.SphereGeometry(0.7, 32, 32);

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: node.color || '#38bdf8',
      roughness: 0.3,
      metalness: 0.2
    }));
    mesh.position.set(node.x || 0, node.y || 0, node.z || 0);
    scene.add(mesh);
    nodeMeshes.push(mesh);

    const labelSprite = createTextSprite(node.label);
    labelSprite.position.set(node.x || 0, (node.y || 0) + 1.1, node.z || 0);
    scene.add(labelSprite);
  });

  if (diagram.connections) {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.6 });
    diagram.connections.forEach(conn => {
      const startNode = nodeMeshes.at(conn.from);
      const endNode = nodeMeshes.at(conn.to);
      if (startNode && endNode) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([startNode.position, endNode.position]);
        scene.add(new THREE.Line(lineGeo, lineMat));
      }
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

function createTextSprite(message) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.roundRect(40, 20, 432, 80, 20);
  ctx.fill();
  ctx.font = 'bold 28px Plus Jakarta Sans, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(message.slice(0, 26), 256, 70);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  sprite.scale.set(3.5, 0.9, 1);
  return sprite;
}

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
    alert(`Welcome, ${data.user.email}!`);
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
// Auto-verify payment when redirected back from Paystack hosted checkout
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
// --- 5. Focus Timer & Tabs ---
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

window.showTab = function(id, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(id).classList.remove('hidden');
  if (btnElement) btnElement.classList.add('active');
  if (id === 'diagrams' && latestDiagramData) render3DScene(latestDiagramData);
};
