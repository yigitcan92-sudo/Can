// Statuswaarden en indeling, overgenomen uit de scopelist.
// Pas hier aan als de indeling wijzigt — de rest van de app leest alles hieruit.

export const GEMEENTEN = ['Beveren', 'Kruibeke', 'Temse', 'Sint-Niklaas', 'Waasmunster'];

export const SSV_STATUSES = [
  'Ongoing',
  'Done',
  'Pre-existing Fiber',
  'SDU',
  'Refused',
  'No Access',
  'Issue',
  'Nac',
  'Pending Validation',
];

export const TSA_STATUSES = [
  'Ongoing',
  'Last Call',
  'Resurvey',
  'Signed',
  'Fiber Constructed',
  'Refused',
  'Wrong Contact',
  'General Meeting',
  'SDU',
];

// Groepering voor KPI's: open / afgerond / geblokkeerd.
export const SSV_GROUPS = {
  open: ['Ongoing', 'Pending Validation'],
  afgerond: ['Done', 'Pre-existing Fiber', 'SDU'],
  geblokkeerd: ['Refused', 'No Access', 'Issue', 'Nac'],
};

export const TSA_GROUPS = {
  open: ['Ongoing', 'Last Call', 'Resurvey', 'General Meeting'],
  afgerond: ['Signed', 'Fiber Constructed', 'SDU'],
  geblokkeerd: ['Refused', 'Wrong Contact'],
};

export const STATUS_COLORS = {
  Ongoing: '#3b82f6',
  Done: '#16a34a',
  'Pre-existing Fiber': '#0d9488',
  SDU: '#64748b',
  Refused: '#dc2626',
  'No Access': '#f97316',
  Issue: '#e11d48',
  Nac: '#a855f7',
  'Pending Validation': '#eab308',
  'Last Call': '#f59e0b',
  Resurvey: '#8b5cf6',
  Signed: '#16a34a',
  'Fiber Constructed': '#047857',
  'Wrong Contact': '#fb7185',
  'General Meeting': '#0ea5e9',
};

export function groupOf(status, groups) {
  for (const [g, list] of Object.entries(groups)) if (list.includes(status)) return g;
  return 'open';
}

// Case-ongevoelige normalisatie van statuswaarden uit Excel ("done", "DONE ", ...)
export function normalizeStatus(raw, allowed) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit ?? s;
}
