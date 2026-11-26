"""Plain, fixed explanations of where a bill is and what comes next. No AI: the same words for every bill
at the same step, written once and checked against the House and Senate's own process guides."""

from app import timeline

# What the next step on the path means, as the end of "Next: …".
NEXT = {
    "in_committee": "a committee reviews it.",
    "passed_house": "the full House votes on it.",
    "passed_senate": "the full Senate votes on it.",
    "to_president": "it goes to the President.",
    "became_law": "the President signs it into law or vetoes it.",
}

# One line on what reaching a step means, for alerts and the glossary.
MEANS = {
    "introduced": "A member of Congress formally proposed it.",
    "in_committee": "A committee is reviewing it. Most bills never leave committee.",
    "passed_house": "A majority of the House voted for it.",
    "passed_senate": "A majority of the Senate voted for it.",
    "to_president": "Both chambers passed the same text. The President has 10 days, not counting Sundays, to act.",
    "became_law": "It's now law.",
    "vetoed": "The President rejected it. Congress can override a veto with a two-thirds vote in both chambers.",
}


# "H.R. 1148 passed the House": what happened, as the end of a sentence.
PAST = {
    "introduced": "was introduced",
    "in_committee": "went to committee",
    "passed_house": "passed the House",
    "passed_senate": "passed the Senate",
    "to_president": "went to the President",
    "became_law": "became law",
    "vetoed": "was vetoed",
}


def next_step(bill_type: str, stage: str) -> str | None:
    """"Next: the full Senate votes on it." for a bill that just reached `stage`; None at the end of the path."""
    order = timeline.path(bill_type)
    if stage not in order or stage == order[-1]:
        return None
    upcoming = order[order.index(stage) + 1]
    return f"Next: {NEXT[upcoming]}" if upcoming in NEXT else None


def stage_line(bill_type: str, stage: str) -> str:
    """What reaching a step means, then what comes next."""
    parts = [MEANS.get(stage, "")]
    if nxt := next_step(bill_type, stage):
        parts.append(nxt)
    return " ".join(p for p in parts if p)


def stage_label(bill_type: str, stage: str) -> str:
    label = timeline.LABELS.get(stage, (stage, stage))[0]
    if bill_type in ("HRES", "SRES", "HCONRES", "SCONRES") and stage in ("passed_house", "passed_senate"):
        label = label.replace("Passed", "Agreed to in")
    return label
