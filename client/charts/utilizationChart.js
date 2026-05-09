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

  utilizationChartInstance = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: timeline.map(point => `t=${point.time}`),
      datasets: [
        {
          label: "CPU Utilization %",
          data: timeline.map(point => point.value),
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.18)",
          pointBackgroundColor: "#c2a7ff",
          pointBorderColor: "#09111f",
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.32
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
          borderColor: "rgba(139, 92, 246, 0.28)",
          borderWidth: 1,
          callbacks: {
            title(items) {
              return timeline[items[0].dataIndex]?.label || "";
            },
            label(context) {
              return `Utilization: ${context.parsed.y}%`;
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
            color: "rgba(145, 168, 211, 0.08)"
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            color: "#91a8d3"
          },
          grid: {
            color: "rgba(145, 168, 211, 0.1)"
          },
          title: {
            display: true,
            text: "Utilization %",
            color: "#b9ccf1"
          }
        }
      }
    }
  });
}
