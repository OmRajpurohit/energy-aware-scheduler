BASE_FREQUENCY = 1.2
BASELINE_FREQUENCY = 2.0
FREQUENCY_LEVELS = [0.8, 1.2, 2.0]
EPSILON = 1e-9


def round_number(value):
    return round(float(value) + 1e-12, 2)


def normalize_mode(mode):
    if mode == "power":
        return "power"
    if mode == "performance":
        return "performance"
    return "balanced"


def calculate_energy(frequency, runtime):
    return round_number(frequency * frequency * runtime)


def get_execution_duration(work_units, frequency):
    return round_number((work_units * BASE_FREQUENCY) / frequency)


def get_frequency(task=None, mode="balanced", utilization=0.5, current_time=0):
    normalized_mode = normalize_mode(mode)

    if normalized_mode == "performance":
        return 2.0

    has_deadline = task and task.get("deadline") is not None
    remaining_work = (task or {}).get("remaining_work", (task or {}).get("burst", 1))
    deadline_pressure = (
        task["deadline"] - current_time - get_execution_duration(remaining_work, BASE_FREQUENCY)
        if has_deadline
        else float("inf")
    )

    if normalized_mode == "power":
        if deadline_pressure < 0 or utilization > 0.9:
            return 2.0
        if deadline_pressure < 2 or utilization > 0.65:
            return 1.2
        return 0.8

    if deadline_pressure < 0 or utilization > 0.85:
        return 2.0
    if not has_deadline and utilization < 0.4:
        return 0.8
    return 1.2


def get_utilization(active_tasks, cores):
    safe_cores = max(1, int(cores) or 1)
    return min(max(active_tasks / safe_cores, 0.2), 1)


def format_frequency_profile(frequencies):
    if not frequencies:
        return "-"
    ordered = []
    for value in frequencies:
        label = f"{value} GHz"
        if label not in ordered:
            ordered.append(label)
    return ", ".join(ordered)
