let comparisonChartInstance = null;

export function renderComparisonChart(data) {
  const canvas = document.getElementById("comparisonChart");

  if (!canvas || !window.Chart) {
    return;
  }

  if (comparisonChartInstance) {
    comparisonChartInstance.destroy();
  }

  const comparisonData = data.charts?.algorithmComparison || [];

  comparisonChartInstance = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: comparisonData.map(item => item.algorithm),
      datasets: [
        {
          label: "Total Energy",
          data: comparisonData.map(item => item.energy),
          backgroundColor: "#0f766e",
          borderRadius: 10
        },
        {
          label: "Avg Turnaround",
          data: comparisonData.map(item => item.turnaroundTime),
          backgroundColor: "#f59e0b",
          borderRadius: 10
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}
