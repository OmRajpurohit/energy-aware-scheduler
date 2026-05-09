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

function addRow(process = {}) {
  const table = document.querySelector("#processTable tbody");
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="process-id">P${processCount + 1}</td>
    <td><input type="number" min="0" value="${process.arrival ?? 0}" /></td>
    <td><input type="number" min="1" value="${process.burst ?? 1}" /></td>
    <td><input type="number" min="0" value="${process.deadline ?? 0}" /></td>
    <td><button class="icon-btn" type="button" onclick="deleteRow(this)">Remove</button></td>
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
  setStatus("Demo processes loaded. Run the simulator when you are ready.", "info");
}

function getProcesses() {
  return Array.from(document.querySelectorAll("#processTable tbody tr")).map((row, index) => {
    const inputs = row.querySelectorAll("input");

    return {
      id: `P${index + 1}`,
      arrival: Number.parseInt(inputs[0].value, 10),
      burst: Number.parseInt(inputs[1].value, 10),
      deadline: Number.parseInt(inputs[2].value, 10)
    };
  });
}

function validateProcesses(tasks) {
  if (!tasks.length) {
    return "Add at least one process before running the simulation.";
  }

  const invalidTask = tasks.find(task =>
    Number.isNaN(task.arrival) ||
    Number.isNaN(task.burst) ||
    Number.isNaN(task.deadline) ||
    task.arrival < 0 ||
    task.burst < 1 ||
    task.deadline < 0
  );

  if (invalidTask) {
    return "Use valid numeric values: arrival >= 0, burst >= 1, deadline >= 0.";
  }

  return null;
}

async function runSimulation() {
  const tasks = getProcesses();
  const validationError = validateProcesses(tasks);

  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  const runButton = document.getElementById("runButton");
  const data = {
    tasks,
    cores: Number.parseInt(document.getElementById("cores").value, 10),
    algorithm: document.getElementById("algorithm").value,
    mode: document.getElementById("mode").value,
    quantum: Number.parseInt(document.getElementById("quantum").value, 10),
    comparisonMode: isComparisonModeEnabled()
  };

  runButton.disabled = true;
  runButton.textContent = "Running...";
  setStatus("Connecting to the Flask scheduler API and computing the result...", "info");
  setServerBadge("Checking API...");

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
      `${result.request.algorithmLabel} completed for ${result.request.taskCount} processes in ${result.summary.totalTime} time units.`,
      "success"
    );
  } catch (error) {
    clearResults();
    setServerBadge("API offline", false);
    setStatus(error.message, "error");
    console.error(error);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Run Simulation";
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
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  throw new Error(
    "The Flask backend is not reachable on port 5000. Start it with `python app.py`, then rerun the simulation."
  );
}

async function tryReadJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

async function checkApiHealth() {
  const endpoints = getApiEndpoints("/api/health");

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);

      if (response.ok) {
        setServerBadge("API connected", true);
        return;
      }
    } catch (error) {
      // Try the next endpoint.
    }
  }

  setServerBadge("API offline", false);
}

function renderSummary(result) {
  const { summary, metrics, request } = result;
  const gameStats = buildGameStats(result);

  renderMissionControl(result, gameStats);
  renderAchievementRack(gameStats);
  renderPerformancePulse(result, gameStats);

  document.getElementById("summaryCards").innerHTML = `
    <article class="metric-card accent-energy">
      <span class="metric-label">Total Energy</span>
      <strong class="metric-value">${summary.totalEnergy}</strong>
      <span class="metric-note">${formatSigned(summary.energyDelta)} vs ${summary.baselineEnergy} baseline</span>
    </article>
    <article class="metric-card accent-baseline">
      <span class="metric-label">DVFS Savings</span>
      <strong class="metric-value">${summary.energySavingsRate}%</strong>
      <span class="metric-note">Modes use 0.8, 1.2, and 2.0 GHz bands</span>
    </article>
    <article class="metric-card accent-time">
      <span class="metric-label">Average Waiting</span>
      <strong class="metric-value">${metrics.averageWaitingTime}</strong>
      <span class="metric-note">Average turnaround is ${metrics.averageTurnaroundTime}</span>
    </article>
    <article class="metric-card accent-deadline">
      <span class="metric-label">Deadline Success</span>
      <strong class="metric-value">${metrics.deadlineSuccessRate}%</strong>
      <span class="metric-note">${metrics.missedDeadlines} missed deadlines</span>
    </article>
  `;

  document.getElementById("metrics").innerHTML = `
    <div class="details-grid">
      <div><span>Primary Algorithm</span><strong>${summary.algorithmLabel}</strong></div>
      <div><span>DVFS Mode</span><strong>${formatMode(summary.mode)}</strong></div>
      <div><span>Cores</span><strong>${summary.cores}</strong></div>
      <div><span>Round Robin Quantum</span><strong>${request.quantum}</strong></div>
      <div><span>Total Time</span><strong>${summary.totalTime}</strong></div>
      <div><span>Idle Capacity</span><strong>${summary.idleTime}</strong></div>
      <div><span>CPU Utilization</span><strong>${metrics.cpuUtilization}%</strong></div>
      <div><span>Throughput</span><strong>${metrics.throughput}</strong></div>
      <div><span>Average Response</span><strong>${metrics.averageResponseTime}</strong></div>
      <div><span>Average Frequency</span><strong>${summary.averageFrequency} GHz</strong></div>
      <div><span>Comparison Mode</span><strong>${request.comparisonMode ? "Enabled" : "Disabled"}</strong></div>
      <div><span>Frequency Levels</span><strong>${request.frequencyLevels.join(" / ")} GHz</strong></div>
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
        <span>${summary.energySavingsRate}% energy saved</span>
      </div>
    </article>
    <article class="control-card gauge-card">
      ${renderGauge("CPU Load", metrics.cpuUtilization, `${metrics.cpuUtilization}%`, "blue")}
      ${renderGauge("Queue Flow", clampValue(100 - (metrics.averageWaitingTime * 12)), `${metrics.averageWaitingTime} wt`, "purple")}
      ${renderGauge("Turnaround", clampValue(100 - (metrics.averageTurnaroundTime * 8)), `${metrics.averageTurnaroundTime} tt`, "green")}
    </article>
    <article class="control-card mission-log">
      <div class="log-row">
        <span class="mini-kicker">Live Mode</span>
        <strong>${formatMode(summary.mode)}</strong>
      </div>
      <div class="log-row">
        <span class="mini-kicker">Core Mesh</span>
        <strong>${summary.cores} Active Cores</strong>
      </div>
      <div class="log-row">
        <span class="mini-kicker">Playback</span>
        <strong>${result.timeline?.totalTime ?? 0} Time Units</strong>
      </div>
      <div class="log-row">
        <span class="mini-kicker">Tactical Hint</span>
        <strong>${gameStats.focus}</strong>
      </div>
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
    {
      label: "CPU Usage",
      value: clampValue(metrics.cpuUtilization),
      tone: "blue",
      meta: `${metrics.cpuUtilization}% active`
    },
    {
      label: "Waiting Pressure",
      value: clampValue(100 - (metrics.averageWaitingTime * 12)),
      tone: "purple",
      meta: `${metrics.averageWaitingTime} avg wait`
    },
    {
      label: "Turnaround Tempo",
      value: clampValue(100 - (metrics.averageTurnaroundTime * 8)),
      tone: "green",
      meta: `${metrics.averageTurnaroundTime} avg turnaround`
    },
    {
      label: "Energy Efficiency",
      value: clampValue(summary.energySavingsRate),
      tone: "cyan",
      meta: `${summary.energySavingsRate}% saved`
    }
  ];

  document.getElementById("performancePulse").innerHTML = `
    <div class="pulse-header">
      <div>
        <p class="mini-kicker">Performance Pulse</p>
        <h3>Gamified Efficiency Tracks</h3>
      </div>
      <div class="pulse-score">${gameStats.grade}</div>
    </div>
    <div class="pulse-grid">
      ${tracks.map(track => `
        <div class="pulse-track-card">
          <div class="pulse-track-top">
            <span>${track.label}</span>
            <strong>${track.meta}</strong>
          </div>
          <div class="pulse-track">
            <span class="pulse-track-fill ${track.tone}" style="width:${track.value}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderInsights(insights = {}) {
  const deadlineMisses = insights.deadlineMisses || [];
  const bottlenecks = insights.bottlenecks || [];
  const suggestions = insights.suggestions || [];

  if (!deadlineMisses.length && !bottlenecks.length && !suggestions.length) {
    document.getElementById("insightsPanel").innerHTML = `
      <div class="insight-card">
        <h3>Healthy Schedule</h3>
        <p>No deadline misses or major queue bottlenecks were detected for the current run.</p>
      </div>
    `;
    return;
  }

  document.getElementById("insightsPanel").innerHTML = `
    <div class="insight-grid">
      <article class="insight-card">
        <h3>Deadline Misses</h3>
        ${deadlineMisses.length ? `<ul>${deadlineMisses.map(item => `<li>${item.process} missed ${item.deadline} and finished at ${item.completionTime} because ${item.reason}</li>`).join("")}</ul>` : "<p>No deadline misses detected.</p>"}
      </article>
      <article class="insight-card">
        <h3>Bottlenecks</h3>
        ${bottlenecks.length ? `<ul>${bottlenecks.map(item => `<li>${item.message}</li>`).join("")}</ul>` : "<p>No queue hotspots crossed the alert threshold.</p>"}
      </article>
      <article class="insight-card">
        <h3>Suggestions</h3>
        ${suggestions.length ? `<ul>${suggestions.map(item => `<li>${item}</li>`).join("")}</ul>` : "<p>The current configuration is already well aligned with the workload.</p>"}
      </article>
    </div>
  `;
}

function renderGantt(timeline) {
  const container = document.getElementById("gantt");

  resetTimelineAnimation();

  if (!timeline?.lanes?.length || timeline.totalTime <= 0) {
    container.innerHTML = `<p class="empty-state">Run a simulation to generate a schedule timeline.</p>`;
    timelineState = createTimelineState();
    updateTimelineBanner("Animated playback highlights each core independently as the simulation clock advances.", 0, 0);
    syncTimelineControls();
    return;
  }

  const totalTime = timeline.totalTime;

  container.innerHTML = `
    <div class="gantt-board">
      <div class="gantt-axis">
        ${buildTimeTicks(totalTime)}
      </div>
      <div class="gantt-lanes" id="ganttLaneStack">
        <div id="timelineCursor" class="timeline-cursor"></div>
        ${timeline.lanes.map((lane, laneIndex) => `
          <div class="gantt-lane">
            <div class="gantt-lane-label">${lane.label}</div>
            <div class="gantt-track">
              ${lane.segments.map(segment => {
                const left = (segment.start / totalTime) * 100;
                const width = Math.max((segment.duration / totalTime) * 100, 2.4);
                const accent = getProcessColor(segment.process, laneIndex);
                const base = segment.deadlineMet ? "#16a34a" : "#dc2626";
                const tooltip = [
                  `${segment.process} on ${segment.coreLabel}`,
                  `Start: ${segment.start}`,
                  `End: ${segment.end}`,
                  `Energy: ${segment.energy}`,
                  `Frequency: ${segment.frequency} GHz`
                ].join("\n");

                return `
                  <article
                    class="gantt-segment pending ${segment.deadlineMet ? "deadline-met" : "deadline-missed"}"
                    data-start="${segment.start}"
                    data-end="${segment.end}"
                    data-process="${segment.process}"
                    data-core="${segment.coreLabel}"
                    style="left:${left}%; width:${width}%; --segment-progress:0%; background:linear-gradient(135deg, ${base}, ${accent});"
                    title="${tooltip}"
                  >
                    <div class="gantt-fill"></div>
                    <div class="gantt-content">
                      <span class="gantt-title">${segment.process}</span>
                      <span class="gantt-time">${segment.start} - ${segment.end}</span>
                      <span class="gantt-meta">${segment.frequency} GHz | ${segment.energy} energy</span>
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
  const steps = Math.max(4, Math.min(8, Math.ceil(totalTime)));
  const values = Array.from({ length: steps + 1 }, (_, index) => roundNumber((totalTime / steps) * index));

  return values.map(value => `
    <span class="gantt-tick" style="left:${totalTime > 0 ? (value / totalTime) * 100 : 0}%">
      <em>${value}</em>
    </span>
  `).join("");
}

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
          <th>Process</th>
          <th>Arrival</th>
          <th>Burst</th>
          <th>Deadline</th>
          <th>Waiting</th>
          <th>Turnaround</th>
          <th>Response</th>
          <th>Frequency</th>
          <th>Energy</th>
          <th>Baseline Delta</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${processes.map(process => `
          <tr>
            <td>${process.id}</td>
            <td>${process.arrival}</td>
            <td>${process.burst}</td>
            <td>${process.deadline ?? "-"}</td>
            <td>${process.waitingTime}</td>
            <td>${process.turnaroundTime}</td>
            <td>${process.responseTime}</td>
            <td>${process.frequencyProfile}</td>
            <td>${process.totalEnergy}</td>
            <td>${formatSigned(process.energyDelta)}</td>
            <td><span class="deadline-badge ${process.deadlineMet ? "met" : "missed"}">${process.deadlineMet ? "Met" : "Missed"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCharts(result) {
  const liveChartsEnabled = document.getElementById("liveChartsToggle").checked;

  applyChartSelection();

  if (!liveChartsEnabled) {
    updateChartStatus("Live chart updates are paused. Turn the toggle on to refresh the selected chart.", "paused");
    return;
  }

  renderEnergyChart(result);
  renderUtilizationChart(result);

  if (isComparisonModeEnabled()) {
    renderComparisonChart(result);
  }

  updateChartStatus(getChartSelectionMessage(), "active");
}

function clearResults() {
  document.getElementById("missionControl").innerHTML = buildMissionControlIdle();
  document.getElementById("achievementRack").innerHTML = buildAchievementRackIdle();
  document.getElementById("summaryCards").innerHTML = "";
  document.getElementById("performancePulse").innerHTML = buildPerformancePulseIdle();
  document.getElementById("metrics").innerHTML = "";
  document.getElementById("insightsPanel").innerHTML = "";
  document.getElementById("gantt").innerHTML = `<p class="empty-state">Run a simulation to generate a schedule timeline.</p>`;
  document.getElementById("processMetrics").innerHTML = `<p class="empty-state">Per-process metrics will appear after a simulation run.</p>`;
  updateTimelineBanner("Animated playback highlights each core independently as the simulation clock advances.", 0, 0);
  timelineState = createTimelineState();
  resetTimelineAnimation();
  syncTimelineControls();
  updateChartStatus("Run a simulation to populate the selected chart view.", "idle");
}

function getApiEndpoints(path) {
  return window.location.port === "5000"
    ? [path]
    : [`http://127.0.0.1:5000${path}`, `http://localhost:5000${path}`, path];
}

function setStatus(message, tone = "info") {
  const element = document.getElementById("statusMessage");
  element.textContent = message;
  element.className = `status-banner ${tone}`;
}

function setServerBadge(message, isOnline) {
  const badge = document.getElementById("serverStatus");
  badge.textContent = message;
  badge.className = `server-badge ${isOnline === true ? "online" : isOnline === false ? "offline" : "pending"}`;
}

function applyChartSelection() {
  const selectedChart = document.getElementById("chartViewSelect").value;
  const comparisonEnabled = isComparisonModeEnabled();

  document.querySelectorAll(".chart-card").forEach(card => {
    let isVisible = selectedChart === "all" || card.dataset.chart === selectedChart;

    if (card.dataset.chart === "comparison" && !comparisonEnabled) {
      isVisible = false;
    }

    card.classList.toggle("hidden", !isVisible);
  });
}

function getChartSelectionMessage() {
  const selectedChart = document.getElementById("chartViewSelect").value;
  const comparisonEnabled = isComparisonModeEnabled();

  if (selectedChart === "comparison" && !comparisonEnabled) {
    return "Turn Comparison Mode on to populate the side-by-side algorithm charts.";
  }

  switch (selectedChart) {
    case "energy":
      return "Showing the Energy vs Time chart with live updates enabled.";
    case "comparison":
      return "Showing side-by-side algorithm comparison charts with live updates enabled.";
    case "utilization":
      return "Showing the CPU Utilization chart with live updates enabled.";
    default:
      return comparisonEnabled
        ? "Showing all charts with live updates enabled."
        : "Showing core charts. Enable Comparison Mode to benchmark all algorithms side by side.";
  }
}

function updateChartStatus(message, tone = "active") {
  const element = document.getElementById("chartLiveStatus");
  element.textContent = message;
  element.className = `chart-status ${tone}`;
}

function handleChartSelection() {
  applyChartSelection();

  if (!document.getElementById("liveChartsToggle").checked) {
    updateChartStatus("Live chart updates are paused. The selected chart layout is ready when you turn them back on.", "paused");
    return;
  }

  if (latestSimulationResult) {
    renderCharts(latestSimulationResult);
    return;
  }

  updateChartStatus("Select a chart now, then run a simulation to view it live.", "idle");
}

function handleLiveToggle() {
  if (!document.getElementById("liveChartsToggle").checked) {
    updateChartStatus("Live chart updates are paused. Existing results stay visible until the next live refresh.", "paused");
    return;
  }

  if (latestSimulationResult) {
    renderCharts(latestSimulationResult);
    return;
  }

  updateChartStatus(getChartSelectionMessage().replace("Showing", "Ready to show"), "active");
}

function handleComparisonToggle() {
  applyChartSelection();

  if (latestSimulationResult && document.getElementById("liveChartsToggle").checked) {
    renderCharts(latestSimulationResult);
    return;
  }

  updateChartStatus(getChartSelectionMessage(), isComparisonModeEnabled() ? "active" : "idle");
}

function loadTimeline(timeline) {
  timelineState = {
    timeline,
    currentTime: 0,
    isPlaying: false,
    completed: false,
    animationFrame: null,
    playbackDurationMs: getPlaybackDuration(timeline.totalTime)
  };

  updateTimelineVisuals();
  updateTimelineBanner("Playback ready. Press play to animate the schedule clock across all cores.", 0, timeline.totalTime);
  syncTimelineControls();
  playTimeline();
}

function playTimeline() {
  if (!timelineState.timeline) {
    updateTimelineBanner("Run a simulation first to unlock timeline playback controls.", 0, 0);
    return;
  }

  if (timelineState.isPlaying) {
    return;
  }

  if (timelineState.completed) {
    timelineState.currentTime = 0;
    timelineState.completed = false;
  }

  const totalTime = timelineState.timeline.totalTime || 0;

  timelineState.isPlaying = true;
  timelineState.animationStartedAt = performance.now() - ((timelineState.currentTime / Math.max(totalTime, 1)) * timelineState.playbackDurationMs);
  syncTimelineControls();
  timelineState.animationFrame = window.requestAnimationFrame(stepTimeline);
}

function pauseTimeline() {
  if (!timelineState.timeline || !timelineState.isPlaying) {
    return;
  }

  timelineState.isPlaying = false;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner("Timeline paused. Press play to continue from the current simulation clock.", timelineState.currentTime, timelineState.timeline.totalTime);
  syncTimelineControls();
}

function replayTimeline() {
  if (!timelineState.timeline) {
    updateTimelineBanner("Run a simulation first to replay the CPU execution timeline.", 0, 0);
    return;
  }

  resetTimelineAnimation();
  timelineState.currentTime = 0;
  timelineState.completed = false;
  timelineState.isPlaying = false;
  updateTimelineVisuals();
  updateTimelineBanner("Replay ready. Press play to restart from t = 0.", 0, timelineState.timeline.totalTime);
  syncTimelineControls();
  playTimeline();
}

function stepTimeline(timestamp) {
  if (!timelineState.timeline || !timelineState.isPlaying) {
    return;
  }

  const totalTime = timelineState.timeline.totalTime || 0;
  const elapsed = timestamp - timelineState.animationStartedAt;
  const progress = Math.min(elapsed / timelineState.playbackDurationMs, 1);

  timelineState.currentTime = roundNumber(progress * totalTime);
  updateTimelineVisuals();

  if (progress >= 1) {
    finishTimelinePlayback();
    return;
  }

  timelineState.animationFrame = window.requestAnimationFrame(stepTimeline);
}

function finishTimelinePlayback() {
  timelineState.isPlaying = false;
  timelineState.completed = true;
  timelineState.currentTime = timelineState.timeline?.totalTime ?? 0;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner("Execution complete. All visible lanes finished their scheduled work.", timelineState.currentTime, timelineState.timeline?.totalTime ?? 0);
  syncTimelineControls();
}

function updateTimelineVisuals() {
  const totalTime = timelineState.timeline?.totalTime ?? 0;
  const currentTime = timelineState.currentTime;
  const segments = document.querySelectorAll(".gantt-segment");
  const cursor = document.getElementById("timelineCursor");
  const activeSegments = [];

  if (cursor) {
    cursor.style.left = `${totalTime > 0 ? Math.min((currentTime / totalTime) * 100, 100) : 0}%`;
  }

  segments.forEach(segment => {
    const start = Number.parseFloat(segment.dataset.start);
    const end = Number.parseFloat(segment.dataset.end);
    const progress = currentTime <= start
      ? 0
      : currentTime >= end
        ? 1
        : (currentTime - start) / Math.max(end - start, 0.01);

    segment.style.setProperty("--segment-progress", `${progress * 100}%`);
    segment.classList.toggle("pending", progress === 0);
    segment.classList.toggle("active", progress > 0 && progress < 1);
    segment.classList.toggle("completed", progress >= 1);

    if (progress > 0 && progress < 1) {
      activeSegments.push(`${segment.dataset.core}: ${segment.dataset.process}`);
    }
  });

  if (timelineState.completed) {
    updateTimelineBanner("Execution complete. All visible lanes finished their scheduled work.", currentTime, totalTime);
    return;
  }

  if (!timelineState.timeline) {
    updateTimelineBanner("Animated playback highlights each core independently as the simulation clock advances.", 0, 0);
    return;
  }

  if (!activeSegments.length && currentTime === 0) {
    updateTimelineBanner("Playback ready. Press play to animate the schedule clock across all cores.", currentTime, totalTime);
    return;
  }

  if (activeSegments.length) {
    updateTimelineBanner(activeSegments.join(" | "), currentTime, totalTime);
    return;
  }

  updateTimelineBanner("No process is executing at this instant. The simulator is between arrivals or after a completion.", currentTime, totalTime);
}

function updateTimelineBanner(message, currentTime, totalTime) {
  document.getElementById("timelineClock").textContent = `t = ${roundNumber(currentTime)}${totalTime ? ` / ${roundNumber(totalTime)}` : ""}`;
  document.getElementById("timelineLegend").textContent = message;
}

function syncTimelineControls() {
  const hasTimeline = Boolean(timelineState.timeline);

  document.getElementById("timelinePlayButton").disabled = !hasTimeline || timelineState.isPlaying;
  document.getElementById("timelinePauseButton").disabled = !hasTimeline || !timelineState.isPlaying;
  document.getElementById("timelineReplayButton").disabled = !hasTimeline;
}

function resetTimelineAnimation() {
  if (timelineState.animationFrame) {
    window.cancelAnimationFrame(timelineState.animationFrame);
    timelineState.animationFrame = null;
  }
}

function createTimelineState() {
  return {
    timeline: null,
    currentTime: 0,
    isPlaying: false,
    completed: false,
    animationFrame: null,
    playbackDurationMs: MIN_PLAYBACK_MS
  };
}

function getPlaybackDuration(totalTime) {
  if (!totalTime) {
    return MIN_PLAYBACK_MS;
  }

  return Math.min(MAX_PLAYBACK_MS, Math.max(MIN_PLAYBACK_MS, totalTime * 650));
}

function isComparisonModeEnabled() {
  return document.getElementById("comparisonModeToggle").checked;
}

function formatMode(mode) {
  if (mode === "power") {
    return "Power Saver";
  }
  if (mode === "performance") {
    return "Performance";
  }
  return "Balanced";
}

function formatSigned(value) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function getProcessColor(processId, fallbackIndex = 0) {
  const numericPart = Number.parseInt(String(processId).replace(/\D/g, ""), 10);
  const index = Number.isNaN(numericPart) ? fallbackIndex : numericPart - 1;
  return PROCESS_COLORS[((index % PROCESS_COLORS.length) + PROCESS_COLORS.length) % PROCESS_COLORS.length];
}

function roundNumber(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildGameStats(result) {
  const { summary, metrics, processes } = result;
  const efficiencyScore = clampValue(
    (metrics.deadlineSuccessRate * 0.36) +
    (summary.energySavingsRate * 0.26) +
    (clampValue(100 - (metrics.averageWaitingTime * 12)) * 0.18) +
    (clampValue(metrics.cpuUtilization) * 0.2)
  );
  const points = Math.round(
    (efficiencyScore * 18) +
    (summary.cores * 55) +
    (metrics.throughput * 180) -
    (metrics.missedDeadlines * 45)
  );
  const level = Math.max(1, Math.floor(points / 320) + 1);
  const levelProgress = clampValue(((points % 320) / 320) * 100);
  const streak = metrics.missedDeadlines === 0
    ? Math.max(3, Math.round((metrics.deadlineSuccessRate / 10) + (summary.energySavingsRate / 20)))
    : Math.max(1, Math.round(metrics.deadlineSuccessRate / 25));
  const grade = efficiencyScore >= 92 ? "S+" : efficiencyScore >= 84 ? "A" : efficiencyScore >= 72 ? "B" : efficiencyScore >= 58 ? "C" : "D";
  const badges = [];

  if (metrics.deadlineSuccessRate === 100) {
    badges.push({
      icon: "◎",
      label: "Deadline Guardian",
      description: "Every process hit its deadline target.",
      tone: "green"
    });
  }

  if (summary.energySavingsRate >= 30) {
    badges.push({
      icon: "◈",
      label: "Energy Hunter",
      description: "DVFS achieved a strong savings profile.",
      tone: "blue"
    });
  }

  if (metrics.cpuUtilization >= 75) {
    badges.push({
      icon: "✦",
      label: "Core Commander",
      description: "The cores stayed meaningfully engaged.",
      tone: "purple"
    });
  }

  if (processes.every(process => process.deadlineMet && process.energyDelta <= 0)) {
    badges.push({
      icon: "⬢",
      label: "Perfect Sync",
      description: "Met deadlines while staying below baseline energy.",
      tone: "cyan"
    });
  }

  if (!badges.length) {
    badges.push({
      icon: "◌",
      label: "Warmup Run",
      description: "Tune the workload to unlock performance badges.",
      tone: "neutral"
    });
  }

  const titles = [
    "Queue Cadet",
    "Latency Ranger",
    "Deadline Tactician",
    "Core Strategist",
    "Neon Scheduler",
    "Quantum Architect"
  ];

  return {
    points,
    level,
    levelProgress,
    streak,
    grade,
    badges,
    title: titles[Math.min(level - 1, titles.length - 1)],
    focus: metrics.missedDeadlines > 0
      ? "Reduce misses with faster dispatch."
      : summary.energySavingsRate < 15
        ? "Push harder on DVFS efficiency."
        : "Maintain this execution rhythm."
  };
}

function buildMissionControlIdle() {
  return `
    <article class="control-card score-card idle-card">
      <div class="score-headline">
        <span class="mini-kicker">Command Score</span>
        <strong>0000</strong>
      </div>
      <div class="level-row">
        <div>
          <span class="mini-kicker">Level 1</span>
          <p>Queue Cadet</p>
        </div>
        <div class="streak-pill">
          <span>Streak</span>
          <strong>0x</strong>
        </div>
      </div>
      <div class="xp-track"><span class="xp-fill" style="width:18%"></span></div>
      <div class="score-meta">
        <span>Awaiting run</span>
        <span>Telemetry offline</span>
        <span>Rewards locked</span>
      </div>
    </article>
    <article class="control-card gauge-card">
      ${renderGauge("CPU Load", 18, "--", "blue")}
      ${renderGauge("Queue Flow", 24, "--", "purple")}
      ${renderGauge("Turnaround", 30, "--", "green")}
    </article>
    <article class="control-card mission-log idle-card">
      <div class="log-row"><span class="mini-kicker">Live Mode</span><strong>Balanced</strong></div>
      <div class="log-row"><span class="mini-kicker">Core Mesh</span><strong>Awaiting input</strong></div>
      <div class="log-row"><span class="mini-kicker">Playback</span><strong>Standby</strong></div>
      <div class="log-row"><span class="mini-kicker">Tactical Hint</span><strong>Launch a run to score your scheduler.</strong></div>
    </article>
  `;
}

function buildAchievementRackIdle() {
  return `
    <article class="achievement-badge neutral">
      <span class="badge-icon">◌</span>
      <div>
        <strong>Achievement Bay</strong>
        <p>Run the simulator to unlock scheduler badges.</p>
      </div>
    </article>
  `;
}

function buildPerformancePulseIdle() {
  return `
    <div class="pulse-header">
      <div>
        <p class="mini-kicker">Performance Pulse</p>
        <h3>Gamified Efficiency Tracks</h3>
      </div>
      <div class="pulse-score">--</div>
    </div>
    <div class="pulse-grid">
      ${["CPU Usage", "Waiting Pressure", "Turnaround Tempo", "Energy Efficiency"].map((label, index) => `
        <div class="pulse-track-card">
          <div class="pulse-track-top">
            <span>${label}</span>
            <strong>Awaiting run</strong>
          </div>
          <div class="pulse-track">
            <span class="pulse-track-fill ${["blue", "purple", "green", "cyan"][index]}" style="width:${20 + (index * 8)}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function clampValue(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, roundNumber(value)));
}

function initialize() {
  loadDemoData();
  clearResults();
  setServerBadge("Waiting for API");
  applyChartSelection();
  checkApiHealth();
}

window.addRow = addRow;
window.deleteRow = deleteRow;
window.loadDemoData = loadDemoData;
window.runSimulation = runSimulation;
window.handleChartSelection = handleChartSelection;
window.handleLiveToggle = handleLiveToggle;
window.handleComparisonToggle = handleComparisonToggle;
window.playTimeline = playTimeline;
window.pauseTimeline = pauseTimeline;
window.replayTimeline = replayTimeline;

initialize();
