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
          borderColor: "#7c3aed",
          backgroundColor: "rgba(124, 58, 237, 0.18)",
          pointBackgroundColor: "#6d28d9",
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
          display: true
        },
        tooltip: {
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
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          title: {
            display: true,
            text: "Utilization %"
          }
        }
      }
    }
  });
}
