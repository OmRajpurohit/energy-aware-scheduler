from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from scheduler_service import build_schedule_response

BASE_DIR = Path(__file__).resolve().parent
CLIENT_DIR = BASE_DIR / "client"

app = Flask(__name__, static_folder=str(CLIENT_DIR), static_url_path="")


@app.get("/")
def index():
    return send_from_directory(CLIENT_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "message": "Scheduler API is ready"})


@app.post("/api/schedule")
def schedule_api():
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(build_schedule_response(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({"error": "Something went wrong"}), 500


@app.get("/<path:asset_path>")
def static_assets(asset_path):
    return send_from_directory(CLIENT_DIR, asset_path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
