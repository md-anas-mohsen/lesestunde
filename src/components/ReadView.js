import { store } from '../lib/store.js'
import { aiGetDefinition } from '../lib/ai.js'
import { updateWordDefinition } from '../lib/db.js'

const levelColors = { A1:'#2d7a4f',A2:'#4a9e6a',B1:'#b8860b',B2:'#c0721b',C1:'#b03a2e',C2:'#922b21' }

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// ── Text node annotator ───────────────────────────────────────
// Walks only Text nodes so the regex never corrupts HTML attributes.
// Each match gets a span with class "vocab-word" and a data-dict attribute
// pointing back to the dictionary-form word for definition lookup.
function annotateTextNodes(root, pattern, dictFormByMatch) {
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
        // Store both the surface form and the dictionary form
        span.dataset.word = part
        span.dataset.dict = dictFormByMatch[part.toLowerCase()] || part
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

// ── Build highlight map from word_map ─────────────────────────
// word_map entries are either:
//   { surface: "word" }                      — simple match
//   { stem: "verb stem", prefix: "prefix" }  — split separable verb
//
// Returns:
//   surfaceForms: string[]  — exact strings to highlight in the text
//   dictFormByMatch: { lowerCaseMatch → dictionaryForm }
function buildHighlightData(wordMap) {
  const surfaceForms = []
  const dictFormByMatch = {}

  for (const [dictForm, entry] of Object.entries(wordMap)) {
    if (entry.surface) {
      surfaceForms.push(entry.surface)
      dictFormByMatch[entry.surface.toLowerCase()] = dictForm
    } else if (entry.stem && entry.prefix) {
      // Both stem and prefix get highlighted individually,
      // but both map back to the same dictionary form.
      surfaceForms.push(entry.stem, entry.prefix)
      dictFormByMatch[entry.stem.toLowerCase()]   = dictForm
      dictFormByMatch[entry.prefix.toLowerCase()] = dictForm
    }
  }

  return { surfaceForms, dictFormByMatch }
}

// ── Fallback: plain verbatim match for old texts without word_map ──
function buildFallbackHighlightData(wordsUsed, bodyText) {
  const surfaceForms = wordsUsed.filter(w =>
    new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])${escapeRegex(w)}($|[^a-zA-ZäöüÄÖÜß])`, 'i').test(bodyText)
  )
  const dictFormByMatch = {}
  surfaceForms.forEach(w => { dictFormByMatch[w.toLowerCase()] = w })
  return { surfaceForms, dictFormByMatch }
}

// ── renderReadView ────────────────────────────────────────────
export function renderReadView(container) {
  const { texts, currentTextId } = store.get()
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

// ── renderArticle ─────────────────────────────────────────────
export function renderArticle(container, entry) {
  const { words } = store.get()
  const wordsUsed  = entry.words_used || []
  const wordMap    = entry.word_map   || {}
  const paragraphs = entry.body.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const lc   = levelColors[entry.level] || 'var(--accent)'
  const date = new Date(entry.created_at).toLocaleDateString('de-DE')

  // Build the article shell — no user text injected via innerHTML
  container.innerHTML = `
    <div class="article-card">
      <div class="card-actions">
        <button class="btn-small" id="regenBtn">↺ Regenerate</button>
        <button class="btn-small" id="newBtn">+ New</button>
        <button class="btn-small btn-exercise" id="exerciseBtn">✦ Exercises</button>
        <span class="level-badge" style="color:${lc};border-color:${lc}">${entry.level}</span>
      </div>
      <div class="article-title"></div>
      <div class="article-body"></div>
      <div class="article-footer">
        <div class="footer-vocab-row">
          <span class="footer-vocab-label">Vocabulary:</span>
          <span class="footer-vocab-pills" id="footerVocabPills"></span>
        </div>
        <span>${date}</span>
      </div>
    </div>
  `

  container.querySelector('.article-title').textContent = entry.title

  // ── Vocabulary footer — clickable pills ──────────────────────
  const pillsEl = container.querySelector('#footerVocabPills')
  wordsUsed.forEach((w, i) => {
    const pill = document.createElement('button')
    pill.className = 'vocab-pill'
    pill.textContent = w
    pill.dataset.dict = w   // dictionary form for lookup
    pill.addEventListener('click', e => {
      e.stopPropagation()
      handlePillClick(pill, w)
    })
    pillsEl.appendChild(pill)
    if (i < wordsUsed.length - 1) {
      pillsEl.appendChild(document.createTextNode(' · '))
    }
  })

  // ── Body paragraphs ──────────────────────────────────────────
  const bodyEl = container.querySelector('.article-body')
  paragraphs.forEach(text => {
    const p = document.createElement('p')
    p.textContent = text
    bodyEl.appendChild(p)
  })

  // ── Highlight vocab words in body ────────────────────────────
  const hasMap = Object.keys(wordMap).length > 0
  const { surfaceForms, dictFormByMatch } = hasMap
    ? buildHighlightData(wordMap)
    : buildFallbackHighlightData(wordsUsed, entry.body)

  if (surfaceForms.length > 0) {
    // Sort longest first so "aufgestanden" beats "auf"
    const sorted = [...new Set(surfaceForms)].sort((a, b) => b.length - a.length)
    const pattern = new RegExp(
      '(?<![a-zA-ZäöüÄÖÜß])(' + sorted.map(escapeRegex).join('|') + ')(?![a-zA-ZäöüÄÖÜß])',
      'gi'
    )
    annotateTextNodes(bodyEl, pattern, dictFormByMatch)
  }

  container.querySelectorAll('.vocab-word').forEach(el =>
    el.addEventListener('click', handleWordClick))

  // ── Buttons ──────────────────────────────────────────────────
  container.querySelector('#regenBtn').addEventListener('click', () => {
    store.set({ words: words.filter(w => entry.words_input.includes(w.word)) })
    document.dispatchEvent(new CustomEvent('app:generate'))
  })

  container.querySelector('#newBtn').addEventListener('click', () => {
    store.set({ currentTextId: null })
  })

  container.querySelector('#exerciseBtn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app:exercise', { detail: entry.id }))
  })
}

// ── Definition popup ──────────────────────────────────────────
let popup    = null
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
  const t = e.target
  if (!t.classList.contains('vocab-word') && !t.classList.contains('vocab-pill')) {
    hidePopup()
  }
})

function hidePopup() {
  if (popup) popup.style.display = 'none'
  if (activeEl) { activeEl.classList.remove('active'); activeEl = null }
}

// Clicked a highlighted word in the body
async function handleWordClick(e) {
  ensurePopup()
  const el   = e.currentTarget
  const dict = el.dataset.dict || el.dataset.word   // prefer dict form

  if (activeEl && activeEl !== el) activeEl.classList.remove('active')
  el.classList.toggle('active')
  activeEl = el.classList.contains('active') ? el : null
  if (!el.classList.contains('active')) { hidePopup(); return }

  showPopupFor(el, dict)
}

// Clicked a vocab pill in the footer
async function handlePillClick(pill, dictForm) {
  ensurePopup()

  if (activeEl === pill) {
    hidePopup()
    return
  }
  if (activeEl) activeEl.classList.remove('active')
  pill.classList.add('active')
  activeEl = pill

  showPopupFor(pill, dictForm)
}

async function showPopupFor(el, dictForm) {
  popup.querySelector('#defWord').textContent = dictForm
  popup.querySelector('#defMeaning').textContent = 'Looking up…'
  positionPopup(el)
  popup.style.display = 'block'

  try {
    const def = await getOrFetchDef(dictForm)
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

  // Persist to Supabase if this word is in the user's word list
  const wordRow = words.find(w => w.word.toLowerCase() === word.toLowerCase())
  if (wordRow && !wordRow.translation) {
    try { await updateWordDefinition(wordRow.id, def) } catch {}
  }
  return def
}

function positionPopup(el) {
  const r   = el.getBoundingClientRect()
  let top  = r.bottom + 8
  let left = r.left
  if (left + 290 > window.innerWidth)  left = window.innerWidth - 292
  if (top  + 180 > window.innerHeight) top  = r.top - 185
  popup.style.top  = top  + 'px'
  popup.style.left = left + 'px'
}
