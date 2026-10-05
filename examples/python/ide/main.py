"""Suggest agents from an approved task summary; never upload source or Act."""

import json
import os
import re
import select
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.browse import choices, eligible, search

AREAS = {"frontend", "backend", "tests", "documentation", "configuration", "implementation"}
STOP = {"about", "and", "are", "building", "can", "current", "developer", "for", "from", "have", "need", "that", "the", "this", "with", "working", "your"}


def suggest(value):
    if not isinstance(value, dict):
        raise ValueError("Expected a context object")
    task = " ".join(str(value.get("task", "")).split())
    language = str(value.get("language", "")).strip().lower()
    area = str(value.get("workArea", "")).strip().lower()
    if not 8 <= len(task) <= 500 or len(language) > 40 or (area and area not in AREAS):
        raise ValueError("Use an 8–500 character approved task, short language, and coarse work area")
    query = task + (f" (working in {language})" if language else "") + (f" (current work area: {area})" if area else "")
    found = search(query, objective="Find agents with capabilities directly useful for this engineering task", numResults=8)
    terms = set(re.findall(r"[a-z0-9-]{3,}", task.lower())) - STOP
    acronyms = {term.lower() for term in re.findall(r"\b[A-Z]{2,}(?:-[A-Z]{2,})*\b", task)}
    suggestions = []
    for rank, item in enumerate(choices(found), 1):
        haystack = f"{item['agentName']} {item.get('name', '')} {item.get('description', '')[:1000]}".lower()
        matched = [term for term in terms if re.search(rf"\b{re.escape(term)}\b", haystack)]
        if len(matched) < 2 or (acronyms and sum(term in haystack for term in acronyms) < min(2, len(acronyms))):
            continue
        suggestions.append({
            "rank": rank, "agent": {"id": item["agent"], "name": item["agentName"]},
            "capability": {"id": item["capability"], "name": item.get("name", ""), "description": item.get("description", "")[:300]},
            "matchedTaskTerms": sorted(matched)[:5], "readiness": item.get("readiness", "unknown"),
            "canStartThread": item.get("canStartThread") is True,
            "canAttemptThread": item.get("canAttemptThread") is True,
            "eligibleForActAttempt": eligible(item),
            **({"unavailableReason": item["threadUnavailableReason"]} if item.get("threadUnavailableReason") else {}),
        })
        if len(suggestions) == 5:
            break
    return {"type": "suggestions", "task": task, **({"language": language} if language else {}),
            **({"workArea": area} if area else {}), "outcome": found.get("outcome"), "suggestions": suggestions}


def emit(value):
    print(json.dumps(value), flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        try:
            emit(suggest({"task": sys.argv[2], "language": os.getenv("DARWIN_IDE_LANGUAGE", "")}))
        except (ValueError, OSError, KeyError) as error:
            emit({"type": "error", "message": str(error)})
            sys.exit(1)
    else:
        emit({"type": "ready", "message": "Send approved task and language as JSON lines"})
        pending, last, last_at, due = None, "", 0.0, 0.0
        while True:
            timeout = max(0.0, due - time.monotonic()) if pending is not None else None
            readable, _, _ = select.select([sys.stdin], [], [], timeout)
            if readable:
                line = sys.stdin.readline()
                if not line:
                    if pending is not None:
                        try:
                            emit(suggest(pending))
                        except (ValueError, OSError, KeyError) as error:
                            emit({"type": "error", "message": str(error)})
                    break
                try:
                    pending = json.loads(line)
                    due = time.monotonic() + 1.0
                except ValueError as error:
                    emit({"type": "error", "message": str(error)})
            elif pending is not None:
                current, pending = pending, None
                fingerprint = json.dumps(current, sort_keys=True)
                if fingerprint == last:
                    emit({"type": "unchanged"})
                    continue
                delay = max(0.0, 30.0 - (time.monotonic() - last_at))
                if delay:
                    pending, due = current, time.monotonic() + delay
                    continue
                try:
                    emit(suggest(current))
                    last, last_at = fingerprint, time.monotonic()
                except (ValueError, OSError, KeyError) as error:
                    emit({"type": "error", "message": str(error)})
