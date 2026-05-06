from scheduler_utils import (
    BASELINE_FREQUENCY,
    EPSILON,
    calculate_energy,
    get_execution_duration,
    get_frequency,
    get_utilization,
    round_number,
)


def build_comparator(algorithm):
    if algorithm == "FCFS":
        return compare_fcfs
    if algorithm == "SJF":
        return compare_sjf
    if algorithm == "EDF":
        return compare_edf
    return compare_eats


def simulate_priority(tasks, config, comparator):
    gantt = []
    queue_snapshots = []
    unscheduled = list(tasks)
    core_available_times = [0 for _ in range(config["cores"])]

    while unscheduled:
        core_index = get_next_core_index(core_available_times)
        current_time = core_available_times[core_index]
        ready_tasks = [task for task in unscheduled if task["arrival"] <= current_time + EPSILON]

        if not ready_tasks:
            current_time = min(task["arrival"] for task in unscheduled)
            core_available_times[core_index] = current_time
            ready_tasks = [task for task in unscheduled if task["arrival"] <= current_time + EPSILON]

        ready_tasks.sort(key=lambda task: comparator(task, current_time))
        queue_snapshots.append({
            "time": round_number(current_time),
            "readyCount": len(ready_tasks),
            "activeCores": count_busy_cores(core_available_times, current_time),
        })

        task = ready_tasks[0]
        unscheduled = [candidate for candidate in unscheduled if candidate["id"] != task["id"]]
        segment = run_slice(
            task,
            core_index=core_index,
            start=current_time,
            work_units=task["remaining_work"],
            ready_count=len(ready_tasks),
            config=config,
        )
        task["remaining_work"] = 0
        task["completion_time"] = segment["end"]
        gantt.append(segment)
        core_available_times[core_index] = segment["end"]

    return {"gantt": gantt, "queue_snapshots": queue_snapshots}


def simulate_round_robin(tasks, config):
    gantt = []
    queue_snapshots = []
    core_available_times = [0 for _ in range(config["cores"])]
    ready_queue = []
    events = [
        {"time": task["arrival"], "order": task["order"], "type": "arrival", "task": task}
        for task in tasks
    ]
    event_order = len(tasks)
    sort_events(events)

    while events or ready_queue:
        core_index = get_next_core_index(core_available_times)
        current_time = core_available_times[core_index]
        flush_ready_events(events, ready_queue, current_time)

        if not ready_queue:
            next_event = events[0] if events else None
            if not next_event:
                break
            current_time = max(current_time, next_event["time"])
            core_available_times[core_index] = current_time
            flush_ready_events(events, ready_queue, current_time)

        if not ready_queue:
            continue

        queue_snapshots.append({
            "time": round_number(current_time),
            "readyCount": len(ready_queue),
            "activeCores": count_busy_cores(core_available_times, current_time),
        })

        task = ready_queue.pop(0)
        work_units = min(config["quantum"], task["remaining_work"])
        segment = run_slice(
            task,
            core_index=core_index,
            start=current_time,
            work_units=work_units,
            ready_count=len(ready_queue) + 1,
            config=config,
        )
        task["remaining_work"] = max(0, round_number(task["remaining_work"] - work_units))
        core_available_times[core_index] = segment["end"]
        gantt.append(segment)

        if task["remaining_work"] <= EPSILON:
            task["completion_time"] = segment["end"]
        else:
            events.append({
                "time": segment["end"],
                "order": event_order,
                "type": "requeue",
                "task": task,
            })
            event_order += 1
            sort_events(events)

    return {"gantt": gantt, "queue_snapshots": queue_snapshots}


def run_slice(task, core_index, start, work_units, ready_count, config):
    utilization = get_utilization(ready_count, config["cores"])
    frequency = get_frequency(
        task=task,
        mode=config["mode"],
        utilization=utilization,
        current_time=start,
    )
    duration = get_execution_duration(work_units, frequency)
    end = round_number(start + duration)
    energy = calculate_energy(frequency, duration)
    baseline_energy = calculate_energy(
        BASELINE_FREQUENCY,
        get_execution_duration(work_units, BASELINE_FREQUENCY),
    )
    deadline_met = task["deadline"] is None or end <= task["deadline"] + EPSILON

    if task["first_start_time"] is None:
        task["first_start_time"] = round_number(start)

    task["total_energy"] = round_number(task["total_energy"] + energy)
    task["total_run_time"] = round_number(task["total_run_time"] + duration)
    task["frequencies"].append(frequency)

    segment = {
        "process": task["id"],
        "start": round_number(start),
        "end": end,
        "duration": round_number(duration),
        "workUnits": round_number(work_units),
        "core": core_index,
        "coreLabel": f"Core {core_index + 1}",
        "frequency": frequency,
        "utilization": round_number(utilization * 100),
        "energy": round_number(energy),
        "baselineEnergy": round_number(baseline_energy),
        "deadline": task["deadline"],
        "deadlineMet": deadline_met,
    }
    task["segments"].append(segment)
    return segment


def compare_fcfs(task, _current_time):
    return (task["arrival"], task["order"])


def compare_sjf(task, _current_time):
    return (task["remaining_work"], task["arrival"], task["order"])


def compare_edf(task, _current_time):
    return (
        task["deadline"] if task["deadline"] is not None else float("inf"),
        task["arrival"],
        task["remaining_work"],
        task["order"],
    )


def compare_eats(task, current_time):
    return (
        get_slack(task, current_time),
        task["remaining_work"],
        task["arrival"],
        task["order"],
    )


def get_slack(task, current_time):
    if task["deadline"] is None:
        return float("inf")
    return round_number(
        task["deadline"] - current_time - get_execution_duration(task["remaining_work"], 1.2)
    )
def flush_ready_events(events, ready_queue, current_time):
    while events and events[0]["time"] <= current_time + EPSILON:
        ready_queue.append(events.pop(0)["task"])


def sort_events(events):
    events.sort(
        key=lambda event: (
            event["time"],
            0 if event["type"] == "arrival" else 1,
            event["order"],
        )
    )


def get_next_core_index(core_available_times):
    selected_index = 0
    for index, value in enumerate(core_available_times):
        if value < core_available_times[selected_index]:
            selected_index = index
    return selected_index


def count_busy_cores(core_available_times, current_time):
    return len([time for time in core_available_times if time > current_time + EPSILON])
