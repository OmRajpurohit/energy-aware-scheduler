from scheduler_algorithms import build_comparator, simulate_priority, simulate_round_robin
from scheduler_utils import (
    BASELINE_FREQUENCY,
    FREQUENCY_LEVELS,
    calculate_energy,
    format_frequency_profile,
    get_execution_duration,
    normalize_mode,
    round_number,
)

ALGORITHMS = ["FCFS", "SJF", "RR", "EDF", "EATS"]
DEFAULT_QUANTUM = 2

ALGORITHM_LABELS = {
    "FCFS": "First Come First Serve",
    "SJF": "Shortest Job First",
    "RR": "Round Robin",
    "EDF": "Earliest Deadline First",
    "EATS": "Energy-Aware Task Scheduling",
}


def schedule(tasks, algorithm="EATS", cores=1, mode="balanced", quantum=DEFAULT_QUANTUM, comparison_mode=False):
    normalized_tasks = normalize_tasks(tasks or [])
    safe_algorithm = algorithm if algorithm in ALGORITHMS else "EATS"
    safe_cores = max(1, int(cores) if str(cores).isdigit() else 1)
    safe_mode = normalize_mode(mode)
    safe_quantum = max(1, int(quantum) if str(quantum).isdigit() else DEFAULT_QUANTUM)
    execution_config = {
        "cores": safe_cores,
        "mode": safe_mode,
        "quantum": safe_quantum,
    }

    results_by_algorithm = {
        name: run_algorithm(normalized_tasks, name, execution_config)
        for name in ALGORITHMS
    }
    primary_result = results_by_algorithm[safe_algorithm]
    comparisons = [
        build_comparison_row(name, results_by_algorithm[name])
        for name in ALGORITHMS
    ]

    return {
        "request": {
            "algorithm": safe_algorithm,
            "algorithmLabel": ALGORITHM_LABELS[safe_algorithm],
            "cores": safe_cores,
            "mode": safe_mode,
            "quantum": safe_quantum,
            "comparisonMode": bool(comparison_mode),
            "taskCount": len(normalized_tasks),
            "frequencyLevels": FREQUENCY_LEVELS,
        },
        "summary": primary_result["summary"],
        "metrics": primary_result["metrics"],
        "gantt": primary_result["gantt"],
        "timeline": primary_result["timeline"],
        "processes": primary_result["processes"],
        "comparisons": comparisons,
        "insights": {},
        "charts": build_charts(primary_result, comparisons),
        "_comparisonResults": results_by_algorithm,
    }


def normalize_tasks(tasks):
    normalized = []
    for index, task in enumerate(tasks):
        arrival = max(0, int(task.get("arrival", 0) or 0))
        burst = max(1, int(task.get("burst", 1) or 1))
        deadline_value = task.get("deadline")
        deadline = int(deadline_value) if deadline_value not in (None, "", 0, "0") and int(deadline_value) > 0 else None
        normalized.append({
            "id": task.get("id") or f"P{index + 1}",
            "arrival": arrival,
            "burst": burst,
            "deadline": deadline,
            "order": index,
        })
    return normalized


def run_algorithm(tasks, algorithm, config):
    cloned_tasks = [create_task_state(task) for task in tasks]
    simulation = (
        simulate_round_robin(cloned_tasks, config)
        if algorithm == "RR"
        else simulate_priority(cloned_tasks, config, build_comparator(algorithm))
    )
    processes = build_process_metrics(cloned_tasks)
    summary = build_summary(simulation["gantt"], processes, algorithm, config)
    metrics = build_metrics(summary, processes, config["cores"])
    timeline = build_timeline(simulation["gantt"], config["cores"], summary["totalTime"])

    return {
        "gantt": sort_segments(simulation["gantt"]),
        "timeline": timeline,
        "processes": processes,
        "summary": summary,
        "metrics": metrics,
        "queue_snapshots": simulation["queue_snapshots"],
    }


def create_task_state(task):
    return {
        **task,
        "remaining_work": task["burst"],
        "completion_time": None,
        "first_start_time": None,
        "total_energy": 0,
        "total_run_time": 0,
        "segments": [],
        "frequencies": [],
    }


def build_process_metrics(tasks):
    processes = []
    for task in tasks:
        completion_time = round_number(task["completion_time"] if task["completion_time"] is not None else task["arrival"])
        turnaround_time = round_number(completion_time - task["arrival"])
        waiting_time = round_number(max(0, turnaround_time - task["total_run_time"]))
        response_time = round_number(max(0, (task["first_start_time"] if task["first_start_time"] is not None else task["arrival"]) - task["arrival"]))
        deadline_met = task["deadline"] is None or completion_time <= task["deadline"]
        average_frequency = (
            round_number(sum(segment["frequency"] * segment["duration"] for segment in task["segments"]) / task["total_run_time"])
            if task["total_run_time"] > 0
            else 0
        )
        baseline_runtime = get_execution_duration(task["burst"], BASELINE_FREQUENCY)
        baseline_energy = calculate_energy(BASELINE_FREQUENCY, baseline_runtime)
        processes.append({
            "id": task["id"],
            "arrival": task["arrival"],
            "burst": task["burst"],
            "deadline": task["deadline"],
            "firstStartTime": round_number(task["first_start_time"] if task["first_start_time"] is not None else task["arrival"]),
            "completionTime": completion_time,
            "waitingTime": waiting_time,
            "turnaroundTime": turnaround_time,
            "responseTime": response_time,
            "deadlineMet": deadline_met,
            "totalEnergy": round_number(task["total_energy"]),
            "baselineEnergy": round_number(baseline_energy),
            "energyDelta": round_number(task["total_energy"] - baseline_energy),
            "averageFrequency": average_frequency,
            "frequencyProfile": format_frequency_profile(task["frequencies"]),
            "segments": task["segments"],
        })
    return processes


def build_summary(gantt, processes, algorithm, config):
    total_time = max((segment["end"] for segment in gantt), default=0)
    total_capacity = total_time * config["cores"]
    busy_time = sum(segment["duration"] for segment in gantt)
    idle_time = max(0, total_capacity - busy_time)
    total_energy = sum(segment["energy"] for segment in gantt)
    baseline_energy = sum(process["baselineEnergy"] for process in processes)
    average_frequency = (
        sum(segment["frequency"] * segment["duration"] for segment in gantt) / busy_time
        if busy_time > 0
        else 0
    )
    completed_processes = len(processes)
    missed_deadlines = len([process for process in processes if not process["deadlineMet"]])
    deadline_success_rate = (
        ((completed_processes - missed_deadlines) / completed_processes) * 100
        if completed_processes > 0
        else 100
    )

    return {
        "algorithm": algorithm,
        "algorithmLabel": ALGORITHM_LABELS[algorithm],
        "mode": config["mode"],
        "cores": config["cores"],
        "quantum": config["quantum"],
        "totalTime": round_number(total_time),
        "busyTime": round_number(busy_time),
        "idleTime": round_number(idle_time),
        "totalEnergy": round_number(total_energy),
        "baselineEnergy": round_number(baseline_energy),
        "energyDelta": round_number(total_energy - baseline_energy),
        "energySavingsRate": round_number(((baseline_energy - total_energy) / baseline_energy) * 100) if baseline_energy > 0 else 0,
        "averageFrequency": round_number(average_frequency),
        "completedProcesses": completed_processes,
        "missedDeadlines": missed_deadlines,
        "deadlineSuccessRate": round_number(deadline_success_rate),
    }


def build_metrics(summary, processes, cores):
    count = len(processes) or 1
    average_waiting = sum(process["waitingTime"] for process in processes) / count
    average_turnaround = sum(process["turnaroundTime"] for process in processes) / count
    average_response = sum(process["responseTime"] for process in processes) / count
    cpu_utilization = ((summary["busyTime"] / (summary["totalTime"] * cores)) * 100) if summary["totalTime"] > 0 else 0
    throughput = (summary["completedProcesses"] / summary["totalTime"]) if summary["totalTime"] > 0 else 0

    return {
        "averageWaitingTime": round_number(average_waiting),
        "averageTurnaroundTime": round_number(average_turnaround),
        "averageResponseTime": round_number(average_response),
        "cpuUtilization": round_number(cpu_utilization),
        "throughput": round_number(throughput),
        "totalEnergy": summary["totalEnergy"],
        "totalTime": summary["totalTime"],
        "idleTime": summary["idleTime"],
        "missedDeadlines": summary["missedDeadlines"],
        "deadlineSuccessRate": summary["deadlineSuccessRate"],
    }


def build_timeline(gantt, cores, total_time):
    lanes = [{"core": index, "label": f"Core {index + 1}", "segments": []} for index in range(cores)]
    for segment in sort_segments(gantt):
        lanes[segment["core"]]["segments"].append(segment)
    return {
        "totalTime": round_number(total_time),
        "lanes": lanes,
    }


def build_charts(result, comparisons):
    ordered_gantt = sort_segments(result["gantt"])
    energy_timeline = []
    cumulative_energy = 0

    for segment in ordered_gantt:
        cumulative_energy += segment["energy"]
        energy_timeline.append({
            "label": f"{segment['coreLabel']}: {segment['process']}",
            "time": segment["end"],
            "value": round_number(cumulative_energy),
            "segmentEnergy": segment["energy"],
        })

    utilization_timeline = [{
        "label": f"{segment['coreLabel']}: {segment['process']}",
        "time": segment["end"],
        "value": segment["utilization"],
    } for segment in ordered_gantt]

    return {
        "energyTimeline": energy_timeline,
        "utilizationTimeline": utilization_timeline,
        "comparisonMetrics": {
            "waitingTime": [{"algorithm": item["algorithm"], "label": item["label"], "value": item["averageWaitingTime"]} for item in comparisons],
            "turnaroundTime": [{"algorithm": item["algorithm"], "label": item["label"], "value": item["averageTurnaroundTime"]} for item in comparisons],
            "totalEnergy": [{"algorithm": item["algorithm"], "label": item["label"], "value": item["totalEnergy"]} for item in comparisons],
            "deadlineSuccessRate": [{"algorithm": item["algorithm"], "label": item["label"], "value": item["deadlineSuccessRate"]} for item in comparisons],
        },
    }


def build_comparison_row(algorithm, result):
    return {
        "algorithm": algorithm,
        "label": ALGORITHM_LABELS[algorithm],
        "totalEnergy": result["summary"]["totalEnergy"],
        "baselineEnergy": result["summary"]["baselineEnergy"],
        "energyDelta": result["summary"]["energyDelta"],
        "averageWaitingTime": result["metrics"]["averageWaitingTime"],
        "averageTurnaroundTime": result["metrics"]["averageTurnaroundTime"],
        "averageResponseTime": result["metrics"]["averageResponseTime"],
        "cpuUtilization": result["metrics"]["cpuUtilization"],
        "throughput": result["metrics"]["throughput"],
        "deadlineSuccessRate": result["metrics"]["deadlineSuccessRate"],
        "totalTime": result["summary"]["totalTime"],
        "missedDeadlines": result["summary"]["missedDeadlines"],
    }


def sort_segments(gantt):
    return sorted(gantt, key=lambda segment: (segment["start"], segment["core"]))
