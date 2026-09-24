const GROUP_LABEL = { open: 'Open', afgerond: 'Afgerond', geblokkeerd: 'Geblokkeerd' };

export default function Filters({ cfg, filters, setFilters, options, onReset }) {
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const active = ['status', 'group', 'responsible', 'pop', 'gemeente', 'q'].some((k) => filters[k]);
  return (
    <div className="filters card">
      <input className="search" type="search" placeholder="Zoek adres, contact, opmerking…" value={filters.q} onChange={set('q')} />
      <select value={filters.group} onChange={set('group')}>
        <option value="">Alle groepen</option>
        {Object.keys(cfg.groups).map((g) => (
          <option key={g} value={g}>
            {GROUP_LABEL[g]}
          </option>
        ))}
      </select>
      <select value={filters.status} onChange={set('status')}>
        <option value="">Alle statussen</option>
        {cfg.statuses.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={filters.responsible} onChange={set('responsible')}>
        <option value="">Alle verantwoordelijken</option>
        <option value="__none">— niet toegewezen —</option>
        {options.resp.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={filters.gemeente} onChange={set('gemeente')}>
        <option value="">Alle gemeenten</option>
        {options.gem.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={filters.pop} onChange={set('pop')}>
        <option value="">Alle POP's</option>
        {options.pops.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={filters.sort} onChange={set('sort')} title="Sortering">
        <option value="address">Sorteer: adres</option>
        <option value="route">Sorteer: route</option>
        <option value="updated">Sorteer: laatst gewijzigd</option>
        <option value="status">Sorteer: status</option>
      </select>
      {active && (
        <button className="ghost" onClick={onReset}>
          Wis filters
        </button>
      )}
    </div>
  );
}
