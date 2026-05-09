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

  energyChartInstance = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: timeline.map(point => `t=${point.time}`),
      datasets: [
        {
          label: "Cumulative Energy",
          data: timeline.map(point => point.value),
          borderColor: "#49a6ff",
          backgroundColor: "rgba(73, 166, 255, 0.18)",
          pointBackgroundColor: "#7fd8ff",
          pointBorderColor: "#09111f",
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 500,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#dce9ff"
          }
        },
        tooltip: {
          backgroundColor: "rgba(7, 12, 24, 0.96)",
          titleColor: "#f5fbff",
          bodyColor: "#c9dbff",
          borderColor: "rgba(73, 166, 255, 0.28)",
          borderWidth: 1,
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
          ticks: {
            color: "#91a8d3"
          },
          grid: {
            color: "rgba(145, 168, 211, 0.1)"
          },
          title: {
            display: true,
            text: "Energy Units",
            color: "#b9ccf1"
          }
        },
        x: {
          ticks: {
            color: "#91a8d3"
          },
          grid: {
            color: "rgba(145, 168, 211, 0.08)"
          },
          title: {
            display: true,
            text: "Execution Segment",
            color: "#b9ccf1"
          }
        }
      }
    }
  });
}
