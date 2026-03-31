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

let processCount = 0;

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

    renderSummary(result);
    renderGantt(result.gantt);
    renderProcessMetrics(result.processes);
    renderEnergyChart(result);
    renderComparisonChart(result);
    renderUtilizationChart(result);

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

  if (!gantt.length) {
    container.innerHTML = `<p class="empty-state">No execution timeline available yet.</p>`;
    return;
  }

  const totalTime = gantt[gantt.length - 1].end || 1;

  container.innerHTML = gantt.map((segment, index) => {
    const width = Math.max((segment.duration / totalTime) * 100, 8);
    const color = BAR_COLORS[index % BAR_COLORS.length];

    return `
      <article class="gantt-bar" style="width:${width}%; background:${color}">
        <span class="gantt-title">${segment.process}</span>
        <span class="gantt-time">${segment.start} to ${segment.end}</span>
        <span class="gantt-meta">${segment.energy} energy | ${segment.utilization}% load</span>
      </article>
    `;
  }).join("");
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

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function initialize() {
  loadDemoData();
  clearResults();
  setServerBadge("Waiting for API");
  checkApiHealth();
}

window.addRow = addRow;
window.deleteRow = deleteRow;
window.runSimulation = runSimulation;
window.loadDemoData = loadDemoData;

initialize();
