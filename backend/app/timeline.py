"""A bill's path through Congress: which milestones it has reached, and when.

Milestones come from Congress.gov's action list, using Library of Congress action codes where they
exist (procedural actions such as "Rule H. Res. 499 passed House" share wording with real passage
votes, so text alone isn't reliable).
"""

from datetime import date

# Library of Congress action codes (https://www.congress.gov/help/field-values/action-codes).
CODES = {
    "1000": "introduced", "10000": "introduced", "Intro-H": "introduced", "Intro-S": "introduced",
    "8000": "passed_house",
    "17000": "passed_senate",
    "28000": "to_president",
    "31000": "vetoed",
    "36000": "became_law", "E40000": "became_law",
}


def _stage(action: dict) -> str | None:
    if stage := CODES.get(action.get("actionCode") or ""):
        return stage
    text = (action.get("text") or "").lower()
    if text.startswith("passed/agreed to in house"):
        return "passed_house"
    if text.startswith("passed/agreed to in senate"):
        return "passed_senate"
    if text.startswith("presented to president"):
        return "to_president"
    if text.startswith(("became public law", "became private law")):
        return "became_law"
    if text.startswith("vetoed by president"):
        return "vetoed"
    if "referred to" in text and action.get("type") in ("IntroReferral", "Committee"):
        return "in_committee"
    return None


def milestones(actions: list[dict], introduced: date | None = None) -> dict[str, str]:
    """{stage: earliest ISO date reached} from a bill's actions."""
    reached: dict[str, str] = {}
    if introduced:
        reached["introduced"] = introduced.isoformat()
    for action in actions:
        stage, when = _stage(action), action.get("actionDate")
        if stage and when and (stage not in reached or when < reached[stage]):
            reached[stage] = when
    return reached


def path(bill_type: str) -> list[str]:
    """The milestones a bill of this type goes through, in order. Simple resolutions stay in their
    own chamber; concurrent resolutions skip the President."""
    house_first = bill_type.startswith("H")
    chambers = ["passed_house", "passed_senate"] if house_first else ["passed_senate", "passed_house"]
    if bill_type in ("HRES", "SRES"):
        return ["introduced", "in_committee", chambers[0]]
    if bill_type in ("HCONRES", "SCONRES"):
        return ["introduced", "in_committee", *chambers]
    return ["introduced", "in_committee", *chambers, "to_president", "became_law"]


LABELS = {
    "introduced": ("Introduced", "Intro"),
    "in_committee": ("In committee", "Committee"),
    "passed_house": ("Passed House", "House"),
    "passed_senate": ("Passed Senate", "Senate"),
    "to_president": ("Sent to the President", "President"),
    "became_law": ("Became law", "Law"),
    "vetoed": ("Vetoed", "Vetoed"),
}


def steps(bill_type: str, reached: dict[str, str]) -> list[dict]:
    """Every step on the bill's path with its date. A step the bill went past without a recorded
    date (e.g. it skipped committee) counts as reached, with no date."""
    order = path(bill_type)
    if "vetoed" in reached and "became_law" not in reached:
        order[-1] = "vetoed"
    last = max((i for i, s in enumerate(order) if s in reached), default=0)
    resolution = bill_type in ("HRES", "SRES", "HCONRES", "SCONRES")
    out = []
    for i, stage in enumerate(order):
        label, short = LABELS[stage]
        if resolution and stage in ("passed_house", "passed_senate"):
            label = label.replace("Passed", "Agreed to in")
        out.append({"stage": stage, "label": label, "short": short, "date": reached.get(stage), "reached": i <= last})
    return out


def status(bill_type: str, reached: dict[str, str]) -> str:
    """The furthest step reached, e.g. "passed_house"."""
    reached_steps = [s for s in steps(bill_type, reached) if s["reached"]]
    return reached_steps[-1]["stage"] if reached_steps else "introduced"
