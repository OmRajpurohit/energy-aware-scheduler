const { calculateEnergy, getFrequency } = require("./myUtils");

const ALGORITHMS = ["FCFS", "RR", "EATS"];
const ALGORITHM_LABELS = {
  FCFS: "First Come First Serve",
  RR: "Round Robin",
  EATS: "Energy-Aware Task Scheduling"
};

function schedule(tasks, algorithm = "EATS", cores = 1, mode = "power") {
  const normalizedTasks = normalizeTasks(tasks);
  const safeAlgorithm = ALGORITHMS.includes(algorithm) ? algorithm : "FCFS";
  const safeCores = Math.max(1, Number(cores) || 1);
  const safeMode = mode === "performance" ? "performance" : "power";

  const primaryResult = runAlgorithm(normalizedTasks, safeAlgorithm, safeCores, safeMode);
  const comparisons = ALGORITHMS.map(name => {
    const result = runAlgorithm(normalizedTasks, name, safeCores, safeMode);

    return {
      algorithm: name,
      label: ALGORITHM_LABELS[name],
      totalEnergy: roundNumber(result.summary.totalEnergy),
      averageWaitingTime: roundNumber(result.metrics.averageWaitingTime),
      averageTurnaroundTime: roundNumber(result.metrics.averageTurnaroundTime),
      averageResponseTime: roundNumber(result.metrics.averageResponseTime),
      cpuUtilization: roundNumber(result.metrics.cpuUtilization),
      throughput: roundNumber(result.metrics.throughput),
      deadlineSuccessRate: roundNumber(result.metrics.deadlineSuccessRate)
    };
  });

  return {
    request: {
      algorithm: safeAlgorithm,
      algorithmLabel: ALGORITHM_LABELS[safeAlgorithm],
      cores: safeCores,
      mode: safeMode,
      taskCount: normalizedTasks.length
    },
    summary: primaryResult.summary,
    metrics: primaryResult.metrics,
    gantt: primaryResult.gantt,
    processes: primaryResult.processes,
    comparisons,
    charts: buildCharts(primaryResult, comparisons)
  };
}

function normalizeTasks(tasks = []) {
  return tasks.map((task, index) => ({
    id: task.id || `P${index + 1}`,
    arrival: Math.max(0, Number(task.arrival) || 0),
    burst: Math.max(1, Number(task.burst) || 1),
    deadline: Number(task.deadline) > 0 ? Number(task.deadline) : null,
    order: index
  }));
}

function runAlgorithm(tasks, algorithm, cores, mode) {
  const clonedTasks = tasks.map(task => ({
    ...task,
    remaining: task.burst,
    completionTime: null,
    firstStartTime: null
  }));

  let gantt;

  switch (algorithm) {
    case "RR":
      gantt = simulateRoundRobin(clonedTasks, cores, mode);
      break;
    case "EATS":
      gantt = simulatePriority(clonedTasks, cores, mode, compareEats);
      break;
    case "FCFS":
    default:
      gantt = simulatePriority(clonedTasks, cores, mode, compareFcfs);
      break;
  }

  const processMetrics = buildProcessMetrics(clonedTasks);
  const summary = buildSummary(gantt, processMetrics, algorithm, mode, cores);
  const metrics = buildMetrics(summary, processMetrics);

  return {
    gantt,
    processes: processMetrics,
    summary,
    metrics
  };
}

function simulatePriority(tasks, cores, mode, comparator) {
  const gantt = [];
  const pending = [...tasks].sort((left, right) => left.arrival - right.arrival || left.order - right.order);
  const ready = [];
  let time = pending.length > 0 ? pending[0].arrival : 0;

  while (pending.length > 0 || ready.length > 0) {
    while (pending.length > 0 && pending[0].arrival <= time) {
      ready.push(pending.shift());
    }

    if (ready.length === 0) {
      time = pending[0].arrival;
      continue;
    }

    ready.sort(comparator);

    const task = ready.shift();
    const utilization = getUtilization(ready.length + 1, cores);
    const frequency = getFrequency(utilization, mode);
    const start = time;
    const end = time + task.remaining;
    const energy = calculateEnergy(frequency, task.remaining);

    if (task.firstStartTime === null) {
      task.firstStartTime = start;
    }

    task.remaining = 0;
    task.completionTime = end;

    gantt.push(buildSegment(task.id, start, end, frequency, utilization, energy));
    time = end;
  }

  return gantt;
}

function simulateRoundRobin(tasks, cores, mode) {
  const gantt = [];
  const pending = [...tasks].sort((left, right) => left.arrival - right.arrival || left.order - right.order);
  const queue = [];
  const quantum = 2;
  let time = pending.length > 0 ? pending[0].arrival : 0;

  while (pending.length > 0 || queue.length > 0) {
    while (pending.length > 0 && pending[0].arrival <= time) {
      queue.push(pending.shift());
    }

    if (queue.length === 0) {
      time = pending[0].arrival;
      continue;
    }

    const task = queue.shift();
    const executionTime = Math.min(quantum, task.remaining);
    const utilization = getUtilization(queue.length + 1, cores);
    const frequency = getFrequency(utilization, mode);
    const start = time;
    const end = time + executionTime;
    const energy = calculateEnergy(frequency, executionTime);

    if (task.firstStartTime === null) {
      task.firstStartTime = start;
    }

    task.remaining -= executionTime;
    gantt.push(buildSegment(task.id, start, end, frequency, utilization, energy));
    time = end;

    while (pending.length > 0 && pending[0].arrival <= time) {
      queue.push(pending.shift());
    }

    if (task.remaining > 0) {
      queue.push(task);
    } else {
      task.completionTime = time;
    }
  }

  return gantt;
}

function compareFcfs(left, right) {
  return left.arrival - right.arrival || left.order - right.order;
}

function compareEats(left, right) {
  const leftDeadline = left.deadline ?? Number.MAX_SAFE_INTEGER;
  const rightDeadline = right.deadline ?? Number.MAX_SAFE_INTEGER;

  return leftDeadline - rightDeadline ||
    left.burst - right.burst ||
    left.arrival - right.arrival ||
    left.order - right.order;
}

function buildSegment(process, start, end, frequency, utilization, energy) {
  return {
    process,
    start,
    end,
    duration: roundNumber(end - start),
    frequency,
    utilization: roundNumber(utilization * 100),
    energy: roundNumber(energy)
  };
}

function buildProcessMetrics(tasks) {
  return tasks.map(task => {
    const completionTime = task.completionTime ?? task.arrival;
    const turnaroundTime = completionTime - task.arrival;
    const waitingTime = Math.max(0, turnaroundTime - task.burst);
    const responseTime = Math.max(0, (task.firstStartTime ?? task.arrival) - task.arrival);
    const deadlineMet = task.deadline === null ? true : completionTime <= task.deadline;

    return {
      id: task.id,
      arrival: task.arrival,
      burst: task.burst,
      deadline: task.deadline,
      firstStartTime: task.firstStartTime ?? task.arrival,
      completionTime,
      waitingTime: roundNumber(waitingTime),
      turnaroundTime: roundNumber(turnaroundTime),
      responseTime: roundNumber(responseTime),
      deadlineMet
    };
  });
}

function buildSummary(gantt, processes, algorithm, mode, cores) {
  const totalTime = gantt.length > 0 ? gantt[gantt.length - 1].end : 0;
  const busyTime = gantt.reduce((sum, segment) => sum + segment.duration, 0);
  const idleTime = Math.max(0, totalTime - busyTime);
  const totalEnergy = gantt.reduce((sum, segment) => sum + segment.energy, 0);
  const averageFrequency = gantt.length > 0
    ? gantt.reduce((sum, segment) => sum + segment.frequency, 0) / gantt.length
    : 0;
  const completedProcesses = processes.length;
  const missedDeadlines = processes.filter(process => !process.deadlineMet).length;
  const deadlineSuccessRate = completedProcesses > 0
    ? ((completedProcesses - missedDeadlines) / completedProcesses) * 100
    : 100;

  return {
    algorithm,
    algorithmLabel: ALGORITHM_LABELS[algorithm],
    mode,
    cores,
    totalTime: roundNumber(totalTime),
    busyTime: roundNumber(busyTime),
    idleTime: roundNumber(idleTime),
    totalEnergy: roundNumber(totalEnergy),
    averageFrequency: roundNumber(averageFrequency),
    completedProcesses,
    missedDeadlines,
    deadlineSuccessRate: roundNumber(deadlineSuccessRate)
  };
}

function buildMetrics(summary, processes) {
  const count = processes.length || 1;
  const averageWaitingTime = processes.reduce((sum, process) => sum + process.waitingTime, 0) / count;
  const averageTurnaroundTime = processes.reduce((sum, process) => sum + process.turnaroundTime, 0) / count;
  const averageResponseTime = processes.reduce((sum, process) => sum + process.responseTime, 0) / count;
  const cpuUtilization = summary.totalTime > 0 ? (summary.busyTime / summary.totalTime) * 100 : 0;
  const throughput = summary.totalTime > 0 ? summary.completedProcesses / summary.totalTime : 0;

  return {
    averageWaitingTime: roundNumber(averageWaitingTime),
    averageTurnaroundTime: roundNumber(averageTurnaroundTime),
    averageResponseTime: roundNumber(averageResponseTime),
    cpuUtilization: roundNumber(cpuUtilization),
    throughput: roundNumber(throughput),
    totalEnergy: summary.totalEnergy,
    totalTime: summary.totalTime,
    idleTime: summary.idleTime,
    missedDeadlines: summary.missedDeadlines,
    deadlineSuccessRate: summary.deadlineSuccessRate
  };
}

function buildCharts(result, comparisons) {
  const energyTimeline = [];
  let cumulativeEnergy = 0;

  result.gantt.forEach(segment => {
    cumulativeEnergy += segment.energy;

    energyTimeline.push({
      label: `${segment.process} (${segment.start}-${segment.end})`,
      time: segment.end,
      value: roundNumber(cumulativeEnergy),
      segmentEnergy: segment.energy
    });
  });

  const utilizationTimeline = result.gantt.map((segment, index) => ({
    label: `${segment.process} #${index + 1}`,
    time: segment.end,
    value: segment.utilization
  }));

  const algorithmComparison = comparisons.map(item => ({
    algorithm: item.algorithm,
    label: item.label,
    energy: item.totalEnergy,
    waitingTime: item.averageWaitingTime,
    turnaroundTime: item.averageTurnaroundTime,
    cpuUtilization: item.cpuUtilization
  }));

  return {
    energyTimeline,
    utilizationTimeline,
    algorithmComparison
  };
}

function getUtilization(activeTasks, cores) {
  const safeCores = Math.max(1, Number(cores) || 1);
  return Math.min(Math.max(activeTasks / safeCores, 0.35), 1);
}

function roundNumber(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { schedule };
