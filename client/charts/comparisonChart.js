const chartInstances = new Map();

const METRIC_CONFIG = [
  {
    canvasId: "comparisonWaitingChart",
    metricKey: "waitingTime",
    label: "Avg Waiting Time",
    color: "#49a6ff"
  },
  {
    canvasId: "comparisonTurnaroundChart",
    metricKey: "turnaroundTime",
    label: "Avg Turnaround Time",
    color: "#a66cff"
  },
  {
    canvasId: "comparisonEnergyChart",
    metricKey: "totalEnergy",
    label: "Total Energy",
    color: "#19d2ff"
  },
  {
    canvasId: "comparisonDeadlineChart",
    metricKey: "deadlineSuccessRate",
    label: "Deadline Success Rate",
    color: "#3be889",
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
            backgroundColor: points.map(() => `${config.color}cc`),
            borderColor: points.map(() => config.color),
            borderWidth: 1,
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
            backgroundColor: "rgba(7, 12, 24, 0.96)",
            titleColor: "#f5fbff",
            bodyColor: "#c9dbff",
            borderColor: "rgba(73, 166, 255, 0.28)",
            borderWidth: 1,
            callbacks: {
              label(context) {
                return `${config.label}: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#91a8d3"
            },
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: config.max,
            ticks: {
              color: "#91a8d3"
            },
            grid: {
              color: "rgba(145, 168, 211, 0.1)"
            },
            title: {
              display: true,
              text: config.label,
              color: "#b9ccf1"
            }
          }
        }
      }
    }));
  });
}
