import { store } from '../lib/store.js'
import { aiGetDefinition } from '../lib/ai.js'
import { updateWordDefinition } from '../lib/db.js'

const levelColors = { A1:'#2d7a4f',A2:'#4a9e6a',B1:'#b8860b',B2:'#c0721b',C1:'#b03a2e',C2:'#922b21' }

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * Walk every text node inside `root`, split on `pattern`, and replace
 * matching segments with <span class="vocab-word"> elements.
 * Operating only on Text nodes means the regex never sees HTML attribute
 * strings, so words like "ab" cannot corrupt data-word="..." values.
 */
function annotateTextNodes(root, pattern) {
  const textNodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) textNodes.push(node)

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue
    pattern.lastIndex = 0
    if (!pattern.test(text)) return

    const parts = text.split(pattern)
    if (parts.length === 1) return

    const frag = document.createDocumentFragment()
    parts.forEach(part => {
      if (!part) return
      pattern.lastIndex = 0
      if (pattern.test(part)) {
        const span = document.createElement('span')
        span.className = 'vocab-word'
        span.dataset.word = part
        span.textContent = part
        frag.appendChild(span)
      } else {
        frag.appendChild(document.createTextNode(part))
      }
      pattern.lastIndex = 0
    })

    textNode.parentNode.replaceChild(frag, textNode)
  })
}

export function renderReadView(container) {
  const { texts, currentTextId, currentLevel } = store.get()
  const current = texts.find(t => t.id === currentTextId)

  if (!current) {
    container.innerHTML = `
      <div class="placeholder">
        <div class="big">Lesen</div>
        <p>Add German vocabulary words in the sidebar and generate a reading passage at your chosen level.</p>
        <p style="font-size:.76rem;margin-top:4px">Tap any highlighted word to see its meaning.</p>
      </div>`
    return
  }

  renderArticle(container, current)
}

export function renderArticle(container, entry) {
  const { words } = store.get()
  const wordsUsed = entry.words_used || []
  const paragraphs = entry.body.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const lc = levelColors[entry.level] || 'var(--accent)'
  const date = new Date(entry.created_at).toLocaleDateString('de-DE')

  // Build the shell with NO user content injected via innerHTML —
  // text is set via textContent to prevent any XSS or double-encoding.
  container.innerHTML = `
    <div class="article-card">
      <div class="card-actions">
        <button class="btn-small" id="regenBtn">↺ Regenerate</button>
        <button class="btn-small" id="newBtn">+ New</button>
        <span class="level-badge" style="color:${lc};border-color:${lc}">${entry.level}</span>
      </div>
      <div class="article-title"></div>
      <div class="article-body"></div>
      <div class="article-footer">
        <span class="footer-vocab"></span>
        <span>${date}</span>
      </div>
    </div>
  `

  container.querySelector('.article-title').textContent = entry.title
  container.querySelector('.footer-vocab').textContent =
    'Vocabulary: ' + wordsUsed.join(' · ')

  const bodyEl = container.querySelector('.article-body')
  paragraphs.forEach(text => {
    const p = document.createElement('p')
    p.textContent = text
    bodyEl.appendChild(p)
  })

  // Only highlight words that actually appear verbatim in the body text.
  // Dictionary-form separable verbs (e.g. "anrufen") won't appear in
  // grammatically correct German — the split form ("rufe...an") does —
  // so filtering here prevents phantom highlights and annotation errors.
  const bodyText = entry.body
  const highlightWords = wordsUsed.filter(w =>
    new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])${escapeRegex(w)}($|[^a-zA-ZäöüÄÖÜß])`, 'i').test(bodyText)
  )

  if (highlightWords.length > 0) {
    const sorted = [...highlightWords].sort((a, b) => b.length - a.length)
    const pattern = new RegExp('(' + sorted.map(escapeRegex).join('|') + ')', 'gi')
    annotateTextNodes(bodyEl, pattern)
  }

  container.querySelectorAll('.vocab-word').forEach(el =>
    el.addEventListener('click', handleWordClick))

  container.querySelector('#regenBtn').addEventListener('click', () => {
    store.set({ words: words.filter(w => entry.words_input.includes(w.word)) })
    document.dispatchEvent(new CustomEvent('app:generate'))
  })

  container.querySelector('#newBtn').addEventListener('click', () => {
    store.set({ currentTextId: null })
  })
}

// ── Definition popup ──────────────────────────────────────────
let popup = null
let activeEl = null

function ensurePopup() {
  if (!popup) {
    popup = document.createElement('div')
    popup.className = 'definition-popup'
    popup.id = 'defPopup'
    popup.innerHTML = `<span class="def-word" id="defWord"></span><span id="defMeaning"></span>`
    document.body.appendChild(popup)
  }
}

document.addEventListener('click', e => {
  if (!e.target.classList.contains('vocab-word')) hidePopup()
})

function hidePopup() {
  if (popup) popup.style.display = 'none'
  if (activeEl) { activeEl.classList.remove('active'); activeEl = null }
}

async function handleWordClick(e) {
  ensurePopup()
  const el = e.currentTarget
  const word = el.dataset.word

  if (activeEl && activeEl !== el) activeEl.classList.remove('active')
  el.classList.toggle('active')
  activeEl = el.classList.contains('active') ? el : null
  if (!el.classList.contains('active')) { hidePopup(); return }

  popup.querySelector('#defWord').textContent = word
  popup.querySelector('#defMeaning').textContent = 'Looking up…'
  positionPopup(el)
  popup.style.display = 'block'

  try {
    const def = await getOrFetchDef(word)
    popup.querySelector('#defMeaning').innerHTML = `
      <strong>${def.translation}</strong> <em>(${def.pos})</em>
      <br><span style="font-size:.78rem;opacity:.72;display:block;margin-top:4px">
        ${def.example_de}<br>${def.example_en}
      </span>`
  } catch {
    popup.querySelector('#defMeaning').textContent = 'Definition unavailable.'
  }
}

async function getOrFetchDef(word) {
  const { defCache, aiConfig, words } = store.get()
  if (defCache[word]) return defCache[word]

  const def = await aiGetDefinition(word, aiConfig)
  store.set(s => ({ defCache: { ...s.defCache, [word]: def } }))

  // Persist to Supabase if word is in our list
  const wordRow = words.find(w => w.word.toLowerCase() === word.toLowerCase())
  if (wordRow && !wordRow.translation) {
    try { await updateWordDefinition(wordRow.id, def) } catch {}
  }
  return def
}

function positionPopup(el) {
  const r = el.getBoundingClientRect()
  let top = r.bottom + 8, left = r.left
  if (left + 290 > window.innerWidth) left = window.innerWidth - 292
  if (top + 160 > window.innerHeight) top = r.top - 165
  popup.style.top = top + 'px'
  popup.style.left = left + 'px'
}
