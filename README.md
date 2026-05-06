## Energy-Aware CPU Scheduling Simulator

Flask serves both the simulator dashboard and the scheduling API.

### Run Locally

```bash
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

### CI

GitHub Actions runs:

- Python dependency installation
- source compilation checks
- Flask API smoke tests

### CD

Production deployment is handled by GitHub Actions through Vercel on pushes to `main`.

Repository secrets required:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
