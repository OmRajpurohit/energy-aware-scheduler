import {
  renderEnergyChart,
  renderComparisonChart,
  renderUtilizationChart
} from "./charts/chart.js";

const DEFAULT_ROWS = [
  { arrival: 0, burst: 6, deadline: 10 },
  { arrival: 2, burst: 4, deadline: 9 },
  { arrival: 4, burst: 7, deadline: 14 }
];

const PROCESS_COLORS = ["#14b8a6", "#2563eb", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9", "#84cc16"];
const MIN_PLAYBACK_MS = 4500;
const MAX_PLAYBACK_MS = 16000;

let processCount = 0;
let latestSimulationResult = null;
let timelineState = createTimelineState();

/* ─── TRASH ICON SVG ─── */
function trashIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}

/* ─── PROCESS TABLE ─── */
function addRow(process = {}) {
  const table = document.querySelector("#processTable tbody");
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="process-id">P${processCount + 1}</td>
    <td><input type="number" min="0" value="${process.arrival ?? 0}" /></td>
    <td><input type="number" min="1" value="${process.burst ?? 1}" /></td>
    <td><input type="number" min="0" value="${process.deadline ?? 0}" /></td>
    <td><button class="icon-btn" type="button" onclick="deleteRow(this)" aria-label="Remove process">${trashIcon()}</button></td>
  `;

  table.appendChild(row);
  processCount += 1;
}

function deleteRow(button) {
  button.closest("tr").remove();
  refreshProcessLabels();
}

function refreshProcessLabels() {
  const rows = document.querySelectorAll("#processTable tbody tr");
  rows.forEach((row, index) => {
    row.querySelector(".process-id").textContent = `P${index + 1}`;
  });
  processCount = rows.length;
}

function loadDemoData() {
  const table = document.querySelector("#processTable tbody");
  table.innerHTML = "";
  processCount = 0;
  DEFAULT_ROWS.forEach(addRow);
  setStatus("Sample data loaded. Press Run Simulation when ready.", "info");
}

function getProcesses() {
  return Array.from(document.querySelectorAll("#processTable tbody tr")).map((row, index) => {
    const inputs = row.querySelectorAll("input");
    return {
      id: `P${index + 1}`,
      arrival: Number.parseInt(inputs[0].value, 10),
      burst:   Number.parseInt(inputs[1].value, 10),
      deadline: Number.parseInt(inputs[2].value, 10)
    };
  });
}

function validateProcesses(tasks) {
  if (!tasks.length) return "Add at least one process before running the simulation.";
  const invalid = tasks.find(t =>
    Number.isNaN(t.arrival) || Number.isNaN(t.burst) || Number.isNaN(t.deadline) ||
    t.arrival < 0 || t.burst < 1 || t.deadline < 0
  );
  if (invalid) return "Use valid numeric values: arrival ≥ 0, burst ≥ 1, deadline ≥ 0.";
  return null;
}

/* ─── SIMULATION ─── */
async function runSimulation() {
  const tasks = getProcesses();
  const err = validateProcesses(tasks);
  if (err) { setStatus(err, "error"); return; }

  const runButton = document.getElementById("runButton");
  const data = {
    tasks,
    cores:          Number.parseInt(document.getElementById("cores").value, 10),
    algorithm:      document.getElementById("algorithm").value,
    mode:           document.getElementById("mode").value,
    quantum:        Number.parseInt(document.getElementById("quantum").value, 10),
    comparisonMode: isComparisonModeEnabled()
  };

  runButton.disabled = true;
  runButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg> Running…`;
  setStatus("Computing schedule…", "info");
  setServerBadge("Checking API…");

  try {
    const result = await requestSchedule(data);
    latestSimulationResult = result;
    renderSummary(result);
    renderInsights(result.insights);
    renderGantt(result.timeline);
    renderProcessMetrics(result.processes);
    renderCharts(result);
    setServerBadge("API connected", true);
    setStatus(
      `${result.request.algorithmLabel} completed — ${result.request.taskCount} processes, ${result.summary.totalTime} time units.`,
      "success"
    );
    activateTab("summary");
  } catch (error) {
    clearResults();
    setServerBadge("API offline", false);
    setStatus(error.message, "error");
    console.error(error);
  } finally {
    runButton.disabled = false;
    runButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Simulation`;
  }
}

async function requestSchedule(data) {
  const endpoints = getApiEndpoints("/api/schedule");
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const payload = await tryReadJson(response);
        throw new Error(payload.error || `Request failed with status ${response.status}.`);
      }
      return response.json();
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
  throw new Error("The Flask backend is not reachable on port 5000. Start it with `python app.py`, then re-run.");
}

async function tryReadJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function checkApiHealth() {
  const endpoints = getApiEndpoints("/api/health");
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) { setServerBadge("API connected", true); return; }
    } catch { /* try next */ }
  }
  setServerBadge("API offline", false);
}

/* ─── RENDER: SUMMARY ─── */
function renderSummary(result) {
  const { summary, metrics, request } = result;
  const gameStats = buildGameStats(result);

  /* 3 key metrics always shown */
  const scoreHtml = isGamificationEnabled()
    ? `<article class="metric-card accent-score">
         <span class="metric-label">Simulation Score</span>
         <strong class="metric-value">${gameStats.points}</strong>
         <p class="metric-note">Level ${gameStats.level} — ${gameStats.title}</p>
       </article>`
    : "";

  document.getElementById("summaryCards").innerHTML = `
    ${scoreHtml}
    <article class="metric-card accent-energy">
      <span class="metric-label">CPU Utilization</span>
      <strong class="metric-value">${metrics.cpuUtilization}%</strong>
      <p class="metric-note">${summary.idleTime} idle time units</p>
    </article>
    <article class="metric-card accent-time">
      <span class="metric-label">Avg Turnaround</span>
      <strong class="metric-value">${metrics.averageTurnaroundTime}</strong>
      <p class="metric-note">Avg wait: ${metrics.averageWaitingTime}</p>
    </article>
    <article class="metric-card accent-deadline">
      <span class="metric-label">Deadline Success</span>
      <strong class="metric-value">${metrics.deadlineSuccessRate}%</strong>
      <p class="metric-note">${metrics.missedDeadlines} missed</p>
    </article>
  `;

  /* Gamification block */
  const gamBlock = document.getElementById("gamificationBlock");
  if (isGamificationEnabled()) {
    gamBlock.style.display = "";
    renderMissionControl(result, gameStats);
    renderAchievementRack(gameStats);
    renderPerformancePulse(result, gameStats);
  } else {
    gamBlock.style.display = "none";
  }

  /* Detail metrics grid */
  document.getElementById("metrics").innerHTML = `
    <div class="details-grid">
      <div><span>Algorithm</span><strong>${summary.algorithmLabel}</strong></div>
      <div><span>DVFS Mode</span><strong>${formatMode(summary.mode)}</strong></div>
      <div><span>Cores</span><strong>${summary.cores}</strong></div>
      <div><span>RR Quantum</span><strong>${request.quantum}</strong></div>
      <div><span>Total Time</span><strong>${summary.totalTime}</strong></div>
      <div><span>Total Energy</span><strong>${summary.totalEnergy}</strong></div>
      <div><span>DVFS Savings</span><strong>${summary.energySavingsRate}%</strong></div>
      <div><span>Throughput</span><strong>${metrics.throughput}</strong></div>
      <div><span>Avg Response</span><strong>${metrics.averageResponseTime}</strong></div>
      <div><span>Avg Frequency</span><strong>${summary.averageFrequency} GHz</strong></div>
      <div><span>Baseline Energy</span><strong>${summary.baselineEnergy}</strong></div>
      <div><span>Comparison</span><strong>${request.comparisonMode ? "Enabled" : "Off"}</strong></div>
    </div>
  `;
}

function renderMissionControl(result, gameStats) {
  const { summary, metrics } = result;
  document.getElementById("missionControl").innerHTML = `
    <article class="control-card score-card">
      <div class="score-headline">
        <span class="mini-kicker">Command Score</span>
        <strong>${gameStats.points}</strong>
      </div>
      <div class="level-row">
        <div>
          <span class="mini-kicker">Level ${gameStats.level}</span>
          <p>${gameStats.title}</p>
        </div>
        <div class="streak-pill">
          <span>Streak</span>
          <strong>${gameStats.streak}x</strong>
        </div>
      </div>
      <div class="xp-track">
        <span class="xp-fill" style="width:${gameStats.levelProgress}%"></span>
      </div>
      <div class="score-meta">
        <span>${summary.algorithmLabel}</span>
        <span>${metrics.deadlineSuccessRate}% success</span>
        <span>${summary.energySavingsRate}% saved</span>
      </div>
    </article>
    <article class="control-card gauge-card">
      ${renderGauge("CPU Load", metrics.cpuUtilization, `${metrics.cpuUtilization}%`, "blue")}
      ${renderGauge("Queue Flow", clampValue(100 - (metrics.averageWaitingTime * 12)), `${metrics.averageWaitingTime} wt`, "purple")}
      ${renderGauge("Turnaround", clampValue(100 - (metrics.averageTurnaroundTime * 8)), `${metrics.averageTurnaroundTime} tt`, "green")}
    </article>
    <article class="control-card mission-log">
      <div class="log-row"><span class="mini-kicker">Live Mode</span><strong>${formatMode(summary.mode)}</strong></div>
      <div class="log-row"><span class="mini-kicker">Core Mesh</span><strong>${summary.cores} Active Cores</strong></div>
      <div class="log-row"><span class="mini-kicker">Playback</span><strong>${result.timeline?.totalTime ?? 0} Time Units</strong></div>
      <div class="log-row"><span class="mini-kicker">Focus</span><strong>${gameStats.focus}</strong></div>
    </article>
  `;
}

function renderGauge(label, value, metric, tone) {
  return `
    <div class="gauge-shell ${tone}">
      <div class="gauge-ring" style="--gauge-value:${clampValue(value)}%">
        <div class="gauge-core">
          <strong>${metric}</strong>
          <span>${label}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAchievementRack(gameStats) {
  document.getElementById("achievementRack").innerHTML = gameStats.badges.map(badge => `
    <article class="achievement-badge ${badge.tone}">
      <span class="badge-icon">${badge.icon}</span>
      <div>
        <strong>${badge.label}</strong>
        <p>${badge.description}</p>
      </div>
    </article>
  `).join("");
}

function renderPerformancePulse(result, gameStats) {
  const { summary, metrics } = result;
  const tracks = [
    { label: "CPU Usage",        value: clampValue(metrics.cpuUtilization),                              tone: "blue",   meta: `${metrics.cpuUtilization}% active` },
    { label: "Waiting Pressure", value: clampValue(100 - (metrics.averageWaitingTime * 12)),             tone: "purple", meta: `${metrics.averageWaitingTime} avg wait` },
    { label: "Turnaround Tempo", value: clampValue(100 - (metrics.averageTurnaroundTime * 8)),           tone: "green",  meta: `${metrics.averageTurnaroundTime} avg turnaround` },
    { label: "Energy Efficiency",value: clampValue(summary.energySavingsRate),                           tone: "cyan",   meta: `${summary.energySavingsRate}% saved` }
  ];

  document.getElementById("performancePulse").innerHTML = `
    <div class="pulse-header">
      <div>
        <p class="mini-kicker">Performance Pulse</p>
        <h3>Efficiency Tracks</h3>
      </div>
      <div class="pulse-score">${gameStats.grade}</div>
    </div>
    <div class="pulse-grid">
      ${tracks.map(t => `
        <div class="pulse-track-card">
          <div class="pulse-track-top"><span>${t.label}</span><strong>${t.meta}</strong></div>
          <div class="pulse-track">
            <span class="pulse-track-fill ${t.tone}" style="width:${t.value}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ─── RENDER: INSIGHTS ─── */
function renderInsights(insights = {}) {
  const deadlineMisses = insights.deadlineMisses || [];
  const bottlenecks    = insights.bottlenecks || [];
  const suggestions    = insights.suggestions || [];

  if (!deadlineMisses.length && !bottlenecks.length && !suggestions.length) {
    document.getElementById("insightsPanel").innerHTML = `
      <div class="insight-card">
        <h3>Healthy Schedule</h3>
        <p>No deadline misses or major bottlenecks detected.</p>
      </div>
    `;
    return;
  }

  document.getElementById("insightsPanel").innerHTML = `
    <div class="insight-grid">
      <article class="insight-card">
        <h3>Deadline Misses</h3>
        ${deadlineMisses.length ? `<ul>${deadlineMisses.map(i => `<li>${i.process} missed ${i.deadline}, finished at ${i.completionTime} — ${i.reason}</li>`).join("")}</ul>` : "<p>None detected.</p>"}
      </article>
      <article class="insight-card">
        <h3>Bottlenecks</h3>
        ${bottlenecks.length ? `<ul>${bottlenecks.map(i => `<li>${i.message}</li>`).join("")}</ul>` : "<p>No queue hotspots detected.</p>"}
      </article>
      <article class="insight-card">
        <h3>Suggestions</h3>
        ${suggestions.length ? `<ul>${suggestions.map(i => `<li>${i}</li>`).join("")}</ul>` : "<p>Configuration is already well aligned.</p>"}
      </article>
    </div>
  `;
}

/* ─── RENDER: GANTT ─── */
function renderGantt(timeline) {
  const container = document.getElementById("gantt");
  resetTimelineAnimation();

  if (!timeline?.lanes?.length || timeline.totalTime <= 0) {
    container.innerHTML = `<p class="empty-state">Run a simulation to generate a schedule timeline.</p>`;
    document.getElementById("energyMeterPanel").style.display = "none";
    timelineState = createTimelineState();
    updateTimelineBanner("Animated playback highlights each core independently as the simulation clock advances.", 0, 0);
    syncTimelineControls();
    return;
  }

  const totalTime = timeline.totalTime;
  container.innerHTML = `
    <div class="gantt-board">
      <div class="gantt-axis">${buildTimeTicks(totalTime)}</div>
      <div class="gantt-lanes" id="ganttLaneStack">
        <div id="timelineCursor" class="timeline-cursor"></div>
        ${timeline.lanes.map((lane, li) => `
          <div class="gantt-lane">
            <div class="gantt-lane-label">${lane.label}</div>
            <div class="gantt-track">
              ${lane.segments.map(seg => {
                const left  = (seg.start / totalTime) * 100;
                const width = Math.max((seg.duration / totalTime) * 100, 2.4);
                const accent = getProcessColor(seg.process, li);
                const base   = seg.deadlineMet ? "#16a34a" : "#dc2626";
                const tip = [
                  `${seg.process} on ${seg.coreLabel}`,
                  `Start: ${seg.start}`, `End: ${seg.end}`,
                  `Energy: ${seg.energy}`, `Freq: ${seg.frequency} GHz`
                ].join("\n");
                return `
                  <article class="gantt-segment pending ${seg.deadlineMet ? "deadline-met" : "deadline-missed"}"
                    data-start="${seg.start}" data-end="${seg.end}"
                    data-process="${seg.process}" data-core="${seg.coreLabel}"
                    style="left:${left}%; width:${width}%; --segment-progress:0%; background:linear-gradient(135deg,${base},${accent});"
                    title="${tip}">
                    <div class="gantt-fill"></div>
                    <div class="gantt-content">
                      <span class="gantt-title">${seg.process}</span>
                      <span class="gantt-time">${seg.start} – ${seg.end}</span>
                      <span class="gantt-meta">${seg.frequency} GHz | ${seg.energy}</span>
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  loadTimeline(timeline);
}

function buildTimeTicks(totalTime) {
  const steps  = Math.max(4, Math.min(8, Math.ceil(totalTime)));
  const values = Array.from({ length: steps + 1 }, (_, i) => roundNumber((totalTime / steps) * i));
  return values.map(v => `
    <span class="gantt-tick" style="left:${totalTime > 0 ? (v / totalTime) * 100 : 0}%">
      <em>${v}</em>
    </span>
  `).join("");
}

/* ─── RENDER: PER-PROCESS ─── */
function renderProcessMetrics(processes) {
  const container = document.getElementById("processMetrics");
  if (!processes.length) {
    container.innerHTML = `<p class="empty-state">Per-process metrics will appear after a simulation run.</p>`;
    return;
  }
  container.innerHTML = `
    <table class="process-metrics-table">
      <thead>
        <tr>
          <th>ID</th><th>Arrival</th><th>Burst</th><th>Deadline</th>
          <th>Waiting</th><th>Turnaround</th><th>Response</th>
          <th>Frequency</th><th>Energy</th><th>Δ Baseline</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${processes.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${p.arrival}</td>
            <td>${p.burst}</td>
            <td>${p.deadline ?? "—"}</td>
            <td>${p.waitingTime}</td>
            <td>${p.turnaroundTime}</td>
            <td>${p.responseTime}</td>
            <td>${p.frequencyProfile}</td>
            <td>${p.totalEnergy}</td>
            <td>${formatSigned(p.energyDelta)}</td>
            <td><span class="deadline-badge ${p.deadlineMet ? "met" : "missed"}">${p.deadlineMet ? "Met" : "Missed"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ─── RENDER: CHARTS ─── */
function renderCharts(result) {
  const live = document.getElementById("liveChartsToggle").checked;
  applyChartSelection();
  if (!live) { updateChartStatus("Live updates paused. Toggle to refresh.", "paused"); return; }
  renderEnergyChart(result);
  renderUtilizationChart(result);
  if (isComparisonModeEnabled()) renderComparisonChart(result);
  updateChartStatus(getChartSelectionMessage(), "active");
}

function clearResults() {
  document.getElementById("missionControl").innerHTML  = buildMissionControlIdle();
  document.getElementById("achievementRack").innerHTML = buildAchievementRackIdle();
  document.getElementById("summaryCards").innerHTML    = "";
  document.getElementById("performancePulse").innerHTML= buildPerformancePulseIdle();
  document.getElementById("metrics").innerHTML         = "";
  document.getElementById("insightsPanel").innerHTML   = "";
  document.getElementById("gantt").innerHTML           = `<p class="empty-state">Run a simulation to generate a schedule timeline.</p>`;
  document.getElementById("energyMeterPanel").style.display = "none";
  document.getElementById("processMetrics").innerHTML  = `<p class="empty-state">Per-process metrics will appear after a simulation run.</p>`;

  // Respect gamification toggle
  const gamBlock = document.getElementById("gamificationBlock");
  if (gamBlock) gamBlock.style.display = isGamificationEnabled() ? "" : "none";

  updateTimelineBanner("Animated playback highlights each core independently as the simulation clock advances.", 0, 0);
  timelineState = createTimelineState();
  resetTimelineAnimation();
  syncTimelineControls();
  updateChartStatus("Run a simulation to populate the selected chart view.", "idle");
}

/* ─── TABS ─── */
function activateTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  buttons.forEach((btn, i) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    btn.addEventListener("keydown", e => {
      let next = null;
      if (e.key === "ArrowRight") next = buttons[(i + 1) % buttons.length];
      if (e.key === "ArrowLeft")  next = buttons[(i - 1 + buttons.length) % buttons.length];
      if (e.key === "Home") next = buttons[0];
      if (e.key === "End")  next = buttons[buttons.length - 1];
      if (next) { next.focus(); activateTab(next.dataset.tab); e.preventDefault(); }
    });
    // Set initial tabindex
    btn.tabIndex = btn.classList.contains("active") ? 0 : -1;
  });
}

/* ─── QUANTUM FIELD SHOW/HIDE ─── */
function updateQuantumVisibility() {
  const algo = document.getElementById("algorithm").value;
  const field = document.getElementById("quantumField");
  if (field) field.classList.toggle("hidden-field", algo !== "RR");
}

function handleAlgorithmChange() {
  updateQuantumVisibility();
}

/* ─── GAMIFICATION TOGGLE ─── */
function handleGamificationToggle() {
  if (latestSimulationResult) {
    renderSummary(latestSimulationResult);
  }
}

function isGamificationEnabled() {
  return document.getElementById("gamificationToggle").checked;
}

/* ─── API & HELPERS ─── */
function getApiEndpoints(path) {
  return window.location.port === "5000"
    ? [path]
    : [`http://127.0.0.1:5000${path}`, `http://localhost:5000${path}`, path];
}

function setStatus(message, tone = "info") {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.className = `status-banner ${tone}`;
}

function setServerBadge(message, isOnline) {
  const badge = document.getElementById("serverStatus");
  badge.textContent = message;
  badge.className = `server-badge ${isOnline === true ? "online" : isOnline === false ? "offline" : "pending"}`;
}

/* ─── CHART HELPERS ─── */
function applyChartSelection() {
  const sel = document.getElementById("chartViewSelect").value;
  const cmp = isComparisonModeEnabled();
  document.querySelectorAll(".chart-card").forEach(card => {
    let vis = sel === "all" || card.dataset.chart === sel;
    if (card.dataset.chart === "comparison" && !cmp) vis = false;
    card.classList.toggle("hidden", !vis);
  });
}

function getChartSelectionMessage() {
  const sel = document.getElementById("chartViewSelect").value;
  const cmp = isComparisonModeEnabled();
  if (sel === "comparison" && !cmp) return "Enable Comparison Mode to see algorithm charts.";
  if (sel === "energy")      return "Showing Energy vs Time.";
  if (sel === "comparison")  return "Showing algorithm comparison charts.";
  if (sel === "utilization") return "Showing CPU Utilization.";
  return cmp ? "Showing all charts." : "Showing core charts. Enable Comparison Mode for side-by-side benchmarks.";
}

function updateChartStatus(message, tone = "active") {
  const el = document.getElementById("chartLiveStatus");
  el.textContent = message;
  el.className = `chart-status ${tone}`;
}

function handleChartSelection() {
  applyChartSelection();
  if (!document.getElementById("liveChartsToggle").checked) {
    updateChartStatus("Live updates paused. Chart layout is ready.", "paused");
    return;
  }
  if (latestSimulationResult) { renderCharts(latestSimulationResult); return; }
  updateChartStatus("Select a chart, then run a simulation.", "idle");
}

function handleLiveToggle() {
  if (!document.getElementById("liveChartsToggle").checked) {
    updateChartStatus("Live updates paused. Existing results stay visible.", "paused");
    return;
  }
  if (latestSimulationResult) { renderCharts(latestSimulationResult); return; }
  updateChartStatus(getChartSelectionMessage(), "active");
}

function handleComparisonToggle() {
  applyChartSelection();
  if (latestSimulationResult && document.getElementById("liveChartsToggle").checked) {
    renderCharts(latestSimulationResult);
    return;
  }
  updateChartStatus(getChartSelectionMessage(), isComparisonModeEnabled() ? "active" : "idle");
}

function isComparisonModeEnabled() {
  return document.getElementById("comparisonModeToggle").checked;
}

/* ─── TIMELINE ─── */
function loadTimeline(timeline) {
  timelineState = {
    timeline,
    currentTime: 0,
    isPlaying: false,
    completed: false,
    animationFrame: null,
    playbackDurationMs: getPlaybackDuration(timeline.totalTime)
  };
  // Reset energy monitor history so replay starts fresh
  emState.history = [];
  emState.peakRate = 0;
  emState.lastSampledTime = -1;
  // Init energy monitor with timeline + summary from latest result
  initEnergyMonitor(timeline, latestSimulationResult?.summary ?? null);
  updateTimelineVisuals();
  updateTimelineBanner("Playback ready. Press play to animate the schedule.", 0, timeline.totalTime);
  syncTimelineControls();
  playTimeline();
}

function playTimeline() {
  if (!timelineState.timeline) { updateTimelineBanner("Run a simulation first.", 0, 0); return; }
  if (timelineState.isPlaying) return;
  if (timelineState.completed) { timelineState.currentTime = 0; timelineState.completed = false; }
  const totalTime = timelineState.timeline.totalTime || 0;
  timelineState.isPlaying = true;
  timelineState.animationStartedAt = performance.now() - ((timelineState.currentTime / Math.max(totalTime, 1)) * timelineState.playbackDurationMs);
  syncTimelineControls();
  timelineState.animationFrame = window.requestAnimationFrame(stepTimeline);
}

function pauseTimeline() {
  if (!timelineState.timeline || !timelineState.isPlaying) return;
  timelineState.isPlaying = false;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner("Timeline paused.", timelineState.currentTime, timelineState.timeline.totalTime);
  syncTimelineControls();
}

function replayTimeline() {
  if (!timelineState.timeline) { updateTimelineBanner("Run a simulation first.", 0, 0); return; }
  resetTimelineAnimation();
  timelineState.currentTime = 0;
  timelineState.completed   = false;
  timelineState.isPlaying   = false;
  // Reset energy monitor for fresh replay
  emState.history = [];
  emState.peakRate = 0;
  emState.lastSampledTime = -1;
  renderEMStats(0, 0, 0, new Array(emState.coreCount).fill(0));
  renderEMSparkline(timelineState.timeline.totalTime);
  updateCoreBarDOM(new Array(emState.coreCount).fill(0));
  updateTimelineVisuals();
  updateTimelineBanner("Replay ready. Press play to restart.", 0, timelineState.timeline.totalTime);
  syncTimelineControls();
  playTimeline();
}

function stepTimeline(timestamp) {
  if (!timelineState.timeline || !timelineState.isPlaying) return;
  const totalTime = timelineState.timeline.totalTime || 0;
  const elapsed  = timestamp - timelineState.animationStartedAt;
  const progress = Math.min(elapsed / timelineState.playbackDurationMs, 1);
  timelineState.currentTime = roundNumber(progress * totalTime);
  updateTimelineVisuals();
  if (progress >= 1) { finishTimelinePlayback(); return; }
  timelineState.animationFrame = window.requestAnimationFrame(stepTimeline);
}

function finishTimelinePlayback() {
  timelineState.isPlaying = false;
  timelineState.completed = true;
  timelineState.currentTime = timelineState.timeline?.totalTime ?? 0;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner("Execution complete.", timelineState.currentTime, timelineState.timeline?.totalTime ?? 0);
  syncTimelineControls();
}

/* ─── ENERGY MONITOR STATE ─── */
const emState = {
  canvas: null,
  ctx: null,
  // Raw per-segment energy values extracted from timeline
  segments: [],           // [{start, end, coreIndex, energyPerUnit, totalEnergy, process}]
  coreCount: 0,
  totalFinalEnergy: 0,
  baselineEnergy: 0,
  // Live history (one entry per animation frame sample)
  history: [],            // [{t, cumulative, rate, perCore:[]}]
  peakRate: 0,
  lastSampledTime: -1,
  HISTORY_SAMPLES: 120,   // max points on sparkline
};

function initEnergyMonitor(timeline, summary) {
  const panel = document.getElementById("energyMeterPanel");
  if (!timeline?.lanes?.length) { panel.style.display = "none"; return; }

  // Parse energyPerUnit from each segment's energy string (e.g. "1.44 J" → 1.44)
  // Energy rate = totalEnergy / duration  (J per time unit)
  const segs = [];
  timeline.lanes.forEach((lane, li) => {
    lane.segments.forEach(seg => {
      const total   = parseEnergyValue(seg.energy);
      const dur     = Math.max(seg.end - seg.start, 0.01);
      segs.push({
        start:         seg.start,
        end:           seg.end,
        coreIndex:     li,
        energyPerUnit: total / dur,
        totalEnergy:   total,
        process:       seg.process,
      });
    });
  });

  emState.segments      = segs;
  emState.coreCount     = timeline.lanes.length;
  emState.totalFinalEnergy = segs.reduce((s, sg) => s + sg.totalEnergy, 0);
  emState.baselineEnergy   = parseEnergyValue(summary?.baselineEnergy ?? "0");
  emState.history       = [];
  emState.peakRate      = 0;
  emState.lastSampledTime = -1;

  // Build per-core DOM bars
  buildCoreBreakdownBars(timeline.lanes);

  // Init canvas
  emState.canvas = document.getElementById("emCanvas");
  emState.ctx    = emState.canvas?.getContext("2d") ?? null;

  // Init x-axis ticks
  renderEMXAxis(timeline.totalTime);

  panel.style.display = "";
  renderEMStats(0, 0, 0, new Array(emState.coreCount).fill(0));
  renderEMSparkline(timeline.totalTime);
  renderEMYAxis(0);
}

function parseEnergyValue(str) {
  if (!str) return 0;
  const n = Number.parseFloat(String(str).replace(/[^0-9.eE+-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function buildCoreBreakdownBars(lanes) {
  const container = document.getElementById("emCores");
  container.innerHTML = lanes.map((lane, i) => `
    <div class="em-core-bar" id="emCore${i}">
      <div class="em-core-bar-header">
        <span class="em-core-bar-label">${lane.label}</span>
        <span class="em-core-bar-value" id="emCoreVal${i}">0.00 J</span>
      </div>
      <div class="em-core-track">
        <span class="em-core-fill em-core-fill-${i % 8}" id="emCoreFill${i}" style="width:0%"></span>
      </div>
      <div class="em-core-bar-rate" id="emCoreRate${i}">0.00 J/t</div>
    </div>
  `).join("");
}

function renderEMXAxis(totalTime) {
  const el = document.getElementById("emXAxis");
  const steps = 5;
  el.innerHTML = Array.from({ length: steps + 1 }, (_, i) =>
    `<span>${roundNumber((totalTime / steps) * i)}</span>`
  ).join("");
}

/* Called every animation frame from updateTimelineVisuals */
function tickEnergyMonitor(currentTime, totalTime) {
  if (!emState.canvas || emState.segments.length === 0) return;

  // Sample at most every 0.1 sim-time units to avoid over-populating
  if (Math.abs(currentTime - emState.lastSampledTime) < 0.05 && currentTime < totalTime) return;
  emState.lastSampledTime = currentTime;

  // Compute cumulative energy consumed up to currentTime
  let cumulative = 0;
  const perCore  = new Array(emState.coreCount).fill(0);

  for (const seg of emState.segments) {
    if (currentTime <= seg.start) continue;
    const activeUntil = Math.min(currentTime, seg.end);
    const consumed    = (activeUntil - seg.start) * seg.energyPerUnit;
    cumulative += consumed;
    perCore[seg.coreIndex] = (perCore[seg.coreIndex] || 0) + consumed;
  }

  // Instantaneous rate: energy consumed in last ~0.5 sim units
  const windowStart  = Math.max(0, currentTime - 0.5);
  let windowEnergy   = 0;
  for (const seg of emState.segments) {
    if (currentTime <= seg.start || windowStart >= seg.end) continue;
    const from = Math.max(seg.start, windowStart);
    const to   = Math.min(seg.end,   currentTime);
    windowEnergy += (to - from) * seg.energyPerUnit;
  }
  const rate = windowEnergy / 0.5;
  if (rate > emState.peakRate) emState.peakRate = rate;

  // Store history point
  if (emState.history.length >= emState.HISTORY_SAMPLES) emState.history.shift();
  emState.history.push({ t: currentTime, cumulative, rate, perCore: [...perCore] });

  // Update DOM
  renderEMStats(cumulative, rate, emState.peakRate, perCore);
  renderEMSparkline(totalTime);
  renderEMYAxis(emState.totalFinalEnergy);
  updateCoreBarDOM(perCore);
}

function renderEMStats(cumulative, rate, peak, perCore) {
  const saved = emState.baselineEnergy > 0
    ? emState.baselineEnergy - cumulative
    : null;
  const efficiency = emState.totalFinalEnergy > 0
    ? clampValue((1 - (cumulative / emState.totalFinalEnergy)) * 100 + 50)
    : null;

  safeSet("emTotal",      `${cumulative.toFixed(2)} J`);
  safeSet("emRate",       `${rate.toFixed(2)} J/t`);
  safeSet("emPeak",       `${peak.toFixed(2)} J/t`);
  safeSet("emSaved",      saved !== null ? `${saved.toFixed(2)} J` : "—");
  safeSet("emEfficiency", efficiency !== null ? `${efficiency.toFixed(1)}%` : "—");
}

function safeSet(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateCoreBarDOM(perCore) {
  const maxVal = Math.max(...perCore, 0.001);
  perCore.forEach((val, i) => {
    const pct  = (val / maxVal) * 100;
    const fill = document.getElementById(`emCoreFill${i}`);
    const valEl= document.getElementById(`emCoreVal${i}`);
    const rateEl = document.getElementById(`emCoreRate${i}`);
    if (fill)  fill.style.width = `${pct}%`;
    if (valEl) valEl.textContent = `${val.toFixed(2)} J`;
    // Per-core rate: energy in last 0.5t for this core
    if (rateEl) {
      const coreRate = computeCoreRate(i);
      rateEl.textContent = `${coreRate.toFixed(2)} J/t`;
    }
  });
}

function computeCoreRate(coreIndex) {
  const h = emState.history;
  if (h.length < 2) return 0;
  const last = h[h.length - 1];
  const prev = h[Math.max(0, h.length - 4)];
  const dt   = last.t - prev.t;
  if (dt <= 0) return 0;
  return Math.max(0, (last.perCore[coreIndex] - prev.perCore[coreIndex])) / dt;
}

function renderEMSparkline(totalTime) {
  const canvas = emState.canvas;
  const ctx    = emState.ctx;
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || canvas.offsetWidth  || 400;
  const H   = canvas.clientHeight || canvas.offsetHeight || 130;

  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.clearRect(0, 0, W, H);

  const history = emState.history;
  const maxE    = emState.totalFinalEnergy || 1;
  const PAD     = { top: 6, right: 6, bottom: 4, left: 2 };
  const plotW   = W - PAD.left - PAD.right;
  const plotH   = H - PAD.top  - PAD.bottom;

  if (history.length < 2) {
    // Draw empty grid
    drawEMGrid(ctx, PAD, plotW, plotH, W, H);
    return;
  }

  // X: map sim-time 0..totalTime → plot pixels
  const xFor = t => PAD.left + (t / Math.max(totalTime, 0.001)) * plotW;
  // Y: map energy 0..maxE → plot pixels (inverted)
  const yFor = e => PAD.top  + plotH - (e / maxE) * plotH;

  drawEMGrid(ctx, PAD, plotW, plotH, W, H);

  // ── Draw cumulative energy fill ──
  ctx.save();
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
  grad.addColorStop(0,   "rgba(24, 215, 255, 0.38)");
  grad.addColorStop(0.6, "rgba(91, 140, 255, 0.20)");
  grad.addColorStop(1,   "rgba(91, 140, 255, 0.04)");

  ctx.beginPath();
  ctx.moveTo(xFor(history[0].t), yFor(0));
  history.forEach(pt => ctx.lineTo(xFor(pt.t), yFor(pt.cumulative)));
  ctx.lineTo(xFor(history[history.length - 1].t), yFor(0));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Draw cumulative energy line ──
  ctx.beginPath();
  history.forEach((pt, idx) => {
    idx === 0 ? ctx.moveTo(xFor(pt.t), yFor(pt.cumulative)) : ctx.lineTo(xFor(pt.t), yFor(pt.cumulative));
  });
  ctx.strokeStyle = "rgba(24, 215, 255, 0.92)";
  ctx.lineWidth   = 2.2;
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  ctx.shadowColor = "rgba(24, 215, 255, 0.5)";
  ctx.shadowBlur  = 10;
  ctx.stroke();
  ctx.shadowBlur  = 0;
  ctx.restore();

  // ── Draw rate line (secondary, dashed) ──
  const maxRate = Math.max(emState.peakRate, 0.001);
  ctx.save();
  ctx.beginPath();
  history.forEach((pt, idx) => {
    const ry = PAD.top + plotH - (pt.rate / maxRate) * plotH;
    idx === 0 ? ctx.moveTo(xFor(pt.t), ry) : ctx.lineTo(xFor(pt.t), ry);
  });
  ctx.strokeStyle = "rgba(192, 132, 252, 0.65)";
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Live cursor dot ──
  const last = history[history.length - 1];
  ctx.save();
  ctx.beginPath();
  ctx.arc(xFor(last.t), yFor(last.cumulative), 4.5, 0, Math.PI * 2);
  ctx.fillStyle   = "#18d7ff";
  ctx.shadowColor = "rgba(24, 215, 255, 0.8)";
  ctx.shadowBlur  = 14;
  ctx.fill();
  ctx.restore();
}

function drawEMGrid(ctx, PAD, plotW, plotH, W, H) {
  ctx.save();
  ctx.strokeStyle = "rgba(147, 197, 253, 0.07)";
  ctx.lineWidth   = 1;
  const rows = 4;
  for (let i = 0; i <= rows; i++) {
    const y = PAD.top + (i / rows) * plotH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
  }
  ctx.restore();
}

function renderEMYAxis(maxE) {
  const el = document.getElementById("emYAxis");
  if (!el) return;
  const steps = 4;
  el.innerHTML = Array.from({ length: steps + 1 }, (_, i) => {
    const val = (maxE / steps) * (steps - i);
    return `<span>${val.toFixed(1)}</span>`;
  }).join("");
}

function updateTimelineVisuals() {
  const totalTime   = timelineState.timeline?.totalTime ?? 0;
  const currentTime = timelineState.currentTime;
  const segments    = document.querySelectorAll(".gantt-segment");
  const cursor      = document.getElementById("timelineCursor");
  const active      = [];

  if (cursor) cursor.style.left = `${totalTime > 0 ? Math.min((currentTime / totalTime) * 100, 100) : 0}%`;

  segments.forEach(seg => {
    const start    = Number.parseFloat(seg.dataset.start);
    const end      = Number.parseFloat(seg.dataset.end);
    const progress = currentTime <= start ? 0 : currentTime >= end ? 1 : (currentTime - start) / Math.max(end - start, 0.01);
    seg.style.setProperty("--segment-progress", `${progress * 100}%`);
    seg.classList.toggle("pending",   progress === 0);
    seg.classList.toggle("active",    progress > 0 && progress < 1);
    seg.classList.toggle("completed", progress >= 1);
    if (progress > 0 && progress < 1) active.push(`${seg.dataset.core}: ${seg.dataset.process}`);
  });

  // ── Tick the real-time energy monitor every frame ──
  tickEnergyMonitor(currentTime, totalTime);

  if (timelineState.completed) {
    updateTimelineBanner("Execution complete. All lanes finished.", currentTime, totalTime);
    return;
  }
  if (!timelineState.timeline) {
    updateTimelineBanner("Animated playback highlights each core independently.", 0, 0);
    return;
  }
  if (!active.length && currentTime === 0) {
    updateTimelineBanner("Playback ready. Press play to animate.", currentTime, totalTime);
    return;
  }
  updateTimelineBanner(active.length ? active.join(" | ") : "Between arrivals or after completion.", currentTime, totalTime);
}

function updateTimelineBanner(message, currentTime, totalTime) {
  document.getElementById("timelineClock").textContent = `t = ${roundNumber(currentTime)}${totalTime ? ` / ${roundNumber(totalTime)}` : ""}`;
  document.getElementById("timelineLegend").textContent = message;
}

function syncTimelineControls() {
  const has = Boolean(timelineState.timeline);
  document.getElementById("timelinePlayButton").disabled  = !has || timelineState.isPlaying;
  document.getElementById("timelinePauseButton").disabled = !has || !timelineState.isPlaying;
  document.getElementById("timelineReplayButton").disabled= !has;
}

function resetTimelineAnimation() {
  if (timelineState.animationFrame) {
    window.cancelAnimationFrame(timelineState.animationFrame);
    timelineState.animationFrame = null;
  }
}

function createTimelineState() {
  return { timeline: null, currentTime: 0, isPlaying: false, completed: false, animationFrame: null, playbackDurationMs: MIN_PLAYBACK_MS };
}

function getPlaybackDuration(totalTime) {
  if (!totalTime) return MIN_PLAYBACK_MS;
  return Math.min(MAX_PLAYBACK_MS, Math.max(MIN_PLAYBACK_MS, totalTime * 650));
}

/* ─── GAME STATS ─── */
function buildGameStats(result) {
  const { summary, metrics, processes } = result;
  const eff   = clampValue(
    (metrics.deadlineSuccessRate * 0.36) +
    (summary.energySavingsRate * 0.26) +
    (clampValue(100 - (metrics.averageWaitingTime * 12)) * 0.18) +
    (clampValue(metrics.cpuUtilization) * 0.2)
  );
  const points = Math.round((eff * 18) + (summary.cores * 55) + (metrics.throughput * 180) - (metrics.missedDeadlines * 45));
  const level  = Math.max(1, Math.floor(points / 320) + 1);
  const levelProgress = clampValue(((points % 320) / 320) * 100);
  const streak = metrics.missedDeadlines === 0
    ? Math.max(3, Math.round((metrics.deadlineSuccessRate / 10) + (summary.energySavingsRate / 20)))
    : Math.max(1, Math.round(metrics.deadlineSuccessRate / 25));
  const grade = eff >= 92 ? "S+" : eff >= 84 ? "A" : eff >= 72 ? "B" : eff >= 58 ? "C" : "D";
  const badges = [];

  if (metrics.deadlineSuccessRate === 100) badges.push({ icon: "◎", label: "Deadline Guardian", description: "Every process hit its deadline.", tone: "green" });
  if (summary.energySavingsRate >= 30)    badges.push({ icon: "◈", label: "Energy Hunter",     description: "Strong DVFS savings profile.", tone: "blue" });
  if (metrics.cpuUtilization >= 75)       badges.push({ icon: "✦", label: "Core Commander",    description: "Cores stayed engaged.", tone: "purple" });
  if (processes.every(p => p.deadlineMet && p.energyDelta <= 0))
    badges.push({ icon: "⬢", label: "Perfect Sync", description: "Deadlines met, energy below baseline.", tone: "cyan" });
  if (!badges.length)
    badges.push({ icon: "◌", label: "Warmup Run", description: "Tune the workload to unlock badges.", tone: "neutral" });

  const titles = ["Queue Cadet","Latency Ranger","Deadline Tactician","Core Strategist","Neon Scheduler","Quantum Architect"];
  return {
    points, level, levelProgress, streak, grade, badges,
    title: titles[Math.min(level - 1, titles.length - 1)],
    focus: metrics.missedDeadlines > 0
      ? "Reduce misses with faster dispatch."
      : summary.energySavingsRate < 15
        ? "Push harder on DVFS efficiency."
        : "Maintain this execution rhythm."
  };
}

/* ─── IDLE BUILDERS ─── */
function buildMissionControlIdle() {
  return `
    <article class="control-card score-card idle-card">
      <div class="score-headline"><span class="mini-kicker">Command Score</span><strong>0000</strong></div>
      <div class="level-row">
        <div><span class="mini-kicker">Level 1</span><p>Queue Cadet</p></div>
        <div class="streak-pill"><span>Streak</span><strong>0x</strong></div>
      </div>
      <div class="xp-track"><span class="xp-fill" style="width:18%"></span></div>
      <div class="score-meta"><span>Awaiting run</span><span>Telemetry offline</span><span>Rewards locked</span></div>
    </article>
    <article class="control-card gauge-card">
      ${renderGauge("CPU Load", 18, "—", "blue")}
      ${renderGauge("Queue Flow", 24, "—", "purple")}
      ${renderGauge("Turnaround", 30, "—", "green")}
    </article>
    <article class="control-card mission-log idle-card">
      <div class="log-row"><span class="mini-kicker">Live Mode</span><strong>Balanced</strong></div>
      <div class="log-row"><span class="mini-kicker">Core Mesh</span><strong>Awaiting input</strong></div>
      <div class="log-row"><span class="mini-kicker">Playback</span><strong>Standby</strong></div>
      <div class="log-row"><span class="mini-kicker">Focus</span><strong>Launch a run to score.</strong></div>
    </article>
  `;
}

function buildAchievementRackIdle() {
  return `
    <article class="achievement-badge neutral">
      <span class="badge-icon">◌</span>
      <div><strong>Achievements</strong><p>Run the simulator to unlock badges.</p></div>
    </article>
  `;
}

function buildPerformancePulseIdle() {
  return `
    <div class="pulse-header">
      <div><p class="mini-kicker">Performance Pulse</p><h3>Efficiency Tracks</h3></div>
      <div class="pulse-score">—</div>
    </div>
    <div class="pulse-grid">
      ${["CPU Usage","Waiting Pressure","Turnaround Tempo","Energy Efficiency"].map((label, i) => `
        <div class="pulse-track-card">
          <div class="pulse-track-top"><span>${label}</span><strong>Awaiting run</strong></div>
          <div class="pulse-track">
            <span class="pulse-track-fill ${["blue","purple","green","cyan"][i]}" style="width:${20 + i * 8}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ─── FORMAT HELPERS ─── */
function formatMode(mode) {
  if (mode === "power")       return "Power Saver";
  if (mode === "performance") return "Performance";
  return "Balanced";
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getProcessColor(processId, fallback = 0) {
  const n = Number.parseInt(String(processId).replace(/\D/g, ""), 10);
  const i = Number.isNaN(n) ? fallback : n - 1;
  return PROCESS_COLORS[((i % PROCESS_COLORS.length) + PROCESS_COLORS.length) % PROCESS_COLORS.length];
}

function roundNumber(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampValue(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, roundNumber(value)));
}

/* ─── TOOLTIP ─── */
function initTooltips() {
  const tip = document.getElementById("tooltipEl");

  function show(el, text) {
    tip.textContent = text;
    tip.classList.add("visible");
    moveTip(el);
  }

  function moveTip(el) {
    const rect = el.getBoundingClientRect();
    tip.style.top  = `${rect.bottom + 8}px`;
    tip.style.left = `${Math.min(rect.left, window.innerWidth - tip.offsetWidth - 12)}px`;
  }

  function hide() {
    tip.classList.remove("visible");
  }

  document.addEventListener("mouseover", e => {
    const el = e.target.closest("[data-tip]");
    if (el) show(el, el.dataset.tip);
  });

  document.addEventListener("mouseout", e => {
    if (e.target.closest("[data-tip]")) hide();
  });
}

/* ─── INIT ─── */
function initialize() {
  initTabs();
  initTooltips();
  loadDemoData();
  clearResults();
  setServerBadge("Waiting for API");
  applyChartSelection();
  checkApiHealth();

  // Wire algorithm dropdown to quantum field visibility
  const algoSelect = document.getElementById("algorithm");
  if (algoSelect) {
    algoSelect.addEventListener("change", handleAlgorithmChange);
    updateQuantumVisibility(); // set initial state
  }
}

/* ─── GLOBALS (for inline HTML events) ─── */
window.addRow              = addRow;
window.deleteRow           = deleteRow;
window.loadDemoData        = loadDemoData;
window.runSimulation       = runSimulation;
window.handleChartSelection= handleChartSelection;
window.handleLiveToggle    = handleLiveToggle;
window.handleComparisonToggle = handleComparisonToggle;
window.handleGamificationToggle = handleGamificationToggle;
window.handleAlgorithmChange  = handleAlgorithmChange;
window.playTimeline        = playTimeline;
window.pauseTimeline       = pauseTimeline;
window.replayTimeline      = replayTimeline;

initialize();