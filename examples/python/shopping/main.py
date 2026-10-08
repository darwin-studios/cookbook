"""Compare only actual offer responses from two independent agents."""

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.browse import DarwinError, show_connection_details, choices, eligible, has_result, read_thread, review_pending, search, send_thread_message, show_outcome, start_thread


def product_research(item):
    text = f"{item.get('name', '')} {item.get('description', '')}".lower()
    name = item.get("name", "").lower()
    return bool(re.search(r"product.search|shopping search|shopping results|google shopping|price comparison|product discovery|\bquote\b", text)) and not any(word in name for word in ("purchase", "checkout", "order", "buy product", "shopping guide"))


def run():
    item = input("What exact item are you looking for? ").strip()
    if not item:
        raise ValueError("Enter an item to search for")
    constraints = input("Budget, condition, delivery, or other requirements: ").strip()
    query = f"{item} {constraints}".strip()
    objective = "Find current product offers, not a checkout action"
    found = choices(search(query, context=[{"type": "text", "text": objective}], maxResults=10))
    if not any(eligible(choice) for choice in found if product_research(choice)):
        print("No available match for the exact item. Broadening agent discovery; the item and constraints remain unchanged.")
        found += choices(search("product search", context=[{"type": "text", "text": f"{query}. {objective}"}], maxResults=10))
    by_agent = {}
    for choice in found:
        if not product_research(choice):
            continue
        previous = by_agent.get(choice["agent"])
        if previous is None or (not eligible(previous) and eligible(choice)):
            by_agent[choice["agent"]] = choice
    results = list(by_agent.values())
    show_connection_details(results)
    print(f"\n{len(results)} distinct product-search agents")
    for index, choice in enumerate(results, 1):
        status = choice.get("readiness") if eligible(choice) else choice.get("threadUnavailableReason", "unavailable")
        print(f"{index}. {choice['agentName']} — {choice['name']} [{status}]")
    if not any(map(eligible, results)):
        print("No available product-search route. No offers were invented.")
        return
    if not os.getenv("DARWIN_ACCESS_TOKEN"):
        print("Search is complete. Run the OAuth helper to compare real provider responses.")
        return
    numbers = list(dict.fromkeys(int(value.strip()) for value in input("Choose up to two available numbers, separated by commas: ").split(",")))[:2]
    selected = [results[number - 1] if 1 <= number <= len(results) else None for number in numbers]
    if not selected or not all(map(eligible, selected)):
        raise ValueError("Choose available, distinct agents")
    outcomes = []
    for choice in selected:
        print(f"\n{choice['agentName']} / {choice['name']}\nKeep the request exact: {query}")
        print("Use the capability documentation linked in its connection prompt to review arguments.")
        args = json.loads(input("Reviewed JSON arguments for this agent: ") or "{}")
        if not isinstance(args, dict):
            raise ValueError("Arguments must be a JSON object")
        if input(f"Send {json.dumps(args)} to this agent? Type yes: ").strip() != "yes":
            continue
        started = start_thread({**choice, "query": query}, "action_request", args)
        print(f"Accepted on thread {started['thread']}; waiting for a result.")
        outcome = read_thread(started["thread"], started.get("cursor"))
        if any(request.get("type") == "authentication_request" for request in outcome["pending"]):
            outcome = review_pending(outcome)
        outcomes.append((choice, outcome))
    for index, (choice, outcome) in enumerate(outcomes, 1):
        print(f"Comparison {index}: {choice['agentName']}")
        show_outcome(choice["agentName"], outcome)
    if outcomes and all(has_result(outcome["messages"]) and not outcome["errors"] for _, outcome in outcomes):
        print("Compare the actual offer details above. This script never chooses an offer for you.")
        try:
            next_value = input("Continue with one agent? Enter its comparison number, or press Enter to stop: ").strip()
        except EOFError:
            next_value = ""
        if next_value:
            number = int(next_value)
            if not 1 <= number <= len(outcomes):
                raise ValueError("Choose a listed comparison number")
            choice, previous = outcomes[number - 1]
            message = input("What exact follow-up should that agent receive? ").strip()
            if message and input(f"Send {json.dumps(message)} to {choice['agentName']}? Type yes: ").strip() == "yes":
                send_thread_message(previous["thread"], message)
                continued = read_thread(previous["thread"], previous["cursor"], require_result=False)
                if continued["pending"]:
                    continued = review_pending(continued)
                show_outcome(choice["agentName"], continued)
    elif outcomes:
        raise ValueError("Comparison is incomplete; a missing provider result is not an offer")


if __name__ == "__main__":
    try:
        run()
    except (DarwinError, ValueError, KeyError, IndexError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
