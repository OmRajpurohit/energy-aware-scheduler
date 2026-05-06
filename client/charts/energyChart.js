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
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          pointBackgroundColor: "#1d4ed8",
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
    }
  });
}
