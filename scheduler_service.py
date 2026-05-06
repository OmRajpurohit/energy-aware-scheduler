from scheduler_engine import schedule
from scheduler_insights import build_insights


def build_schedule_response(payload):
    tasks = payload.get("tasks") or []
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("Please add at least one process before running the simulation.")

    response = schedule(
        tasks=tasks,
        algorithm=payload.get("algorithm"),
        cores=payload.get("cores", 1),
        mode=payload.get("mode", "balanced"),
        quantum=payload.get("quantum", 2),
        comparison_mode=payload.get("comparisonMode", False),
    )
    response["insights"] = build_insights(
        {
            "processes": response["processes"],
            "summary": response["summary"],
            "metrics": response["metrics"],
            "queue_snapshots": response["_comparisonResults"][response["request"]["algorithm"]]["queue_snapshots"],
        },
        response["comparisons"],
        {
            "algorithm": response["request"]["algorithm"],
            "cores": response["request"]["cores"],
            "mode": response["request"]["mode"],
        },
    )
    response.pop("_comparisonResults", None)
    return response
