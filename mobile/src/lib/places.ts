/** U.S. states and territories with a seat in Congress, for turning "Iowa 2" or "ohio senators" into a place. */
export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

const BY_NAME = Object.fromEntries(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));
const FILLER = /\b(district|dist|the|my|rep|reps|representative|representatives|senator|senators|represents|represent|whos|what|congressman|congresswoman|member|members|who|is|are|for|of|in|st|nd|rd|th)\b/g;

/**
 * A place in a search: "Iowa", "iowa 2nd district", "IA-2", "ohio senators", "AZ 3". Returns the state code
 * and, when given, the district number. Two-letter codes only count when written like a code ("IA", "IA-2"),
 * so ordinary words such as "in" or "me" aren't read as Indiana or Maine.
 */
export function parsePlace(q: string): { state: string; district: number | null } | null {
  const raw = q.trim();
  const code = raw.match(/^([A-Za-z]{2})(?:[-\s]?(\d{1,2}))?$/);
  if (code && STATES[code[1].toUpperCase()] && (code[1] === code[1].toUpperCase() || code[2])) {
    return { state: code[1].toUpperCase(), district: code[2] ? Number(code[2]) : null };
  }
  const words = raw
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9\s]/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const number = words.match(/\b(\d{1,2})\b/);
  const name = words.replace(/\b\d{1,2}\b/g, '').trim();
  const state = BY_NAME[name];
  return state ? { state, district: number ? Number(number[1]) : null } : null;
}
