const { schedule } = require("../server/scheduler");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tasks, algorithm, cores, mode } = req.body || {};

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Please add at least one process before running the simulation." });
    }

    return res.status(200).json(schedule(tasks, algorithm, cores, mode));
  } catch (error) {
    return res.status(500).json({ error: "Something went wrong" });
  }
};
