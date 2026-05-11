import {
  buildSharedOptions,
  buildVerticalGradient,
  createChartFramePlugin
} from "./theme.js";

let utilizationChartInstance = null;

export function renderUtilizationChart(data) {
  const canvas = document.getElementById("utilizationChart");

  if (!canvas || !window.Chart) {
    return;
  }

  if (utilizationChartInstance) {
    utilizationChartInstance.destroy();
  }

  const timeline = data.charts?.utilizationTimeline || [];

  const framePlugin = createChartFramePlugin();

  utilizationChartInstance = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: timeline.map(point => `t=${point.time}`),
      datasets: [
        {
          label: "CPU Utilization %",
          data: timeline.map(point => point.value),
          borderColor: "#8b5cf6",
          backgroundColor(context) {
            const { chart } = context;
            const area = chart.chartArea;
            if (!area) {
              return "rgba(139, 92, 246, 0.18)";
            }

            return buildVerticalGradient(chart.ctx, area, "rgba(139, 92, 246, 0.34)", "rgba(139, 92, 246, 0.03)");
          },
          pointBackgroundColor: "#c2a7ff",
          pointBorderColor: "#09111f",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.32,
          borderWidth: 3
        },
        {
          label: "Target Zone",
          data: timeline.map(() => 78),
          borderColor: "rgba(24, 215, 255, 0.58)",
          borderDash: [6, 6],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0
        }
      ]
    },
    options: buildSharedOptions({
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true
        },
        tooltip: {
          callbacks: {
            title(items) {
              return timeline[items[0].dataIndex]?.label || "";
            },
            label(context) {
              return `${context.dataset.label}: ${context.parsed.y}%`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Execution Segment"
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          title: {
            display: true,
            text: "Utilization %"
          }
        }
      }
    }),
    plugins: [framePlugin]
  });
}