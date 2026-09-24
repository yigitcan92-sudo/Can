import { GUIDE } from '../content/surveyorGuide.js';
import { useData } from '../data/DataContext.jsx';

export default function GuidePage() {
  const { perms } = useData();

  function download() {
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${GUIDE.title}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#111}
table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1f5f9}.sym{font-size:20px;text-align:center;width:60px}h2{margin-top:2rem;border-bottom:2px solid #0f766e}</style></head>
<body>${document.getElementById('guide-content').innerHTML}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'surveyor-gids.html';
    a.click();
  }

  return (
    <div className="guide">
      <div className="page-head">
        <h2>Surveyor-gids</h2>
        <div className="actions">
          <button className="ghost" onClick={() => window.print()}>Afdrukken / PDF</button>
          <button className="primary" onClick={download}>Download gids</button>
        </div>
      </div>
      {perms.isCoordinator && GUIDE.isTemplate && (
        <div className="banner">
          Deze gids bevat nog sjablooninhoud. Neem de BEON-symbolen en quadrantentabel over uit de bestaande surveyor-gids in{' '}
          <code>src/content/surveyorGuide.js</code>.
        </div>
      )}
      <article id="guide-content" className="card guide-content">
        <h1>{GUIDE.title}</h1>
        <p>{GUIDE.intro}</p>
        {GUIDE.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.text && <p>{s.text}</p>}
            {s.steps && (
              <ol>
                {s.steps.map((t) => <li key={t}>{t}</li>)}
              </ol>
            )}
            {s.table && (
              <table>
                <thead>
                  <tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className={s.table.symbolCol === j ? 'sym' : ''}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
