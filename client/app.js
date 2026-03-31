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

const BAR_COLORS = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
const TIMELINE_STEP_MS = 700;

let processCount = 0;
let latestSimulationResult = null;
let activeTimelineTimer = null;
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
  const rows = document.querySelectorAll("#processTable tbody tr");

  return Array.from(rows).map((row, index) => {
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
  if (tasks.length === 0) {
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

  const button = document.getElementById("runButton");
  const data = {
    tasks,
    cores: Number.parseInt(document.getElementById("cores").value, 10),
    algorithm: document.getElementById("algorithm").value,
    mode: document.getElementById("mode").value
  };

  button.disabled = true;
  button.textContent = "Running...";
  setStatus("Connecting to the scheduler API and computing the result...", "info");
  setServerBadge("Checking API...");

  try {
    const result = await requestSchedule(data);

    latestSimulationResult = result;
    renderSummary(result);
    renderGantt(result.gantt);
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
    button.disabled = false;
    button.textContent = "Run Simulation";
  }
}

async function requestSchedule(data) {
  const endpoints = getApiEndpoints("/api/schedule");

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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
    "The backend server is not reachable on port 5000. Start it with `cd server && npm start`, then rerun the simulation."
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

function renderCharts(result) {
  const liveChartsEnabled = document.getElementById("liveChartsToggle").checked;

  applyChartSelection();

  if (!liveChartsEnabled) {
    updateChartStatus("Live chart updates are paused. Turn the toggle on to refresh the selected chart.", "paused");
    return;
  }

  renderEnergyChart(result);
  renderComparisonChart(result);
  renderUtilizationChart(result);
  updateChartStatus(getChartSelectionMessage(), "active");
}

function renderSummary(result) {
  const summary = result.summary;
  const metrics = result.metrics;

  document.getElementById("summaryCards").innerHTML = `
    <article class="metric-card accent-energy">
      <span class="metric-label">Total Energy</span>
      <strong class="metric-value">${summary.totalEnergy}</strong>
      <span class="metric-note">Computed from frequency and run time</span>
    </article>
    <article class="metric-card accent-time">
      <span class="metric-label">Average Waiting</span>
      <strong class="metric-value">${metrics.averageWaitingTime}</strong>
      <span class="metric-note">Average queue delay per process</span>
    </article>
    <article class="metric-card accent-utilization">
      <span class="metric-label">CPU Utilization</span>
      <strong class="metric-value">${metrics.cpuUtilization}%</strong>
      <span class="metric-note">${metrics.throughput} processes per time unit</span>
    </article>
    <article class="metric-card accent-deadline">
      <span class="metric-label">Deadline Success</span>
      <strong class="metric-value">${metrics.deadlineSuccessRate}%</strong>
      <span class="metric-note">${metrics.missedDeadlines} missed deadlines</span>
    </article>
  `;

  document.getElementById("metrics").innerHTML = `
    <div class="details-grid">
      <div><span>Algorithm</span><strong>${summary.algorithmLabel}</strong></div>
      <div><span>Mode</span><strong>${capitalize(summary.mode)}</strong></div>
      <div><span>Cores</span><strong>${summary.cores}</strong></div>
      <div><span>Total Time</span><strong>${summary.totalTime}</strong></div>
      <div><span>Idle Time</span><strong>${summary.idleTime}</strong></div>
      <div><span>Average Turnaround</span><strong>${metrics.averageTurnaroundTime}</strong></div>
      <div><span>Average Response</span><strong>${metrics.averageResponseTime}</strong></div>
      <div><span>Average Frequency</span><strong>${summary.averageFrequency} GHz</strong></div>
    </div>
  `;
}

function renderGantt(gantt) {
  const container = document.getElementById("gantt");
  const clock = document.getElementById("timelineClock");
  const legend = document.getElementById("timelineLegend");

  resetTimelineAnimation();

  if (!gantt.length) {
    container.innerHTML = `<p class="empty-state">No execution timeline available yet.</p>`;
    clock.textContent = "Time 0";
    legend.textContent = "Animated playback highlights one execution slice at a time.";
    timelineState = createTimelineState();
    syncTimelineControls();
    return;
  }

  const totalTime = gantt[gantt.length - 1].end || 1;

  container.innerHTML = gantt.map((segment, index) => {
    const width = Math.max((segment.duration / totalTime) * 100, 8);
    const color = BAR_COLORS[index % BAR_COLORS.length];

    return `
      <article class="gantt-bar pending" data-index="${index}" style="width:${width}%; background:${color}">
        <span class="gantt-title">${segment.process}</span>
        <span class="gantt-time">${segment.start} to ${segment.end}</span>
        <span class="gantt-meta">${segment.energy} energy | ${segment.utilization}% load</span>
        <span class="gantt-progress"></span>
      </article>
    `;
  }).join("");

  loadTimeline(gantt);
}

function renderProcessMetrics(processes) {
  const container = document.getElementById("processMetrics");

  if (!processes.length) {
    container.innerHTML = `<p class="empty-state">Per-process metrics will appear after a simulation run.</p>`;
    return;
  }

  const rows = processes.map(process => `
    <tr>
      <td>${process.id}</td>
      <td>${process.arrival}</td>
      <td>${process.burst}</td>
      <td>${process.deadline ?? "-"}</td>
      <td>${process.waitingTime}</td>
      <td>${process.turnaroundTime}</td>
      <td>${process.responseTime}</td>
      <td>${process.deadlineMet ? "Met" : "Missed"}</td>
    </tr>
  `).join("");

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
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function clearResults() {
  document.getElementById("summaryCards").innerHTML = "";
  document.getElementById("metrics").innerHTML = "";
  document.getElementById("gantt").innerHTML = `<p class="empty-state">Run a simulation to generate a schedule timeline.</p>`;
  document.getElementById("processMetrics").innerHTML = `<p class="empty-state">Per-process metrics will appear after a simulation run.</p>`;
  document.getElementById("timelineClock").textContent = "Time 0";
  document.getElementById("timelineLegend").textContent = "Animated playback highlights one execution slice at a time.";
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
  const cards = document.querySelectorAll(".chart-card");

  cards.forEach(card => {
    const isVisible = selectedChart === "all" || card.dataset.chart === selectedChart;
    card.classList.toggle("hidden", !isVisible);
  });
}

function getChartSelectionMessage() {
  const selectedChart = document.getElementById("chartViewSelect").value;

  switch (selectedChart) {
    case "energy":
      return "Showing the Energy vs Time chart with live updates enabled.";
    case "comparison":
      return "Showing the Algorithm Comparison chart with live updates enabled.";
    case "utilization":
      return "Showing the CPU Utilization chart with live updates enabled.";
    default:
      return "Showing all charts with live updates enabled.";
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
  const liveChartsEnabled = document.getElementById("liveChartsToggle").checked;

  if (!liveChartsEnabled) {
    updateChartStatus("Live chart updates are paused. Existing results stay visible until the next live refresh.", "paused");
    return;
  }

  if (latestSimulationResult) {
    renderCharts(latestSimulationResult);
    return;
  }

  updateChartStatus(getChartSelectionMessage().replace("Showing", "Ready to show"), "active");
}

function getTimelineBars() {
  return Array.from(document.querySelectorAll(".gantt-bar"));
}

function loadTimeline(gantt) {
  timelineState = {
    gantt,
    currentIndex: 0,
    paused: false,
    completed: false
  };

  updateTimelineBanner("Playback started. Processes will appear in execution order.", gantt[0].start);
  syncTimelineControls();
  scheduleNextTimelineStep();
}

function runTimelineStep() {
  const { gantt, currentIndex } = timelineState;
  const bars = getTimelineBars();

  bars.forEach((bar, index) => {
    bar.classList.toggle("completed", index < currentIndex);
    bar.classList.toggle("active", index === currentIndex);
    bar.classList.toggle("pending", index > currentIndex);
  });

  if (currentIndex >= gantt.length) {
    finishTimelinePlayback();
    return;
  }

  const segment = gantt[currentIndex];
  updateTimelineBanner(
    `${segment.process} is executing from ${segment.start} to ${segment.end} with ${segment.utilization}% CPU load.`,
    segment.end
  );

  timelineState.currentIndex += 1;
  syncTimelineControls();
  scheduleNextTimelineStep();
}

function scheduleNextTimelineStep() {
  resetTimelineAnimation();

  if (timelineState.paused || timelineState.completed || timelineState.gantt.length === 0) {
    syncTimelineControls();
    return;
  }

  if (timelineState.currentIndex >= timelineState.gantt.length) {
    finishTimelinePlayback();
    return;
  }

  activeTimelineTimer = window.setTimeout(runTimelineStep, TIMELINE_STEP_MS);
}

function finishTimelinePlayback() {
  const finishedSegment = timelineState.gantt[timelineState.gantt.length - 1];
  timelineState.completed = true;
  timelineState.paused = false;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner(
    `Execution complete. ${timelineState.gantt.length} slices finished across the visible timeline.`,
    finishedSegment.end
  );
  syncTimelineControls();
}

function updateTimelineVisuals() {
  const clock = document.getElementById("timelineClock");
  const legend = document.getElementById("timelineLegend");

  if (timelineState.gantt.length === 0) {
    clock.textContent = "Time 0";
    legend.textContent = "Animated playback highlights one execution slice at a time.";
    return;
  }

  const bars = getTimelineBars();
  const currentIndex = timelineState.currentIndex;

  bars.forEach((bar, index) => {
    bar.classList.toggle("completed", index < currentIndex || timelineState.completed);
    bar.classList.toggle("active", !timelineState.completed && index === currentIndex);
    bar.classList.toggle("pending", !timelineState.completed && index > currentIndex);
  });
}

function updateTimelineBanner(message, time) {
  document.getElementById("timelineClock").textContent = `Time ${time}`;
  document.getElementById("timelineLegend").textContent = message;
}

function playTimeline() {
  if (timelineState.gantt.length === 0) {
    updateTimelineBanner("Run a simulation first to unlock timeline playback controls.", 0);
    return;
  }

  if (timelineState.completed) {
    replayTimeline();
    return;
  }

  timelineState.paused = false;
  syncTimelineControls();
  scheduleNextTimelineStep();
}

function pauseTimeline() {
  if (timelineState.gantt.length === 0 || timelineState.completed) {
    return;
  }

  timelineState.paused = true;
  resetTimelineAnimation();
  updateTimelineVisuals();
  updateTimelineBanner("Timeline paused. Press play to continue from the current execution slice.", getCurrentTimelineTime());
  syncTimelineControls();
}

function replayTimeline() {
  if (timelineState.gantt.length === 0) {
    updateTimelineBanner("Run a simulation first to replay the CPU execution timeline.", 0);
    return;
  }

  resetTimelineAnimation();
  timelineState.currentIndex = 0;
  timelineState.paused = false;
  timelineState.completed = false;
  updateTimelineVisuals();
  updateTimelineBanner("Replay started. Processes will appear again from the beginning.", timelineState.gantt[0].start);
  syncTimelineControls();
  scheduleNextTimelineStep();
}

function getCurrentTimelineTime() {
  if (timelineState.currentIndex === 0) {
    return timelineState.gantt[0]?.start ?? 0;
  }

  return timelineState.gantt[Math.min(timelineState.currentIndex - 1, timelineState.gantt.length - 1)]?.end ?? 0;
}

function syncTimelineControls() {
  const hasTimeline = timelineState.gantt.length > 0;
  const playButton = document.getElementById("timelinePlayButton");
  const pauseButton = document.getElementById("timelinePauseButton");
  const replayButton = document.getElementById("timelineReplayButton");

  playButton.disabled = !hasTimeline || (!timelineState.paused && !timelineState.completed);
  pauseButton.disabled = !hasTimeline || timelineState.paused || timelineState.completed;
  replayButton.disabled = !hasTimeline;
}

function resetTimelineAnimation() {
  if (activeTimelineTimer) {
    window.clearTimeout(activeTimelineTimer);
    activeTimelineTimer = null;
  }
}

function createTimelineState() {
  return {
    gantt: [],
    currentIndex: 0,
    paused: false,
    completed: false
  };
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
window.runSimulation = runSimulation;
window.loadDemoData = loadDemoData;
window.handleChartSelection = handleChartSelection;
window.handleLiveToggle = handleLiveToggle;
window.playTimeline = playTimeline;
window.pauseTimeline = pauseTimeline;
window.replayTimeline = replayTimeline;

initialize();
