import {
  buildHorizontalGradient,
  buildSharedOptions,
  createBarValuePlugin,
  createChartFramePlugin
} from "./theme.js";

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
    const framePlugin = createChartFramePlugin();
    const labelPlugin = createBarValuePlugin();

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
            backgroundColor(context) {
              const { chart } = context;
              const area = chart.chartArea;
              if (!area) {
                return `${config.color}cc`;
              }

              return buildHorizontalGradient(chart.ctx, area, `${config.color}ff`, `${config.color}40`);
            },
            borderColor: points.map(() => config.color),
            borderWidth: 1,
            borderRadius: 14,
            borderSkipped: false,
            barThickness: 24,
            categoryPercentage: 0.7,
            barPercentage: 0.82
          }
        ]
      },
      options: buildSharedOptions({
        indexAxis: "y",
        layout: {
          padding: {
            top: 8,
            right: 48,
            bottom: 8,
            left: 10
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${config.label}: ${context.parsed.x}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: config.max,
            ticks: {
              color: "#91a8d3",
              precision: 0
            },
            grid: {
              color: "rgba(145, 168, 211, 0.08)"
            }
          },
          y: {
            ticks: {
              color: "#dbe7ff"
            },
            title: {
              display: true,
              text: config.label
            }
          }
        }
      }),
      plugins: [framePlugin, labelPlugin]
    }));
  });
}