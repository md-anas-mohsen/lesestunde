import { store } from '../lib/store.js'
import { loadResults } from '../lib/db.js'

export async function renderProgressView(container) {
  const { user, results: cachedResults } = store.get()

  container.innerHTML = `
    <div class="progress-shell">
      <h2 class="progress-heading">Fortschritt <span class="progress-sub">Progress over time</span></h2>
      <div id="progressBody"><div class="loading-text"><div class="spinner"></div><span>Loading…</span></div></div>
    </div>`

  const body = container.querySelector('#progressBody')

  try {
    let results = cachedResults.length ? cachedResults : await loadResults(user.id)
    if (!cachedResults.length) store.set({ results })

    if (!results.length) {
      body.innerHTML = `
        <div class="progress-empty">
          <div class="big" style="font-size:3rem;opacity:.1">∅</div>
          <p>No exercises completed yet.</p>
          <p style="font-size:.8rem">Open any reading passage and tap <strong>✦ Exercises</strong> to get started.</p>
        </div>`
      return
    }

    const levelColors = { A1:'#2d7a4f',A2:'#4a9e6a',B1:'#b8860b',B2:'#c0721b',C1:'#b03a2e',C2:'#922b21' }

    // Stats summary
    const avg   = results.reduce((s, r) => s + Number(r.score), 0) / results.length
    const best  = Math.max(...results.map(r => Number(r.score)))
    const byLevel = {}
    results.forEach(r => {
      const lv = r.level || r.texts?.level || '?'
      if (!byLevel[lv]) byLevel[lv] = []
      byLevel[lv].push(Number(r.score))
    })

    body.innerHTML = `
      <div class="progress-stats">
        <div class="stat-card">
          <div class="stat-value">${results.length}</div>
          <div class="stat-label">Exercises done</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${scoreColor(avg)}">${Math.round(avg)}%</div>
          <div class="stat-label">Average score</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--green)">${Math.round(best)}%</div>
          <div class="stat-label">Best score</div>
        </div>
      </div>

      <div class="progress-by-level">
        ${Object.entries(byLevel).sort().map(([lv, scores]) => {
          const lvAvg = scores.reduce((a,b)=>a+b,0)/scores.length
          const lc = levelColors[lv] || 'var(--accent)'
          const barW = Math.round(lvAvg)
          return `
            <div class="level-progress-row">
              <span class="lp-level" style="color:${lc};border-color:${lc}">${lv}</span>
              <div class="lp-bar-wrap">
                <div class="lp-bar" style="width:${barW}%;background:${lc}"></div>
              </div>
              <span class="lp-pct" style="color:${lc}">${Math.round(lvAvg)}%</span>
              <span class="lp-count">${scores.length}×</span>
            </div>`
        }).join('')}
      </div>

      <div class="progress-section-title">Recent Results</div>
      <div class="results-list">
        ${results.slice(0, 30).map(r => {
          const sc    = Number(r.score)
          const lv    = r.level || r.texts?.level || '?'
          const lc    = levelColors[lv] || 'var(--muted)'
          const title = r.texts?.title || 'Unknown text'
          const date  = new Date(r.completed_at).toLocaleDateString('de-DE')
          return `
            <div class="result-row">
              <span class="result-level" style="color:${lc};border-color:${lc}">${lv}</span>
              <span class="result-title">${escHtml(title)}</span>
              <span class="result-score" style="color:${scoreColor(sc)}">${Math.round(sc)}%</span>
              <span class="result-date">${date}</span>
            </div>`
        }).join('')}
      </div>
    `
  } catch(e) {
    body.innerHTML = `<div class="exercise-error">⚠ ${e.message}</div>`
  }
}

function scoreColor(s) {
  return s >= 80 ? 'var(--green)' : s >= 50 ? 'var(--gold)' : 'var(--accent)'
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
