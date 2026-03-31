function calculateEnergy(freq, time) {
  return freq * freq * time;
}

function getFrequency(util, mode) {
  if (mode === "performance") return 3;

  if (util < 0.4) return 1;
  if (util < 0.8) return 2;
  return 3;
}

module.exports = { calculateEnergy, getFrequency };