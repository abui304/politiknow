"""Helping search understand everyday words.

People search in their own words ("climate change", "student debt", "HR 1037"); bills use legal ones
("greenhouse gas", "student loan", "H.R. 1037"). This module widens a search with a few common synonyms and
recognises bill numbers. Kept deliberately small and explicit: each entry should be an obvious equivalence,
not a guess, so results stay predictable.
"""

import re

# Everyday phrase -> words bills actually use. Matched on whole words, case-insensitively.
SYNONYMS: dict[str, list[str]] = {
    "climate": ["greenhouse gas", "emissions", "clean energy", "renewable"],
    "climate change": ["greenhouse gas", "emissions", "clean energy", "renewable"],
    "global warming": ["climate", "greenhouse gas", "emissions"],
    "green energy": ["clean energy", "renewable", "solar", "wind"],
    "clean energy": ["renewable", "solar", "wind", "low-emission"],
    "solar": ["renewable", "clean energy"],
    "ev": ["electric vehicle"],
    "evs": ["electric vehicle"],
    "student debt": ["student loan"],
    "tuition": ["student loan", "college", "higher education"],
    "college": ["higher education", "undergraduate"],
    "obamacare": ["affordable care act"],
    "aca": ["affordable care act"],
    "post office": ["postal service", "postal"],
    "mail": ["postal service"],
    "train": ["rail", "railroad"],
    "trains": ["rail", "railroad"],
    "guns": ["firearm"],
    "gun": ["firearm"],
    "weed": ["cannabis", "marijuana"],
    "pot": ["cannabis", "marijuana"],
    "vets": ["veterans"],
    "veteran": ["veterans"],
    "seniors": ["medicare", "social security", "older americans"],
    "drug prices": ["prescription drug", "insulin"],
    "border": ["immigration", "port of entry"],
    "internet": ["broadband"],
    "wifi": ["broadband"],
    "daycare": ["child care"],
    "childcare": ["child care"],
    "fires": ["wildfire"],
}

# "H.R. 1037", "HR1037", "hr 1037", "S. 2209", "H.Res. 12", "S.J.Res. 5", or a bare "1037".
_TYPES = {
    "hr": "HR", "s": "S", "hres": "HRES", "sres": "SRES", "hjres": "HJRES", "sjres": "SJRES",
    "hconres": "HCONRES", "sconres": "SCONRES",
}
_BILL_NUMBER = re.compile(r"^\s*(?:(h|s)\.?\s*(j\.?\s*|con\.?\s*)?(r\.?|res\.?)?\s*)?(\d{1,5})\s*$", re.I)


def bill_number(term: str) -> tuple[str | None, int] | None:
    """(bill type, number) when the search is a bill number, else None. The type is None for a bare
    number ("1037"), which matches that number in any chamber."""
    m = _BILL_NUMBER.match(term)
    if not m:
        return None
    chamber, joint, kind, number = m.groups()
    if not chamber:
        return None, int(number)
    key = "".join(re.sub(r"[.\s]", "", part or "").lower() for part in (chamber, joint, kind))
    return _TYPES.get({"h": "hr"}.get(key, key)), int(number)


def expand(term: str) -> str:
    """The search as websearch_to_tsquery input, with synonyms OR-ed in: "climate change" becomes
    'climate change or "greenhouse gas" or emissions ...'."""
    lower = term.lower()
    extra: list[str] = []
    for phrase, words in SYNONYMS.items():
        if re.search(rf"(?<![\w-]){re.escape(phrase)}(?![\w-])", lower):
            extra += [w for w in words if w not in extra and w not in lower]
    if not extra:
        return term
    return " or ".join([term, *(f'"{w}"' if " " in w else w for w in extra)])


def loosen(term: str) -> str:
    """Any-word version of a search, for when every word together finds nothing: 'student debt relief'
    becomes 'student or debt or relief'. Quoted phrases and -exclusions are kept as they are."""
    parts = re.findall(r'-?"[^"]+"|\S+', term)
    if len(parts) < 2 or any(p.lower() == "or" for p in parts):
        return term
    return " or ".join(p for p in parts if not p.startswith("-")) + "".join(f" {p}" for p in parts if p.startswith("-"))
