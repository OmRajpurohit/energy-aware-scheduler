import unittest

from app import app


class FlaskAppTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["ok"], True)

    def test_schedule_endpoint_returns_comparison_payload(self):
        response = self.client.post(
            "/api/schedule",
            json={
                "tasks": [
                    {"id": "P1", "arrival": 0, "burst": 6, "deadline": 10},
                    {"id": "P2", "arrival": 2, "burst": 4, "deadline": 9},
                    {"id": "P3", "arrival": 4, "burst": 7, "deadline": 14},
                ],
                "algorithm": "EATS",
                "cores": 2,
                "mode": "balanced",
                "quantum": 2,
                "comparisonMode": True,
            },
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["request"]["algorithm"], "EATS")
        self.assertEqual(len(payload["comparisons"]), 5)
        self.assertEqual(len(payload["timeline"]["lanes"]), 2)
        self.assertIn("comparisonMetrics", payload["charts"])
        self.assertIn("insights", payload)

    def test_schedule_endpoint_validates_empty_workloads(self):
        response = self.client.post("/api/schedule", json={"tasks": []})

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())


if __name__ == "__main__":
    unittest.main()
