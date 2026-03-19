// ── TILA ──
let kysymykset = [];
let nykyinen = 0;
let pisteet = 0;
let vastaukset = [];
let timerInterval = null;
let aikaJaljella = 20;
let vastattu = false;
let pelimuoto = 'quiz';

const VARIT = ['A','B','C','D'];
const IKONIT = ['▲','◆','●','★'];

function nakyta(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function valitsePelimuoto(muoto) {
  pelimuoto = muoto;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.mode-btn[data-mode="${muoto}"]`).classList.add('selected');
}

async function aloitaKoe() {
  const apiKey = document.getElementById('api-key').value.trim();
  const aihe = document.getElementById('aihe').value.trim();
  const maara = document.getElementById('maara').value;
  const vaikeus = document.getElementById('vaikeus').value;

  if (!apiKey) { alert('Syötä API-avain!'); return; }
  if (!aihe) { alert('Lisää teksti tai lataa tiedosto!'); return; }

  localStorage.setItem('claude_api_key', apiKey);
  nakyta('screen-loading');

  let prompt;
  if (pelimuoto === 'kortit') {
    prompt = `Luo ${maara} kääntelykorttiparia AINOASTAAN seuraavan tekstin sisällöstä. Vaikeustaso: ${vaikeus}.

TEKSTI:
${aihe}

Vastaa AINOASTAAN validilla JSON-taulukolla (ei muuta tekstiä):
[
  {
    "etupuoli": "Käsite tai kysymys tähän",
    "takapuoli": "Selitys tai vastaus tähän",
    "selitys": "Lisäkonteksti tai muistivihje"
  }
]`;
  } else if (pelimuoto === 'kirjoitus') {
    prompt = `Luo ${maara} täydennystekstitehtävää AINOASTAAN seuraavan tekstin sisällöstä. Vaikeustaso: ${vaikeus}.

TEKSTI:
${aihe}

Vastaa AINOASTAAN validilla JSON-taulukolla (ei muuta tekstiä):
[
  {
    "kysymys": "Kysymys tai konteksti",
    "vastaus": "Oikea lyhyt vastaus (1-4 sanaa)",
    "vihje": "Lyhyt vihje jos tarvitaan"
  }
]`;
  } else {
    prompt = `Luo ${maara} monivalintakysymystä AINOASTAAN seuraavan tekstin sisällöstä. Vaikeustaso: ${vaikeus}.

TEKSTI:
${aihe}

Vastaa AINOASTAAN validilla JSON-taulukolla tässä muodossa (ei muuta tekstiä):
[
  {
    "kysymys": "Kysymyksen teksti tähän?",
    "vaihtoehdot": ["Vaihtoehto A", "Vaihtoehto B", "Vaihtoehto C", "Vaihtoehto D"],
    "oikea": 0,
    "selitys": "Lyhyt selitys miksi tämä on oikein"
  }
]

Oikea-kenttä on oikean vastauksen indeksi (0=A, 1=B, 2=C, 3=D).
Tee kysymyksistä selkeitä, opettavaisia ja ${vaikeus}-tasoisia.`;
  }

  const streamBox = document.getElementById('stream-box');
  const tokenCount = document.getElementById('token-count');
  const loadingSub = document.getElementById('loading-sub');
  streamBox.classList.add('active');
  streamBox.innerHTML = '<span class="stream-cursor"></span>';
  loadingSub.textContent = 'AI kirjoittaa sisältöä...';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        stream: true,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'API-virhe'); }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let kertynyt = '';
    let tokeneja = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const rivi of chunk.split('\n')) {
        if (!rivi.startsWith('data: ')) continue;
        const data = rivi.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            kertynyt += event.delta.text;
            tokeneja++;
            streamBox.innerHTML = kertynyt.slice(-300).replace(/</g, '&lt;') + '<span class="stream-cursor"></span>';
            streamBox.scrollTop = streamBox.scrollHeight;
            tokenCount.textContent = `${tokeneja} tokenia vastaanotettu`;
          }
        } catch (_) {}
      }
    }

    streamBox.classList.remove('active');
    tokenCount.textContent = '';
    loadingSub.textContent = 'Analysoidaan tekstiä ja luodaan sisältö';

    let teksti = kertynyt.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    kysymykset = JSON.parse(teksti);
    nykyinen = 0; pisteet = 0; vastaukset = [];
    aikaJaljella = parseInt(document.getElementById('aika').value);

    if (pelimuoto === 'kortit') aloitaKortit();
    else if (pelimuoto === 'kirjoitus') aloitaKirjoitus();
    else { nakyta('screen-quiz'); naytaKysymys(); }

  } catch (e) {
    nakyta('screen-setup');
    alert('Virhe: ' + e.message);
  }
}

// ══ MONIVALINTA ══
function naytaKysymys() {
  vastattu = false;
  const q = kysymykset[nykyinen];
  const total = kysymykset.length;
  document.getElementById('question-num').textContent = `KYSYMYS ${nykyinen + 1}`;
  document.getElementById('question-text').textContent = q.kysymys;
  document.getElementById('progress-label').textContent = `Kysymys ${nykyinen + 1} / ${total}`;
  document.getElementById('progress-fill').style.width = `${(nykyinen / total) * 100}%`;
  document.getElementById('score-display').textContent = pisteet;
  document.getElementById('feedback-bar').style.display = 'none';
  document.getElementById('btn-next').classList.remove('visible');
  const grid = document.getElementById('answers-grid');
  grid.innerHTML = '';
  q.vaihtoehdot.forEach((v, i) => {
    const btn = document.createElement('button');
    btn.className = `answer-btn ${VARIT[i]}`;
    btn.innerHTML = `<div class="answer-icon">${IKONIT[i]}</div><span>${v}</span>`;
    btn.onclick = () => vastaa(i);
    grid.appendChild(btn);
  });
  aloitaAjastin();
}

function aloitaAjastin() {
  clearInterval(timerInterval);
  aikaJaljella = parseInt(document.getElementById('aika').value);
  const maxAika = aikaJaljella;
  const circumference = 150.8;
  const timerFg = document.getElementById('timer-fg');
  const timerNum = document.getElementById('timer-num');
  timerFg.style.stroke = '#c084fc';
  timerFg.style.strokeDashoffset = '0';
  timerNum.textContent = aikaJaljella;
  timerInterval = setInterval(() => {
    aikaJaljella--;
    timerNum.textContent = aikaJaljella;
    timerFg.style.strokeDashoffset = circumference * (1 - aikaJaljella / maxAika);
    if (aikaJaljella <= 5) timerFg.style.stroke = '#e8394a';
    else if (aikaJaljella <= 10) timerFg.style.stroke = '#ffc107';
    if (aikaJaljella <= 0) { clearInterval(timerInterval); if (!vastattu) aikaLoppui(); }
  }, 1000);
}

function aikaLoppui() {
  vastattu = true;
  const q = kysymykset[nykyinen];
  vastaukset.push({ kysymys: q.kysymys, oma: -1, oikea: q.oikea, oikein: false, selitys: q.selitys, vaihtoehdot: q.vaihtoehdot });
  document.querySelectorAll('.answer-btn').forEach((b, i) => { b.disabled = true; if (i === q.oikea) b.classList.add('correct'); });
  const fb = document.getElementById('feedback-bar');
  fb.textContent = `⏰ Aika loppui! Oikea: ${q.vaihtoehdot[q.oikea]}`;
  fb.className = 'feedback-bar vaarin'; fb.style.display = 'block';
  document.getElementById('btn-next').classList.add('visible');
}

function vastaa(valinta) {
  if (vastattu) return;
  vastattu = true;
  clearInterval(timerInterval);
  const q = kysymykset[nykyinen];
  const oikein = valinta === q.oikea;
  const aikaBonus = Math.round(aikaJaljella * 10);
  if (oikein) pisteet += 100 + aikaBonus;
  vastaukset.push({ kysymys: q.kysymys, oma: valinta, oikea: q.oikea, oikein, selitys: q.selitys, vaihtoehdot: q.vaihtoehdot });
  document.querySelectorAll('.answer-btn').forEach((b, i) => {
    b.disabled = true;
    if (i === q.oikea) b.classList.add('correct');
    else if (i === valinta && !oikein) b.classList.add('wrong');
  });
  const fb = document.getElementById('feedback-bar');
  fb.textContent = oikein ? `✅ Oikein! +${100 + aikaBonus} pistettä — ${q.selitys}` : `❌ Väärin. Oikea: ${q.vaihtoehdot[q.oikea]} — ${q.selitys}`;
  fb.className = `feedback-bar ${oikein ? 'oikein' : 'vaarin'}`; fb.style.display = 'block';
  document.getElementById('score-display').textContent = pisteet;
  document.getElementById('btn-next').classList.add('visible');
}

function seuraava() {
  nykyinen++;
  if (nykyinen >= kysymykset.length) naytaTulokset();
  else naytaKysymys();
}

// ══ KÄÄNTELYKORTIT ══
let korttiJarjestys = [], korttiNykyinen = 0, korttiKaannetty = false;
let korttiTunnetaan = 0, korttiEiTunnetaan = 0;

function aloitaKortit() {
  korttiJarjestys = kysymykset.map((_, i) => i).sort(() => Math.random() - 0.5);
  korttiNykyinen = 0; korttiKaannetty = false; korttiTunnetaan = 0; korttiEiTunnetaan = 0;
  nakyta('screen-kortit');
  naytaKortti();
}

function naytaKortti() {
  const total = korttiJarjestys.length;
  if (korttiNykyinen >= total) { naytaKorttiTulokset(); return; }
  const k = kysymykset[korttiJarjestys[korttiNykyinen]];
  korttiKaannetty = false;
  document.getElementById('kortti-progress').textContent = `${korttiNykyinen + 1} / ${total}`;
  document.getElementById('kortti-progress-fill').style.width = `${(korttiNykyinen / total) * 100}%`;
  document.getElementById('kortti-tunnetaan').textContent = korttiTunnetaan;
  document.getElementById('kortti-ei-tunnetaan').textContent = korttiEiTunnetaan;
  const kortti = document.getElementById('flash-kortti');
  kortti.classList.remove('kaannetty', 'slide-out-right', 'slide-out-left');
  document.getElementById('kortti-etu').textContent = k.etupuoli;
  document.getElementById('kortti-taka').textContent = k.takapuoli;
  document.getElementById('kortti-selitys').textContent = k.selitys || '';
  document.getElementById('kortti-toiminnot').style.display = 'none';
}

function kaannaKortti() {
  if (korttiKaannetty) return;
  korttiKaannetty = true;
  document.getElementById('flash-kortti').classList.add('kaannetty');
  setTimeout(() => { document.getElementById('kortti-toiminnot').style.display = 'flex'; }, 350);
}

function korttiVastaus(tunnetaan) {
  if (tunnetaan) korttiTunnetaan++; else korttiEiTunnetaan++;
  const kortti = document.getElementById('flash-kortti');
  kortti.classList.add(tunnetaan ? 'slide-out-right' : 'slide-out-left');
  setTimeout(() => { kortti.classList.remove('slide-out-right','slide-out-left'); korttiNykyinen++; naytaKortti(); }, 400);
}

function naytaKorttiTulokset() {
  nakyta('screen-results');
  const total = korttiJarjestys.length;
  const prosentti = Math.round((korttiTunnetaan / total) * 100);
  let emoji = '😅', title = 'Harjoittele lisää!';
  if (prosentti >= 90) { emoji = '🏆'; title = 'Mestari!'; konfetti(); }
  else if (prosentti >= 70) { emoji = '🎉'; title = 'Hienoa työtä!'; }
  else if (prosentti >= 50) { emoji = '👍'; title = 'Ihan hyvä!'; }
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = title;
  document.getElementById('big-score').textContent = `${korttiTunnetaan}/${total}`;
  document.getElementById('score-label').textContent = `korttia tunnettiin · ${prosentti}%`;
  document.getElementById('result-breakdown').innerHTML = `
    <div class="breakdown-item" style="justify-content:center;gap:32px">
      <div style="text-align:center"><div style="font-size:2rem">✅</div><div style="font-size:1.4rem;font-weight:900;color:#52e8a0">${korttiTunnetaan}</div><div style="font-size:0.8rem;color:var(--muted)">Tunnettiin</div></div>
      <div style="text-align:center"><div style="font-size:2rem">❌</div><div style="font-size:1.4rem;font-weight:900;color:#ff6b78">${korttiEiTunnetaan}</div><div style="font-size:0.8rem;color:var(--muted)">Ei tunnistettu</div></div>
    </div>`;
}

// ══ KIRJOITUSMINIPELI ══
let kirjoitusAika = 0, kirjoitusTimer = null, kirjoitusVirheet = 0, kirjoitusOikein = 0;

function aloitaKirjoitus() {
  kirjoitusVirheet = 0; kirjoitusOikein = 0; nykyinen = 0;
  nakyta('screen-kirjoitus');
  naytaKirjoitusTehtava();
}

function naytaKirjoitusTehtava() {
  if (nykyinen >= kysymykset.length) { naytaKirjoitusTulokset(); return; }
  const q = kysymykset[nykyinen];
  const total = kysymykset.length;
  document.getElementById('kirj-progress').textContent = `${nykyinen + 1} / ${total}`;
  document.getElementById('kirj-progress-fill').style.width = `${(nykyinen / total) * 100}%`;
  document.getElementById('kirj-kysymys').textContent = q.kysymys;
  document.getElementById('kirj-vihje').textContent = '';
  document.getElementById('kirj-feedback').textContent = '';
  document.getElementById('kirj-feedback').className = 'kirj-feedback';
  document.getElementById('kirj-input').value = '';
  document.getElementById('kirj-input').disabled = false;
  document.getElementById('kirj-pituus').textContent = `Vastauksen pituus: ${q.vastaus.length} merkkiä`;
  document.getElementById('kirj-score').textContent = pisteet;
  document.getElementById('kirj-input').focus();
  clearInterval(kirjoitusTimer);
  kirjoitusAika = parseInt(document.getElementById('aika').value);
  document.getElementById('kirj-aika').textContent = kirjoitusAika;
  kirjoitusTimer = setInterval(() => {
    kirjoitusAika--;
    document.getElementById('kirj-aika').textContent = kirjoitusAika;
    if (kirjoitusAika <= 5) document.getElementById('kirj-aika').style.color = '#ff6b78';
    else document.getElementById('kirj-aika').style.color = '';
    if (kirjoitusAika <= 0) { clearInterval(kirjoitusTimer); kirjoitusAikaLoppui(); }
  }, 1000);
}

function kirjoitusTarkista() {
  const q = kysymykset[nykyinen];
  const syote = document.getElementById('kirj-input').value.trim().toLowerCase();
  const oikea = q.vastaus.toLowerCase();
  if (!syote) return;
  clearInterval(kirjoitusTimer);
  document.getElementById('kirj-input').disabled = true;
  const oikein = syote === oikea || oikea.includes(syote) || syote.includes(oikea);
  const aikaBonus = Math.round(kirjoitusAika * 10);
  const fb = document.getElementById('kirj-feedback');
  if (oikein) {
    pisteet += 100 + aikaBonus; kirjoitusOikein++;
    fb.textContent = `✅ Oikein! +${100 + aikaBonus} pistettä`;
    fb.className = 'kirj-feedback oikein';
  } else {
    kirjoitusVirheet++;
    fb.textContent = `❌ Oikea vastaus: "${q.vastaus}"`;
    fb.className = 'kirj-feedback vaarin';
  }
  vastaukset.push({ kysymys: q.kysymys, oma: syote, oikea: q.vastaus, oikein, selitys: q.vihje || '', vaihtoehdot: [] });
  setTimeout(() => { nykyinen++; naytaKirjoitusTehtava(); }, 1200);
}

function kirjoitusAikaLoppui() {
  const q = kysymykset[nykyinen];
  document.getElementById('kirj-input').disabled = true;
  const fb = document.getElementById('kirj-feedback');
  fb.textContent = `⏰ Aika loppui! Oikea: "${q.vastaus}"`;
  fb.className = 'kirj-feedback vaarin';
  kirjoitusVirheet++;
  vastaukset.push({ kysymys: q.kysymys, oma: '', oikea: q.vastaus, oikein: false, selitys: q.vihje || '', vaihtoehdot: [] });
  setTimeout(() => { nykyinen++; naytaKirjoitusTehtava(); }, 1200);
}

function naytaVihje() {
  const q = kysymykset[nykyinen];
  document.getElementById('kirj-vihje').textContent = q.vihje ? `💡 ${q.vihje}` : '💡 Ei vihjettä saatavilla';
}

function naytaKirjoitusTulokset() {
  nakyta('screen-results');
  const total = kysymykset.length;
  const prosentti = Math.round((kirjoitusOikein / total) * 100);
  let emoji = '😅', title = 'Harjoittele lisää!';
  if (prosentti >= 90) { emoji = '🏆'; title = 'Kirjoitustaituri!'; konfetti(); }
  else if (prosentti >= 70) { emoji = '🎉'; title = 'Hienoa työtä!'; }
  else if (prosentti >= 50) { emoji = '👍'; title = 'Ihan hyvä!'; }
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = title;
  document.getElementById('big-score').textContent = `${kirjoitusOikein}/${total}`;
  document.getElementById('score-label').textContent = `oikein · ${pisteet} pistettä · ${prosentti}%`;
  const bd = document.getElementById('result-breakdown');
  bd.innerHTML = '';
  vastaukset.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <div class="breakdown-icon">${v.oikein ? '✅' : '❌'}</div>
      <div>
        <div class="breakdown-q">${i+1}. ${v.kysymys}</div>
        <div class="breakdown-a ${v.oikein ? 'oikein' : 'vaarin'}">${v.oikein ? `Oikein: "${v.oikea}"` : `Vastattu: "${v.oma || '–'}" → Oikea: "${v.oikea}"`}</div>
      </div>`;
    bd.appendChild(item);
  });
}

// ══ YHTEINEN TULOKSET (monivalinta) ══
function naytaTulokset() {
  nakyta('screen-results');
  const oikeitaKpl = vastaukset.filter(v => v.oikein).length;
  const total = kysymykset.length;
  const prosentti = Math.round((oikeitaKpl / total) * 100);
  let emoji = '😅', title = 'Harjoittele lisää!';
  if (prosentti >= 90) { emoji = '🏆'; title = 'Loistava suoritus!'; konfetti(); }
  else if (prosentti >= 70) { emoji = '🎉'; title = 'Hienoa työtä!'; }
  else if (prosentti >= 50) { emoji = '👍'; title = 'Ihan hyvä!'; }
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = title;
  document.getElementById('big-score').textContent = `${oikeitaKpl}/${total}`;
  document.getElementById('score-label').textContent = `oikein · ${pisteet} pistettä · ${prosentti}%`;
  const bd = document.getElementById('result-breakdown');
  bd.innerHTML = '';
  vastaukset.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    const icon = v.oma === -1 ? '⏰' : v.oikein ? '✅' : '❌';
    const aTeksti = v.oikein ? `Oikein: ${v.vaihtoehdot[v.oikea]}` : `Vastattu: ${v.oma >= 0 ? v.vaihtoehdot[v.oma] : 'Ei vastattu'} → Oikea: ${v.vaihtoehdot[v.oikea]}`;
    item.innerHTML = `
      <div class="breakdown-icon">${icon}</div>
      <div>
        <div class="breakdown-q">${i+1}. ${v.kysymys}</div>
        <div class="breakdown-a ${v.oikein ? 'oikein' : 'vaarin'}">${aTeksti}</div>
      </div>`;
    bd.appendChild(item);
  });
}

function konfetti() {
  const varit = ['#c084fc','#818cf8','#38bdf8','#fbbf24','#34d399','#f87171'];
  for (let i = 0; i < 80; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `left:${Math.random()*100}vw;background:${varit[Math.floor(Math.random()*varit.length)]};width:${Math.random()*10+6}px;height:${Math.random()*10+6}px;animation-duration:${Math.random()*2+2}s;border-radius:${Math.random()>.5?'50%':'2px'}`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 40);
  }
}

function takaisin() {
  clearInterval(timerInterval); clearInterval(kirjoitusTimer);
  nakyta('screen-setup');
  document.getElementById('aihe').value = '';
  dropZone.classList.remove('has-file');
  fileNameEl.textContent = '';
}

// ── DRAG & DROP ──
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('file-name');
const aiheTextarea = document.getElementById('aihe');

function lueTiedosto(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let teksti = e.target.result;
    if (file.name.endsWith('.html') || file.name.endsWith('.htm'))
      teksti = teksti.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    aiheTextarea.value = teksti;
    fileNameEl.textContent = '✅ ' + file.name + ' (' + Math.round(file.size/1024) + ' KB)';
    dropZone.classList.add('has-file');
  };
  reader.readAsText(file, 'UTF-8');
}

fileInput.addEventListener('change', e => lueTiedosto(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) lueTiedosto(file);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('screen-kirjoitus')?.classList.contains('active')) {
    if (!document.getElementById('kirj-input').disabled) kirjoitusTarkista();
  }
  if (e.key === ' ' && document.getElementById('screen-kortit')?.classList.contains('active')) {
    e.preventDefault();
    if (!document.getElementById('flash-kortti').classList.contains('kaannetty')) kaannaKortti();
  }
});

const savedKey = localStorage.getItem("claude_api_key");
if (savedKey) document.getElementById("api-key").value = savedKey;

// ══ TABS ══
function vaihdaTab(tab) {
  document.querySelectorAll('.input-tab').forEach((t, i) => {
    const tabs = ['tiedosto', 'kamera', 'teksti'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.input-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
  if (tab === 'kamera') aloitaKamera();
  else pysaytaKamera();
}

// ══ KAMERA ══
let kameraStream = null;
let kameraFacing = 'environment'; // takakamera ensin
let otettuKuvaData = null;

async function aloitaKamera() {
  pysaytaKamera();
  try {
    document.getElementById('ocr-status').textContent = '';
    document.getElementById('kuva-esikatselu').style.display = 'none';
    document.getElementById('kamera-wrap').style.display = 'block';
    kameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: kameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    document.getElementById('kamera-video').srcObject = kameraStream;
  } catch (e) {
    document.getElementById('ocr-status').textContent = '⚠️ Kamera ei ole käytettävissä: ' + e.message;
    document.getElementById('ocr-status').className = 'ocr-status virhe';
  }
}

function pysaytaKamera() {
  if (kameraStream) {
    kameraStream.getTracks().forEach(t => t.stop());
    kameraStream = null;
  }
}

async function vaihdaKamera() {
  kameraFacing = kameraFacing === 'environment' ? 'user' : 'environment';
  await aloitaKamera();
}

// Aseta vaihda-nappi oikein (inline onclick ei pysty kutsua async suoraan)
document.addEventListener('DOMContentLoaded', () => {
  const vaihda = document.querySelector('.kamera-btn.vaihda');
  if (vaihda) vaihda.onclick = vaihdaKamera;
});

function otaKuva() {
  const video = document.getElementById('kamera-video');
  const canvas = document.getElementById('kamera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  otettuKuvaData = canvas.toDataURL('image/jpeg', 0.92);

  // Näytä esikatselu
  document.getElementById('kuva-preview').src = otettuKuvaData;
  document.getElementById('kuva-esikatselu').style.display = 'block';
  document.getElementById('kamera-wrap').style.display = 'none';
  document.getElementById('ocr-status').textContent = '✅ Kuva otettu — paina "Analysoi teksti"';
  document.getElementById('ocr-status').className = 'ocr-status valmis';

  pysaytaKamera();

  // Korjaa analysoi-nappi
  document.querySelector('.kuva-btn.analysoi').onclick = analysoiKuva;
}

function uusiKuva() {
  otettuKuvaData = null;
  document.getElementById('kuva-esikatselu').style.display = 'none';
  document.getElementById('ocr-status').textContent = '';
  aloitaKamera();
}

async function analysoiKuva() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) { alert('Syötä ensin API-avain!'); return; }
  if (!otettuKuvaData) { alert('Ota ensin kuva!'); return; }

  const status = document.getElementById('ocr-status');
  status.textContent = '🔍 Analysoidaan kuvaa...';
  status.className = 'ocr-status lataa';

  try {
    const base64 = otettuKuvaData.split(',')[1];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 }
            },
            {
              type: "text",
              text: "Lue tämä kuva tarkasti ja pura kaikki teksti siitä. Säilytä rakenne (otsikot, kappaleet, listat) mahdollisimman hyvin. Palauta AINOASTAAN kuvan teksti ilman kommentteja tai selityksiä."
            }
          ]
        }]
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const teksti = data.content[0].text.trim();
    document.getElementById('aihe').value = teksti;

    // Vaihda teksti-tabille jotta käyttäjä näkee tuloksen
    vaihdaTab('teksti');

    status.textContent = `✅ Teksti tunnistettu (${teksti.length} merkkiä) — tarkista ja aloita koe!`;
    status.className = 'ocr-status valmis';

  } catch (e) {
    status.textContent = '⚠️ Virhe: ' + e.message;
    status.className = 'ocr-status virhe';
  }
}