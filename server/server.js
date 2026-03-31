const express = require("express");
const cors = require("cors");
const path = require("path");

const { schedule } = require("./scheduler");

const app = express();
const clientDir = path.join(__dirname, "..", "client");

app.use(cors());
app.use(express.json());
app.use(express.static(clientDir));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Scheduler API is ready" });
});

// Main API
app.post("/api/schedule", (req, res) => {
  try {
    const { tasks, algorithm, cores, mode } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Please add at least one process before running the simulation." });
    }

    const result = schedule(tasks, algorithm, cores, mode);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});


app.get("/", (req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});
