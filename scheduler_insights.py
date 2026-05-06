from scheduler_utils import round_number


def build_insights(result, comparisons, request):
    deadline_misses = [
        build_deadline_miss_insight(process)
        for process in result["processes"]
        if not process["deadlineMet"]
    ]
    bottleneck = build_bottleneck_insight(result["queue_snapshots"])
    suggestions = []
    current_comparison = next(
        (item for item in comparisons if item["algorithm"] == request["algorithm"]),
        None,
    )
    best_deadline_algorithm = get_best_by(comparisons, "deadlineSuccessRate")
    best_energy_algorithm = get_best_by(comparisons, "totalEnergy", lower_is_better=True)

    if deadline_misses and request["cores"] < 4:
        suggestions.append("Increase the core count to absorb queued work sooner during busy intervals.")

    if (
        best_deadline_algorithm
        and current_comparison
        and best_deadline_algorithm["algorithm"] != request["algorithm"]
        and best_deadline_algorithm["deadlineSuccessRate"] > current_comparison["deadlineSuccessRate"]
    ):
        suggestions.append(
            f"Switch to {best_deadline_algorithm['algorithm']} for this workload to improve deadline adherence."
        )

    if request["mode"] != "performance" and any("low DVFS" in item["reason"] for item in deadline_misses):
        suggestions.append("Use Performance mode when deadlines are tight and the current DVFS setting is stretching run time.")

    if (
        best_energy_algorithm
        and current_comparison
        and best_energy_algorithm["algorithm"] != request["algorithm"]
        and best_energy_algorithm["totalEnergy"] < current_comparison["totalEnergy"]
        and result["summary"]["energyDelta"] > 0
    ):
        suggestions.append(f"{best_energy_algorithm['algorithm']} is the lower-energy option for the same dataset.")

    if result["metrics"]["averageWaitingTime"] > 3 and request["algorithm"] != "RR":
        suggestions.append("Round Robin can reduce long waits when the queue stays congested for extended periods.")

    return {
        "deadlineMisses": deadline_misses,
        "bottlenecks": [bottleneck] if bottleneck else [],
        "suggestions": suggestions[:3],
    }


def build_deadline_miss_insight(process):
    queue_delay = round_number(process["firstStartTime"] - process["arrival"])
    reason = "execution extended beyond the deadline."

    if queue_delay > process["burst"] * 0.4:
        reason = f"queue congestion delayed the first dispatch by {queue_delay} time units."
    elif process["averageFrequency"] <= 1.2:
        reason = f"low DVFS frequency averaged {process['averageFrequency']} GHz and slowed completion."

    return {
        "process": process["id"],
        "completionTime": process["completionTime"],
        "deadline": process["deadline"],
        "reason": reason,
    }


def build_bottleneck_insight(queue_snapshots):
    if not queue_snapshots:
        return None

    peak = max(queue_snapshots, key=lambda snapshot: snapshot["readyCount"])
    if peak["readyCount"] < 3:
        return None

    return {
        "time": peak["time"],
        "readyCount": peak["readyCount"],
        "message": f"{peak['readyCount']} processes were waiting around t={peak['time']}, which indicates a queue bottleneck.",
    }


def get_best_by(items, key, lower_is_better=False):
    if not items:
        return None
    return sorted(items, key=lambda item: item[key], reverse=not lower_is_better)[0]
