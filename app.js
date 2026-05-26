const STORAGE_KEY = "jtp_web_data_v2";

const initialData = {
  settings: {
    weeklyGoalHours: 10,
    platforms: ["France Travail", "Indeed", "LinkedIn", "Apec", "Welcome to the Jungle", "Hellowork", "Autre"],
    customPlatforms: [],
    ai: {
      provider: "chatgpt",
      mode: "link",
      apiKey: ""
    }
  },
  sessions: [],
  runtime: {
    running: false,
    paused: false,
    startIso: null,
    elapsedBeforePause: 0,
    platform: "France Travail",
    actionType: "recherche d'offres",
    notes: "",
    urls: [],
    files: []
  }
};

const ACTIONS = [
  "recherche d'offres",
  "candidature envoyée",
  "mise à jour CV",
  "message recruteur",
  "entretien",
  "formation"
];

const PLATFORM_URLS = {
  "France Travail": "https://www.francetravail.fr",
  "Indeed": "https://fr.indeed.com",
  "LinkedIn": "https://www.linkedin.com/jobs",
  "Apec": "https://www.apec.fr",
  "Welcome to the Jungle": "https://www.welcometothejungle.com/fr/jobs",
  "Hellowork": "https://www.hellowork.com",
  "Autre": ""
};

let state = loadState();
let timerInterval = null;

const views = ["dashboard", "session", "history", "report", "settings"];
const tabLabels = {
  dashboard: "Tableau de bord",
  session: "Session",
  history: "Historique",
  report: "Rapport",
  settings: "Paramètres"
};

const uiState = {
  historyFilters: {
    platform: "all",
    action: "all",
    dateFrom: "",
    dateTo: "",
    query: "",
    sortBy: "date_desc"
  },
  reportRange: {
    dateFrom: "",
    dateTo: ""
  }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(initialData);
    const merged = { ...structuredClone(initialData), ...JSON.parse(raw) };
    merged.settings = merged.settings || structuredClone(initialData.settings);
    merged.settings.ai = { ...structuredClone(initialData.settings.ai), ...(merged.settings.ai || {}) };
    merged.runtime.urls = merged.runtime.urls || [];
    merged.runtime.files = merged.runtime.files || [];
    return merged;
  } catch {
    return structuredClone(initialData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("fr-FR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function hms(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function elapsedNow() {
  const r = state.runtime;
  if (!r.running || r.paused || !r.startIso) return r.elapsedBeforePause;
  const delta = Math.floor((Date.now() - new Date(r.startIso).getTime()) / 1000);
  return Math.max(0, r.elapsedBeforePause + delta);
}

function todaySeconds() {
  const d = new Date();
  return state.sessions
    .filter(s => {
      const t = new Date(s.startIso);
      return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate();
    })
    .reduce((a, s) => a + (s.durationSeconds || 0), 0);
}

function weekSeconds() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  return state.sessions
    .filter(s => new Date(s.startIso) >= monday)
    .reduce((a, s) => a + (s.durationSeconds || 0), 0);
}

function totalProofs() {
  return state.sessions.reduce((a, s) => a + ((s.proofs || []).length), 0);
}

function matchesDateRange(iso, from, to) {
  if (!iso) return false;
  const d = new Date(iso);
  if (from) {
    const fromDate = new Date(`${from}T00:00:00`);
    if (d < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(`${to}T23:59:59`);
    if (d > toDate) return false;
  }
  return true;
}

function renderTabs(active = "dashboard") {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = views.map(v => `<button class="tab-btn ${v === active ? "active" : ""}" data-view="${v}">${tabLabels[v]}</button>`).join("");
  tabs.querySelectorAll("button").forEach(b => (b.onclick = () => switchView(b.dataset.view)));
}

function switchView(view) {
  views.forEach(v => document.getElementById(v).classList.toggle("hidden", v !== view));
  renderTabs(view);
  renderAll();
}

function renderDashboard() {
  const week = weekSeconds();
  const goalSec = state.settings.weeklyGoalHours * 3600;
  const pct = goalSec ? Math.min(100, Math.round((week / goalSec) * 100)) : 0;
  document.getElementById("dashboard").innerHTML = `
    <div class="grid">
      <div class="card"><div class="label">Aujourd'hui</div><div class="stat">${hms(todaySeconds())}</div></div>
      <div class="card"><div class="label">Semaine</div><div class="stat">${hms(week)}</div></div>
      <div class="card"><div class="label">Sessions</div><div class="stat">${state.sessions.length}</div></div>
      <div class="card"><div class="label">Preuves</div><div class="stat">${totalProofs()}</div></div>
    </div>
    <div class="card">
      <div class="label">Objectif hebdo: ${state.settings.weeklyGoalHours} h</div>
      <div class="small">Progression: ${pct}%</div>
      <progress max="100" value="${pct}" style="width:100%;height:14px"></progress>
    </div>
  `;
}

function renderSession() {
  const allPlatforms = [...new Set([...state.settings.platforms, ...state.settings.customPlatforms])];
  const r = state.runtime;

  document.getElementById("session").innerHTML = `
    <div class="card">
      <div class="row">
        <div style="flex:1;min-width:230px">
          <label class="small">Plateforme</label>
          <select id="platformSel">${allPlatforms.map(p => `<option ${p === r.platform ? "selected" : ""}>${p}</option>`).join("")}</select>
        </div>
        <div style="flex:1;min-width:230px">
          <label class="small">Action</label>
          <select id="actionSel">${ACTIONS.map(a => `<option ${a === r.actionType ? "selected" : ""}>${a}</option>`).join("")}</select>
        </div>
      </div>
      <div class="timer" id="timerText">${hms(elapsedNow())}</div>
      <div class="row">
        <button class="btn-primary" id="startBtn">Démarrer</button>
        <button class="btn-warn" id="pauseBtn">Pause</button>
        <button class="btn-ok" id="finishBtn">Terminer</button>
        <button id="openPlatformBtn">Ouvrir la plateforme</button>
      </div>
    </div>

    <div class="card">
      <label class="small">Notes</label>
      <textarea id="notesInput" rows="4">${r.notes || ""}</textarea>
      <div class="row" style="margin-top:8px">
        <button id="aiAssistBtn">Assistant IA (notes + URLs)</button>
      </div>
      <div id="aiResult" class="small" style="margin-top:8px;white-space:pre-wrap"></div>
    </div>

    <div class="card">
      <label class="small">Ajouter une URL en attente</label>
      <div class="row">
        <input id="urlInput" placeholder="https://..." style="flex:1" />
        <button id="addUrlBtn">Ajouter</button>
      </div>
      <div id="urlList" style="margin-top:8px"></div>
      <div class="row" style="margin-top:8px">
        <button id="openAllPendingUrls">Ouvrir toutes les URLs en attente</button>
      </div>
    </div>

    <div class="card">
      <label class="small">Ajouter une capture/fichier (image ou PDF)</label>
      <input id="proofFileInput" type="file" accept="image/*,.pdf,application/pdf" />
      <div id="fileList" style="margin-top:8px"></div>
    </div>
  `;

  document.getElementById("platformSel").onchange = e => { r.platform = e.target.value; saveState(); };
  document.getElementById("actionSel").onchange = e => { r.actionType = e.target.value; saveState(); };
  document.getElementById("notesInput").oninput = e => { r.notes = e.target.value; saveState(); };
  document.getElementById("aiAssistBtn").onclick = async () => {
    const sessionDraft = {
      platform: r.platform,
      actionType: r.actionType,
      notes: r.notes || "",
      urls: r.urls || []
    };
    await runAiAssistant(sessionDraft);
  };
  document.getElementById("openPlatformBtn").onclick = () => {
    const url = PLATFORM_URLS[r.platform];
    if (!url) {
      alert("Aucune URL par défaut pour cette plateforme. Ajoute ton lien manuellement dans les URLs.");
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  document.getElementById("startBtn").onclick = () => {
    if (!r.running) {
      r.running = true;
      r.paused = false;
      r.startIso = new Date().toISOString();
      r.elapsedBeforePause = 0;
    } else if (r.paused) {
      r.paused = false;
      r.startIso = new Date().toISOString();
    }
    saveState();
    startTicker();
    renderSession();
  };

  document.getElementById("pauseBtn").onclick = () => {
    if (!r.running || r.paused) return;
    r.elapsedBeforePause = elapsedNow();
    r.paused = true;
    r.startIso = null;
    saveState();
    renderSession();
  };

  document.getElementById("finishBtn").onclick = () => {
    if (!r.running) return;
    const end = new Date();
    const duration = elapsedNow();
    const start = new Date(end.getTime() - duration * 1000);
    const nowIso = new Date().toISOString();

    const urlProofs = (r.urls || []).map((u, i) => ({
      id: `${Date.now()}_u_${i}`,
      title: "Lien session",
      type: "url",
      url: u,
      createdAt: nowIso
    }));

    const fileProofs = (r.files || []).map((f, i) => ({
      id: `${Date.now()}_f_${i}`,
      title: f.name || `Fichier ${i + 1}`,
      type: f.type,
      fileName: f.name,
      mimeType: f.mimeType,
      dataUrl: f.dataUrl,
      createdAt: nowIso
    }));

    const session = {
      id: String(Date.now()),
      platform: r.platform,
      actionType: r.actionType,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      durationSeconds: duration,
      notes: r.notes,
      didApply: r.actionType.toLowerCase().includes("candidature"),
      proofs: [...urlProofs, ...fileProofs]
    };

    state.sessions.unshift(session);
    state.runtime = structuredClone(initialData.runtime);
    saveState();
    stopTicker();
    renderAll();
  };

  document.getElementById("addUrlBtn").onclick = () => {
    const inp = document.getElementById("urlInput");
    const v = inp.value.trim();
    if (!/^https?:\/\//i.test(v)) return;
    r.urls = r.urls || [];
    if (!r.urls.includes(v)) r.urls.push(v);
    inp.value = "";
    saveState();
    renderSession();
  };

  document.getElementById("proofFileInput").onchange = async e => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      r.files.push({
        name: file.name,
        mimeType: file.type,
        type: file.type.startsWith("image/") ? "image" : "pdf",
        dataUrl
      });
    }
    saveState();
    renderSession();
  };

  const list = document.getElementById("urlList");
  list.innerHTML = (r.urls || []).map((u, i) => `
    <div class="list-item">
      <div class="link">${u}</div>
      <button data-i="${i}" class="rm-url">Supprimer</button>
    </div>
  `).join("") || `<div class="small">Aucune URL en attente.</div>`;

  list.querySelectorAll(".rm-url").forEach(btn => {
    btn.onclick = () => {
      r.urls.splice(Number(btn.dataset.i), 1);
      saveState();
      renderSession();
    };
  });
  document.getElementById("openAllPendingUrls").onclick = () => {
    const urls = (r.urls || []).filter(u => /^https?:\/\//i.test(u));
    if (!urls.length) {
      alert("Aucune URL valide à ouvrir.");
      return;
    }
    urls.forEach(url => window.open(url, "_blank", "noopener"));
  };

  const fileList = document.getElementById("fileList");
  fileList.innerHTML = (r.files || []).map((f, i) => `
    <div class="list-item">
      <div><strong>${f.name}</strong> <span class="small">(${f.type})</span></div>
      ${f.type === "image" ? `<img src="${f.dataUrl}" alt="preview" style="max-width:120px;max-height:90px;border:1px solid #dbe4f1;border-radius:8px;margin-top:6px" />` : `<div class="small">PDF prêt à être sauvegardé dans la session.</div>`}
      <button data-i="${i}" class="rm-file" style="margin-top:6px">Supprimer</button>
    </div>
  `).join("") || `<div class="small">Aucun fichier en attente.</div>`;

  fileList.querySelectorAll(".rm-file").forEach(btn => {
    btn.onclick = () => {
      r.files.splice(Number(btn.dataset.i), 1);
      saveState();
      renderSession();
    };
  });
}

function renderProof(proof) {
  if (proof.type === "url") {
    return `<div class="small">🔗 <a class="link" href="${proof.url}" target="_blank" rel="noopener">${proof.url}</a></div>`;
  }
  if (proof.type === "image") {
    return `<div><img src="${proof.dataUrl || ""}" alt="preuve" style="max-width:180px;max-height:130px;border:1px solid #dbe4f1;border-radius:8px" /></div>`;
  }
  if (proof.type === "pdf") {
    if (!proof.dataUrl) return `<div class="small">PDF indisponible</div>`;
    return `<div class="small">📄 ${proof.fileName || "PDF"} - <a class="link" href="${proof.dataUrl}" target="_blank" rel="noopener">Ouvrir</a></div>`;
  }
  return `<div class="small">Preuve</div>`;
}

function renderHistory() {
  const allPlatforms = [...new Set([...state.settings.platforms, ...state.settings.customPlatforms])];
  const filters = uiState.historyFilters;
  const sessions = state.sessions.filter(s => {
    const byPlatform = filters.platform === "all" || s.platform === filters.platform;
    const byAction = filters.action === "all" || s.actionType === filters.action;
    const byDate = matchesDateRange(s.startIso, filters.dateFrom, filters.dateTo);
    const q = filters.query.trim().toLowerCase();
    const allText = [
      s.platform,
      s.actionType,
      s.notes || "",
      ...(s.proofs || []).map(p => `${p.title || ""} ${p.url || ""} ${p.fileName || ""}`)
    ].join(" ").toLowerCase();
    const byQuery = !q || allText.includes(q);
    return byPlatform && byAction && byDate && byQuery;
  }).sort((a, b) => {
    const s = filters.sortBy;
    if (s === "date_asc") return new Date(a.startIso) - new Date(b.startIso);
    if (s === "duration_desc") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
    if (s === "duration_asc") return (a.durationSeconds || 0) - (b.durationSeconds || 0);
    if (s === "platform_asc") return String(a.platform || "").localeCompare(String(b.platform || ""), "fr");
    if (s === "platform_desc") return String(b.platform || "").localeCompare(String(a.platform || ""), "fr");
    return new Date(b.startIso) - new Date(a.startIso);
  });

  document.getElementById("history").innerHTML = `
    <div class="card">
      <strong>Filtres historique</strong>
      <div class="row" style="margin-top:8px">
        <select id="histPlatform" style="flex:1;min-width:190px">
          <option value="all">Toutes les plateformes</option>
          ${allPlatforms.map(p => `<option value="${p}" ${filters.platform === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
        <select id="histAction" style="flex:1;min-width:190px">
          <option value="all">Toutes les actions</option>
          ${ACTIONS.map(a => `<option value="${a}" ${filters.action === a ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="histDateFrom" type="date" value="${filters.dateFrom}" />
        <input id="histDateTo" type="date" value="${filters.dateTo}" />
        <input id="histQuery" placeholder="Recherche mot-clé..." value="${filters.query}" style="flex:1;min-width:220px" />
        <select id="histSort" style="min-width:220px">
          <option value="date_desc" ${filters.sortBy === "date_desc" ? "selected" : ""}>Tri: plus récent</option>
          <option value="date_asc" ${filters.sortBy === "date_asc" ? "selected" : ""}>Tri: plus ancien</option>
          <option value="duration_desc" ${filters.sortBy === "duration_desc" ? "selected" : ""}>Tri: durée décroissante</option>
          <option value="duration_asc" ${filters.sortBy === "duration_asc" ? "selected" : ""}>Tri: durée croissante</option>
          <option value="platform_asc" ${filters.sortBy === "platform_asc" ? "selected" : ""}>Tri: plateforme A-Z</option>
          <option value="platform_desc" ${filters.sortBy === "platform_desc" ? "selected" : ""}>Tri: plateforme Z-A</option>
        </select>
        <button id="histReset">Réinitialiser</button>
      </div>
    </div>
    <div class="card"><strong>Historique (${sessions.length})</strong></div>
    ${(sessions.length ? sessions : []).map(s => `
      <div class="list-item">
        <div><strong>${s.platform}</strong> - ${s.actionType}</div>
        <div class="small">${fmtDate(s.startIso)} → ${fmtDate(s.endIso)} | ${hms(s.durationSeconds || 0)}</div>
        <div class="small">Postulé: ${s.didApply ? "Oui" : "Non"} | Preuves: ${(s.proofs || []).length}</div>
        <div class="row" style="margin-top:6px">
          <button class="open-session-urls" data-session-id="${s.id}">Ouvrir URLs de la session</button>
        </div>
        ${(s.proofs || []).length ? `<div style="margin-top:8px">${(s.proofs || []).map(renderProof).join("")}</div>` : ""}
      </div>
    `).join("") || `<div class="card">Aucune session.</div>`}
  `;

  document.getElementById("histPlatform").onchange = e => {
    uiState.historyFilters.platform = e.target.value;
    renderHistory();
  };
  document.getElementById("histAction").onchange = e => {
    uiState.historyFilters.action = e.target.value;
    renderHistory();
  };
  document.getElementById("histDateFrom").onchange = e => {
    uiState.historyFilters.dateFrom = e.target.value;
    renderHistory();
  };
  document.getElementById("histDateTo").onchange = e => {
    uiState.historyFilters.dateTo = e.target.value;
    renderHistory();
  };
  document.getElementById("histQuery").oninput = e => {
    uiState.historyFilters.query = e.target.value;
    renderHistory();
  };
  document.getElementById("histSort").onchange = e => {
    uiState.historyFilters.sortBy = e.target.value;
    renderHistory();
  };
  document.getElementById("histReset").onclick = () => {
    uiState.historyFilters = { platform: "all", action: "all", dateFrom: "", dateTo: "", query: "", sortBy: "date_desc" };
    renderHistory();
  };
  document.querySelectorAll(".open-session-urls").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.sessionId;
      const session = state.sessions.find(s => s.id === id);
      const urls = (session?.proofs || []).filter(p => p.type === "url" && /^https?:\/\//i.test(p.url || "")).map(p => p.url);
      if (!urls.length) {
        alert("Aucune URL trouvée dans cette session.");
        return;
      }
      urls.forEach(url => window.open(url, "_blank", "noopener"));
    };
  });
}

function renderReport() {
  const period = uiState.reportRange;
  const filtered = state.sessions.filter(s => matchesDateRange(s.startIso, period.dateFrom, period.dateTo));
  const total = filtered.reduce((a, s) => a + (s.durationSeconds || 0), 0);
  const applied = filtered.filter(s => s.didApply).length;
  const byPlatform = {};
  filtered.forEach(s => byPlatform[s.platform] = (byPlatform[s.platform] || 0) + (s.durationSeconds || 0));
  const reportDate = new Date().toLocaleString("fr-FR");

  document.getElementById("report").innerHTML = `
    <div class="card no-print">
      <strong>Période du rapport</strong>
      <div class="row" style="margin-top:8px">
        <input id="reportDateFrom" type="date" value="${period.dateFrom}" />
        <input id="reportDateTo" type="date" value="${period.dateTo}" />
        <button id="reportApplyFilter">Appliquer</button>
        <button id="reportClearFilter">Tout</button>
      </div>
    </div>
    <div class="card" id="printableReport">
      <div class="report-head">
        <h2>JobTime Proof - Rapport d'activité</h2>
        <div class="small">Généré le: ${reportDate}</div>
        <div class="small">Période: ${period.dateFrom || "Début"} au ${period.dateTo || "Aujourd'hui"}</div>
      </div>
      <div class="grid report-kpis">
        <div class="card"><div class="label">Temps total</div><div class="stat">${hms(total)}</div></div>
        <div class="card"><div class="label">Sessions</div><div class="stat">${filtered.length}</div></div>
        <div class="card"><div class="label">Candidatures</div><div class="stat">${applied}</div></div>
        <div class="card"><div class="label">Preuves</div><div class="stat">${filtered.reduce((a, s) => a + (s.proofs || []).length, 0)}</div></div>
      </div>
      <hr />
      <div><strong>Total par plateforme</strong></div>
      ${Object.entries(byPlatform).map(([k,v]) => `<div class="small">• ${k}: ${hms(v)}</div>`).join("") || `<div class="small">Aucune donnée.</div>`}
      <hr />
      <div><strong>Détail des sessions</strong></div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Plateforme</th>
            <th>Action</th>
            <th>Durée</th>
            <th>Postulé</th>
            <th>Preuves</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(s => `
            <tr>
              <td>${fmtDate(s.startIso)}</td>
              <td>${s.platform}</td>
              <td>${s.actionType}</td>
              <td>${hms(s.durationSeconds || 0)}</td>
              <td>${s.didApply ? "Oui" : "Non"}</td>
              <td>${(s.proofs || []).length}</td>
            </tr>
          `).join("") || `<tr><td colspan="6">Aucune session sur la période.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="card no-print">
      <button id="printPdf" class="btn-primary">Générer PDF (Imprimer)</button>
      <div class="small">Astuce: dans la fenêtre d'impression, choisissez "Enregistrer en PDF".</div>
    </div>
  `;

  document.getElementById("reportApplyFilter").onclick = () => {
    uiState.reportRange.dateFrom = document.getElementById("reportDateFrom").value;
    uiState.reportRange.dateTo = document.getElementById("reportDateTo").value;
    renderReport();
  };
  document.getElementById("reportClearFilter").onclick = () => {
    uiState.reportRange = { dateFrom: "", dateTo: "" };
    renderReport();
  };
  document.getElementById("printPdf").onclick = () => window.print();
}

function renderSettings() {
  const ai = state.settings.ai || structuredClone(initialData.settings.ai);
  document.getElementById("settings").innerHTML = `
    <div class="card">
      <label class="small">Objectif hebdomadaire (heures)</label>
      <input id="goalInput" type="number" min="1" max="60" value="${state.settings.weeklyGoalHours}" />
      <div class="row" style="margin-top:8px"><button id="saveGoal" class="btn-primary">Enregistrer</button></div>
    </div>

    <div class="card">
      <label class="small">Ajouter plateforme personnalisée</label>
      <div class="row">
        <input id="platformInput" placeholder="Nom plateforme" style="flex:1" />
        <button id="addPlatform">Ajouter</button>
      </div>
      <div style="margin-top:8px">${state.settings.customPlatforms.map(p => `<span class="list-item" style="display:inline-block;margin-right:6px">${p}</span>`).join("") || `<span class='small'>Aucune</span>`}</div>
    </div>

    <div class="card">
      <div class="row">
        <button id="exportJson">Exporter JSON</button>
        <label class="btn-primary" style="display:inline-block;padding:10px 12px;cursor:pointer">
          Importer JSON
          <input id="importJsonFile" type="file" accept="application/json" style="display:none" />
        </label>
      </div>
      <div class="small" style="margin-top:8px">L'import remplace toutes les données locales.</div>
    </div>

    <div class="card">
      <strong>Assistant IA</strong>
      <div class="row" style="margin-top:8px">
        <select id="aiProvider" style="flex:1;min-width:190px">
          <option value="chatgpt" ${ai.provider === "chatgpt" ? "selected" : ""}>ChatGPT</option>
          <option value="gemini" ${ai.provider === "gemini" ? "selected" : ""}>Gemini</option>
          <option value="mistral" ${ai.provider === "mistral" ? "selected" : ""}>Mistral</option>
        </select>
        <select id="aiMode" style="flex:1;min-width:190px">
          <option value="link" ${ai.mode === "link" ? "selected" : ""}>Sans clé (ouverture web)</option>
          <option value="api" ${ai.mode === "api" ? "selected" : ""}>API directe</option>
        </select>
      </div>
      <div style="margin-top:8px">
        <input id="aiApiKey" type="password" placeholder="Clé API (mode API directe)" value="${ai.apiKey || ""}" />
      </div>
      <div class="row" style="margin-top:8px">
        <button id="saveAiSettings" class="btn-primary">Enregistrer IA</button>
      </div>
      <div class="small" style="margin-top:8px">
        Mode lien: ouvre le provider avec un prompt prêt. Mode API: réponse IA directement dans l'app.
      </div>
    </div>

    <div class="card">
      <button id="clearAll" class="btn-warn">Supprimer toutes les données</button>
    </div>
  `;

  document.getElementById("saveGoal").onclick = () => {
    state.settings.weeklyGoalHours = Number(document.getElementById("goalInput").value || 10);
    saveState();
    renderDashboard();
  };

  document.getElementById("addPlatform").onclick = () => {
    const v = document.getElementById("platformInput").value.trim();
    if (!v) return;
    if (!state.settings.customPlatforms.includes(v)) state.settings.customPlatforms.push(v);
    saveState();
    renderSettings();
  };

  document.getElementById("exportJson").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jobtime-proof-web-${Date.now()}.json`;
    a.click();
  };

  document.getElementById("saveAiSettings").onclick = () => {
    state.settings.ai = state.settings.ai || structuredClone(initialData.settings.ai);
    state.settings.ai.provider = document.getElementById("aiProvider").value;
    state.settings.ai.mode = document.getElementById("aiMode").value;
    state.settings.ai.apiKey = document.getElementById("aiApiKey").value.trim();
    saveState();
    alert("Paramètres IA enregistrés.");
  };

  document.getElementById("importJsonFile").onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || !Array.isArray(data.sessions)) {
        alert("Fichier JSON invalide.");
        return;
      }
      if (!confirm("Importer ce JSON et remplacer les données locales ?")) return;
      state = { ...structuredClone(initialData), ...data };
      state.runtime = state.runtime || structuredClone(initialData.runtime);
      state.runtime.urls = state.runtime.urls || [];
      state.runtime.files = state.runtime.files || [];
      saveState();
      renderAll();
    } catch {
      alert("Impossible de lire le JSON.");
    }
  };

  document.getElementById("clearAll").onclick = () => {
    if (!confirm("Supprimer toutes les données locales ?")) return;
    state = structuredClone(initialData);
    saveState();
    renderAll();
  };
}

function buildAiPrompt(draft) {
  return [
    "Tu es un coach de recherche d'emploi. Réponds en français, clair et actionnable.",
    `Plateforme: ${draft.platform || "-"}`,
    `Action: ${draft.actionType || "-"}`,
    `Notes: ${draft.notes || "-"}`,
    `URLs:\n${(draft.urls || []).join("\n") || "-"}`,
    "",
    "Fais:",
    "1) Résumé court",
    "2) 5 actions prioritaires",
    "3) Vérification qualité candidature (CV, lettre, suivi)",
    "4) Risques/points manquants",
    "5) Modèle de message de relance"
  ].join("\n");
}

function openAiWithPrompt(provider, prompt) {
  const encoded = encodeURIComponent(prompt);
  let url = "";
  if (provider === "gemini") {
    url = `https://gemini.google.com/app`;
  } else if (provider === "mistral") {
    url = `https://chat.mistral.ai/`;
  } else {
    url = `https://chat.openai.com/`;
  }
  window.open(url, "_blank", "noopener");
  navigator.clipboard.writeText(prompt).catch(() => {});
  alert("Prompt copié. Colle-le dans la discussion IA ouverte.");
}

async function runAiAssistant(draft) {
  const ai = state.settings.ai || structuredClone(initialData.settings.ai);
  const resultEl = document.getElementById("aiResult");
  const prompt = buildAiPrompt(draft);

  if (ai.mode === "link") {
    openAiWithPrompt(ai.provider, prompt);
    if (resultEl) resultEl.textContent = "Mode lien: provider ouvert, prompt copié dans le presse-papiers.";
    return;
  }

  if (!ai.apiKey) {
    alert("Ajoute une clé API dans Paramètres > Assistant IA.");
    return;
  }

  if (resultEl) resultEl.textContent = "Analyse IA en cours...";
  try {
    const text = await callAiApi(ai.provider, ai.apiKey, prompt);
    if (resultEl) resultEl.textContent = text || "Réponse IA vide.";
  } catch (e) {
    if (resultEl) resultEl.textContent = `Erreur IA: ${e.message}`;
  }
}

async function callAiApi(provider, apiKey, prompt) {
  if (provider === "chatgpt") {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    return data.output_text || "";
  }

  if (provider === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  }

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function startTicker() {
  stopTicker();
  timerInterval = setInterval(() => {
    const el = document.getElementById("timerText");
    if (el) el.textContent = hms(elapsedNow());
  }, 1000);
}

function stopTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function renderAll() {
  renderDashboard();
  renderSession();
  renderHistory();
  renderReport();
  renderSettings();
}

renderTabs();
renderAll();
if (state.runtime.running && !state.runtime.paused) startTicker();
