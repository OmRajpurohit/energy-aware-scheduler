export const chartPalette = {
  text: "#e6f0ff",
  muted: "#8da2c9",
  grid: "rgba(141, 162, 201, 0.12)",
  gridStrong: "rgba(141, 162, 201, 0.2)",
  tooltipBg: "rgba(7, 12, 24, 0.96)",
  tooltipBorder: "rgba(91, 140, 255, 0.28)",
  panelStroke: "rgba(255, 255, 255, 0.03)"
};

export function buildVerticalGradient(context, chartArea, startColor, endColor) {
  const gradient = context.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  return gradient;
}

export function buildHorizontalGradient(context, chartArea, startColor, endColor) {
  const gradient = context.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  return gradient;
}

export function createChartFramePlugin() {
  return {
    id: "neonFrame",
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;

      if (!chartArea) {
        return;
      }

      ctx.save();
      roundRect(ctx, chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top, 18);
      ctx.fillStyle = "rgba(8, 13, 26, 0.58)";
      ctx.strokeStyle = chartPalette.panelStroke;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };
}

export function createBarValuePlugin() {
  return {
    id: "barValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);

      ctx.save();
      ctx.font = "600 12px Inter, Segoe UI, sans-serif";
      ctx.fillStyle = "#dce9ff";
      ctx.textBaseline = "middle";

      meta.data.forEach((element, index) => {
        const value = chart.data.datasets[0].data[index];
        const x = element.x + 10;
        const y = element.y;

        ctx.fillText(String(value), x, y);
      });

      ctx.restore();
    }
  };
}

export function buildSharedOptions(extra = {}) {
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 650,
      easing: "easeOutQuart"
    },
    layout: {
      padding: {
        top: 8,
        right: 18,
        bottom: 8,
        left: 8
      }
    },
    plugins: {
      legend: {
        labels: {
          color: chartPalette.text,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "circle",
          padding: 18
        }
      },
      tooltip: {
        backgroundColor: chartPalette.tooltipBg,
        titleColor: "#f5fbff",
        bodyColor: "#c9dbff",
        borderColor: chartPalette.tooltipBorder,
        borderWidth: 1,
        displayColors: false,
        padding: 12
      }
    },
    scales: {
      x: {
        ticks: {
          color: chartPalette.muted,
          font: {
            size: 11,
            weight: "600"
          }
        },
        grid: {
          color: chartPalette.grid
        },
        border: {
          color: chartPalette.gridStrong
        }
      },
      y: {
        ticks: {
          color: chartPalette.muted,
          font: {
            size: 11,
            weight: "600"
          }
        },
        grid: {
          color: chartPalette.grid
        },
        border: {
          color: chartPalette.gridStrong
        }
      }
    }
  };

  return {
    ...baseOptions,
    ...extra,
    layout: {
      ...baseOptions.layout,
      ...extra.layout,
      padding: {
        ...baseOptions.layout.padding,
        ...extra.layout?.padding
      }
    },
    plugins: {
      ...baseOptions.plugins,
      ...extra.plugins,
      legend: {
        ...baseOptions.plugins.legend,
        ...extra.plugins?.legend,
        labels: {
          ...baseOptions.plugins.legend.labels,
          ...extra.plugins?.legend?.labels
        }
      },
      tooltip: {
        ...baseOptions.plugins.tooltip,
        ...extra.plugins?.tooltip
      }
    },
    scales: {
      x: {
        ...baseOptions.scales.x,
        ...extra.scales?.x,
        ticks: {
          ...baseOptions.scales.x.ticks,
          ...extra.scales?.x?.ticks
        },
        grid: {
          ...baseOptions.scales.x.grid,
          ...extra.scales?.x?.grid
        },
        border: {
          ...baseOptions.scales.x.border,
          ...extra.scales?.x?.border
        }
      },
      y: {
        ...baseOptions.scales.y,
        ...extra.scales?.y,
        ticks: {
          ...baseOptions.scales.y.ticks,
          ...extra.scales?.y?.ticks
        },
        grid: {
          ...baseOptions.scales.y.grid,
          ...extra.scales?.y?.grid
        },
        border: {
          ...baseOptions.scales.y.border,
          ...extra.scales?.y?.border
        }
      }
    }
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}