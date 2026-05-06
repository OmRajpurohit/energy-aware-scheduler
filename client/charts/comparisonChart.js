const chartInstances = new Map();

const METRIC_CONFIG = [
  {
    canvasId: "comparisonWaitingChart",
    metricKey: "waitingTime",
    label: "Avg Waiting Time",
    color: "#2563eb"
  },
  {
    canvasId: "comparisonTurnaroundChart",
    metricKey: "turnaroundTime",
    label: "Avg Turnaround Time",
    color: "#f59e0b"
  },
  {
    canvasId: "comparisonEnergyChart",
    metricKey: "totalEnergy",
    label: "Total Energy",
    color: "#0f766e"
  },
  {
    canvasId: "comparisonDeadlineChart",
    metricKey: "deadlineSuccessRate",
    label: "Deadline Success Rate",
    color: "#dc2626",
    max: 100
  }
];

export function renderComparisonChart(data) {
  if (!window.Chart) {
    return;
  }

  const metrics = data.charts?.comparisonMetrics || {};

  METRIC_CONFIG.forEach(config => {
    const canvas = document.getElementById(config.canvasId);

    if (!canvas) {
      return;
    }

    const points = metrics[config.metricKey] || [];
    const existingChart = chartInstances.get(config.canvasId);

    if (existingChart) {
      existingChart.destroy();
    }

    chartInstances.set(config.canvasId, new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: points.map(point => point.algorithm),
        datasets: [
          {
            label: config.label,
            data: points.map(point => point.value),
            backgroundColor: points.map(() => config.color),
            borderRadius: 10,
            barThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 550,
          easing: "easeOutQuart"
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${config.label}: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: config.max,
            title: {
              display: true,
              text: config.label
            }
          }
        }
      }
    }));
  });
}
