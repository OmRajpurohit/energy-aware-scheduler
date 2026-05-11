import {
  buildSharedOptions,
  buildVerticalGradient,
  createChartFramePlugin
} from "./theme.js";

let energyChartInstance = null;

export function renderEnergyChart(data) {
  const canvas = document.getElementById("energyChart");

  if (!canvas || !window.Chart) {
    return;
  }

  if (energyChartInstance) {
    energyChartInstance.destroy();
  }

  const timeline = data.charts?.energyTimeline || [];

  const framePlugin = createChartFramePlugin();

  energyChartInstance = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: timeline.map(point => `t=${point.time}`),
      datasets: [
        {
          type: "bar",
          label: "Per Slice Energy",
          data: timeline.map(point => point.segmentEnergy ?? 0),
          backgroundColor(context) {
            const { chart } = context;
            const area = chart.chartArea;
            if (!area) {
              return "rgba(24, 215, 255, 0.3)";
            }

            return buildVerticalGradient(chart.ctx, area, "rgba(24, 215, 255, 0.84)", "rgba(73, 166, 255, 0.28)");
          },
          borderRadius: 14,
          borderSkipped: false,
          order: 2
        },
        {
          type: "line",
          label: "Cumulative Energy",
          data: timeline.map(point => point.value),
          borderColor: "#7fd8ff",
          backgroundColor(context) {
            const { chart } = context;
            const area = chart.chartArea;
            if (!area) {
              return "rgba(73, 166, 255, 0.18)";
            }

            return buildVerticalGradient(chart.ctx, area, "rgba(73, 166, 255, 0.28)", "rgba(73, 166, 255, 0.02)");
          },
          pointBackgroundColor: "#c1f3ff",
          pointBorderColor: "#09111f",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.36,
          borderWidth: 3,
          order: 1
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
              return `Cumulative Energy: ${context.parsed.y}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Energy Units"
          }
        },
        x: {
          title: {
            display: true,
            text: "Execution Segment"
          }
        }
      }
    }),
    plugins: [framePlugin]
  });
}