"""Everyday words for each official topic.

Every bill is filed under one Library of Congress policy area ("Health", "Social Welfare"...), but people think
in issues: abortion, Social Security, potholes, TikTok. This maps the words people actually use to the topics
those bills are filed under. The topic picker and Search both use it, so typing "abortion" finds Health, and
"Medicare" finds Health and Social Welfare.

A word can belong to several topics. Keep entries lowercase, plain, and about what a person would type.
"""

TOPIC_WORDS: dict[str, list[str]] = {
    "Agriculture and Food": [
        "farm", "farms", "farmers", "farming", "agriculture", "crops", "crop insurance", "ranchers", "ranching",
        "cattle", "livestock", "dairy", "milk", "corn", "soybeans", "wheat", "sugar", "pesticides", "fertilizer",
        "food safety", "food prices", "groceries", "school lunch", "snap", "food stamps", "wic", "hunger",
        "food banks", "farm bill", "usda", "organic", "gmo", "meat", "poultry", "eggs", "fishing", "seafood",
        "hemp", "rural",
    ],
    "Animals": [
        "animals", "animal welfare", "animal cruelty", "pets", "dogs", "cats", "puppy mills", "wildlife",
        "endangered species", "hunting", "horses", "zoos", "wolves", "bears", "birds", "marine mammals", "whales",
        "veterinarians", "animal testing",
    ],
    "Armed Forces and National Security": [
        "military", "army", "navy", "air force", "marines", "space force", "coast guard", "national guard",
        "troops", "soldiers", "service members", "veterans", "vets", "va", "gi bill", "military pay", "defense",
        "pentagon", "national security", "war", "nuclear weapons", "missiles", "draft", "military bases",
        "burn pits", "ptsd", "tricare", "military families", "ndaa", "terrorism", "intelligence", "cia", "nsa",
        "cybersecurity", "drones",
    ],
    "Arts, Culture, Religion": [
        "arts", "art", "artists", "music", "museums", "libraries", "culture", "religion", "religious freedom",
        "churches", "faith", "nea", "public broadcasting", "npr", "pbs", "smithsonian", "humanities", "film",
        "theater",
    ],
    "Civil Rights and Liberties, Minority Issues": [
        "civil rights", "civil liberties", "discrimination", "equality", "racism", "voting rights", "free speech",
        "first amendment", "second amendment", "privacy", "surveillance", "lgbtq", "gay rights", "transgender",
        "same-sex marriage", "women's rights", "equal pay", "disability rights", "ada", "hate crimes",
        "affirmative action", "dei", "diversity", "abortion", "reproductive rights", "religious liberty",
        "police misconduct", "reparations", "minority", "native americans",
    ],
    "Commerce": [
        "business", "small business", "businesses", "consumers", "consumer protection", "prices", "inflation",
        "price gouging", "competition", "antitrust", "monopolies", "big tech", "online shopping", "scams",
        "fraud", "product safety", "recalls", "credit cards", "junk fees", "manufacturing", "made in america",
        "supply chain", "retail", "franchises", "tourism", "gambling", "sports betting", "ticket prices",
        "right to repair",
    ],
    "Congress": [
        "congress", "congressional", "lawmakers", "stock trading", "congressional stock trading", "term limits",
        "ethics", "lobbying", "earmarks", "filibuster", "senate rules", "house rules", "congressional pay",
    ],
    "Crime and Law Enforcement": [
        "crime", "police", "policing", "law enforcement", "guns", "gun control", "gun rights", "firearms",
        "background checks", "assault weapons", "mass shootings", "prisons", "jail", "incarceration",
        "sentencing", "death penalty", "fentanyl", "drugs", "opioids", "drug trafficking", "human trafficking",
        "fbi", "atf", "dea", "domestic violence", "sexual assault", "child abuse", "cybercrime", "identity theft",
        "fraud", "marijuana", "cannabis", "weed", "bail", "juvenile justice", "victims", "border crime",
    ],
    "Economics and Public Finance": [
        "budget", "federal budget", "deficit", "debt", "national debt", "debt ceiling", "spending",
        "government spending", "appropriations", "shutdown", "government shutdown", "economy", "recession",
        "inflation", "federal reserve", "interest rates", "stimulus", "jobs report", "gdp",
    ],
    "Education": [
        "education", "schools", "public schools", "teachers", "students", "student loans", "student debt",
        "college", "university", "tuition", "financial aid", "pell grants", "fafsa", "school choice", "charter schools",
        "vouchers", "homeschool", "head start", "preschool", "pre-k", "special education", "school safety",
        "school shootings", "school meals", "curriculum", "trade school", "community college", "hbcu",
        "student athletes", "title ix", "literacy",
    ],
    "Emergency Management": [
        "disasters", "natural disasters", "fema", "hurricanes", "tornadoes", "floods", "flooding", "wildfires",
        "earthquakes", "disaster relief", "emergency", "emergency response", "first responders", "firefighters",
        "pandemic preparedness", "drought", "heat waves",
    ],
    "Energy": [
        "energy", "electricity", "power", "power grid", "utility bills", "gas prices", "gasoline", "oil",
        "natural gas", "fracking", "pipelines", "coal", "nuclear power", "solar", "wind", "renewable energy",
        "clean energy", "green energy", "climate", "climate change", "electric vehicles", "evs", "ev chargers",
        "batteries", "hydrogen", "energy efficiency", "heating", "propane", "offshore drilling",
    ],
    "Environmental Protection": [
        "environment", "climate", "climate change", "global warming", "pollution", "air pollution", "clean air",
        "clean water", "water pollution", "drinking water", "lead pipes", "pfas", "forever chemicals", "toxic waste",
        "superfund", "epa", "emissions", "carbon", "greenhouse gases", "plastics", "recycling", "conservation",
        "endangered species", "wetlands", "oceans", "environmental justice", "wildfires",
    ],
    "Families": [
        "families", "family", "parents", "parenting", "children", "kids", "child care", "childcare", "daycare",
        "paid leave", "family leave", "maternity leave", "paternity leave", "adoption", "foster care",
        "child support", "child tax credit", "marriage", "divorce", "domestic violence", "elder care",
        "caregivers", "babies", "baby formula",
    ],
    "Finance and Financial Sector": [
        "banks", "banking", "credit", "credit scores", "credit reports", "loans", "mortgages", "medical debt",
        "payday loans", "overdraft fees", "crypto", "cryptocurrency", "bitcoin", "stablecoins", "stocks",
        "stock market", "investing", "retirement accounts", "401k", "insurance", "wall street", "sec",
        "consumer finance", "cfpb", "fintech",
    ],
    "Foreign Trade and International Finance": [
        "trade", "tariffs", "imports", "exports", "trade deals", "china trade", "nafta", "usmca", "outsourcing",
        "sanctions", "currency",
    ],
    "Geographic Areas, Entities, and Committees": [
        "puerto rico", "dc statehood", "guam", "territories", "naming", "post office names", "commemorations",
    ],
    "Government Operations and Politics": [
        "government", "federal government", "post office", "postal service", "usps", "mail", "elections",
        "voting", "voter id", "mail-in voting", "election security", "campaign finance", "census", "redistricting",
        "gerrymandering", "federal workers", "civil service", "government waste", "transparency", "foia",
        "supreme court", "courts", "judges", "presidential", "executive orders", "doge",
    ],
    "Health": [
        "health", "health care", "healthcare", "health insurance", "medicare", "medicaid", "obamacare", "aca",
        "affordable care act", "prescription drugs", "drug prices", "insulin", "hospitals", "doctors", "nurses",
        "mental health", "suicide prevention", "addiction", "opioids", "abortion", "reproductive health",
        "contraception", "birth control", "ivf", "pregnancy", "maternal health", "vaccines", "covid", "pandemic",
        "cancer", "alzheimer's", "dementia", "autism", "disabilities", "rural hospitals", "nursing homes",
        "long-term care", "telehealth", "medical debt", "surprise billing", "cdc", "fda", "nih", "public health",
        "tobacco", "vaping", "nutrition", "dental", "vision", "hearing aids",
    ],
    "Housing and Community Development": [
        "housing", "affordable housing", "rent", "renters", "rent prices", "landlords", "eviction", "homeless",
        "homelessness", "mortgages", "first-time homebuyers", "home prices", "zoning", "public housing",
        "section 8", "hud", "fair housing", "community development", "neighborhoods",
    ],
    "Immigration": [
        "immigration", "immigrants", "border", "border security", "border wall", "asylum", "refugees",
        "deportation", "ice", "daca", "dreamers", "visas", "h-1b", "green cards", "citizenship", "naturalization",
        "undocumented", "illegal immigration", "migrants", "farm workers", "guest workers",
    ],
    "International Affairs": [
        "foreign policy", "foreign aid", "ukraine", "russia", "israel", "gaza", "china", "taiwan", "iran",
        "north korea", "nato", "united nations", "embassies", "diplomacy", "human rights", "state department",
        "international",
    ],
    "Labor and Employment": [
        "jobs", "employment", "unemployment", "workers", "wages", "minimum wage", "overtime", "unions",
        "labor unions", "collective bargaining", "strikes", "worker safety", "osha", "pensions", "retirement",
        "gig workers", "independent contractors", "job training", "apprenticeships", "paid sick leave",
        "child labor", "noncompetes", "remote work", "workplace discrimination", "unemployment benefits",
    ],
    "Law": [
        "courts", "judges", "lawsuits", "legal", "supreme court", "attorneys", "civil procedure", "arbitration",
        "tort reform", "class actions",
    ],
    "Native Americans": [
        "native americans", "tribes", "tribal", "indian health service", "reservations", "alaska natives",
        "native hawaiians", "tribal sovereignty",
    ],
    "Private Legislation": ["private bill", "relief of"],
    "Public Lands and Natural Resources": [
        "public lands", "national parks", "parks", "forests", "national forests", "wilderness", "mining", "logging",
        "grazing", "monuments", "camping", "hiking", "outdoor recreation", "blm", "land management", "minerals",
        "offshore drilling", "oil drilling",
    ],
    "Science, Technology, Communications": [
        "technology", "tech", "internet", "broadband", "wifi", "cell service", "5g", "social media", "tiktok",
        "facebook", "privacy", "data privacy", "artificial intelligence", "ai", "chips", "semiconductors", "space",
        "nasa", "science", "research", "telecommunications", "fcc", "net neutrality", "robocalls", "kids online",
        "online safety", "deepfakes", "cybersecurity", "quantum",
    ],
    "Social Sciences and History": [
        "history", "historic sites", "anniversaries", "statistics", "social science research",
    ],
    "Social Welfare": [
        "social security", "retirement", "seniors", "disability benefits", "ssi", "ssdi", "welfare",
        "food stamps", "snap", "tanf", "poverty", "low-income", "child tax credit", "earned income tax credit",
        "medicaid", "medicare", "safety net", "benefits",
    ],
    "Sports and Recreation": [
        "sports", "college sports", "nil", "olympics", "athletes", "recreation", "fishing", "boating", "golf",
        "youth sports", "concussions",
    ],
    "Taxation": [
        "taxes", "tax", "income tax", "irs", "tax cuts", "tax credits", "tax returns", "tax refunds", "property tax",
        "estate tax", "capital gains", "corporate taxes", "small business taxes", "tax deductions",
        "child tax credit", "tips", "no tax on tips", "overtime taxes", "tariffs", "salt deduction",
    ],
    "Transportation and Public Works": [
        "transportation", "roads", "highways", "bridges", "potholes", "infrastructure", "public transit",
        "buses", "trains", "rail", "railroads", "amtrak", "airlines", "airports", "flights", "faa", "air travel",
        "trucks", "trucking", "truck drivers", "traffic safety", "drunk driving", "cars", "auto safety",
        "self-driving cars", "ports", "shipping", "pipelines", "infrastructure bill",
    ],
    "Water Resources Development": [
        "water", "water supply", "dams", "levees", "rivers", "army corps of engineers", "flood control",
        "irrigation", "drought", "great lakes", "harbors", "colorado river",
    ],
}


def topics_for(term: str) -> list[str]:
    """Official topics an everyday word or phrase belongs to, best match first: exact words, then words
    that start with what was typed ("abort" -> abortion), then the topic's own name."""
    t = term.strip().lower()
    if len(t) < 2:
        return []
    # A word listed early for a topic is more central to it ("abortion" is core to Health).
    exact = sorted((topic for topic, words in TOPIC_WORDS.items() if t in words),
                   key=lambda topic: TOPIC_WORDS[topic].index(t) / len(TOPIC_WORDS[topic]))
    prefix = [topic for topic, words in TOPIC_WORDS.items()
              if topic not in exact and len(t) >= 3 and any(w.startswith(t) for w in words)]
    named = [topic for topic in TOPIC_WORDS if topic not in exact + prefix and t in topic.lower()]
    return exact + prefix + named
