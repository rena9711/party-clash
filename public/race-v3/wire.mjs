// Compact, self-contained snapshots allow later packets to recover from dropped ones.
const fields = ['id','name','character','slot','rank','x','y','vx','vy','distance','time',
  'health','stars','done','hit','landedAt','protectedUntil','boostUntil','boostReadyAt'];
const precise = new Set(['x','y','vx','vy','distance','time','landedAt','protectedUntil','boostUntil','boostReadyAt']);

export function packRunner(runner) {
  return fields.map(field => precise.has(field) ? Math.round(runner[field]*1000)/1000 : runner[field]);
}

export function unpackRace(state) {
  if (!state?.rows) return state;
  const {rows, ...header} = state;
  return {...header, runners:rows.map(row => Object.fromEntries(fields.map((field, i) => [field,row[i]])))};
}
