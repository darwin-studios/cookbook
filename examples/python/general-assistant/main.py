"""Find an agent for a task, then communicate only after review."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.browse import choices, eligible, has_result, read_thread, review_pending, search, show_outcome, start_thread


def run():
    task = os.getenv("DARWIN_INITIAL_TASK") or input("What would you like to get done? ").strip()
    if not task:
        raise ValueError("Enter a task to search for")
    results = choices(search(task, objective=task, numResults=5))
    print(f"\n{len(results)} matching capabilities")
    for index, item in enumerate(results, 1):
        status = item.get("readiness") if eligible(item) else item.get("threadUnavailableReason", "unavailable")
        print(f"{index}. {item['agentName']} — {item['name']} [{status}]")
        print(f"   {item.get('description', 'No description')} · {item['agent']} / {item['capability']}")
    if not any(map(eligible, results)):
        print("Nothing here can start a thread now. No agent was contacted.")
        return
    if not os.getenv("DARWIN_ACCESS_TOKEN"):
        print("Search is complete. Run the OAuth helper for a reviewed request.")
        return
    number = int(input("Choose an available number: "))
    selected = results[number - 1] if 1 <= number <= len(results) else None
    if not eligible(selected):
        raise ValueError("Choose a listed, available capability")
    mode = input("Ask a question [m] or run this capability [a]? ").strip()
    if mode not in ("m", "a"):
        raise ValueError("No request sent")
    content = task if mode == "m" else json.loads(input("Arguments as JSON object ({} for none): ") or "{}")
    if mode == "a" and not isinstance(content, dict):
        raise ValueError("Arguments must be a JSON object")
    print(f"\nTo: {selected['agentName']} / {selected['name']}\nRequest: {json.dumps(content)}")
    if input("Send this exact request? Type yes: ").strip() != "yes":
        raise ValueError("No request sent")
    started = start_thread(selected, "message" if mode == "m" else "action_request", content)
    print(f"Accepted on thread {started['thread']}; this is not a result.")
    outcome = read_thread(started["thread"], started.get("cursor"), require_result=mode == "a")
    if outcome["pending"]:
        outcome = review_pending(outcome)
    show_outcome(selected["agentName"], outcome)
    if outcome["errors"] or (mode == "a" and not has_result(outcome["messages"])):
        raise ValueError("No completed provider result")


if __name__ == "__main__":
    try:
        run()
    except (ValueError, KeyError, IndexError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
