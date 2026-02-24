import { store } from '../lib/store.js'
import { addWords, clearAllWords, deleteWord, deleteAllTexts } from '../lib/db.js'
import { aiExtractWords } from '../lib/ai.js'

export function renderSidebar(container) {
  const s = store.get()
  const words = s.words
  const { inputMode } = s

  container.innerHTML = `
    <div class="sidebar-section-title">
      Add Words
      <span class="word-count-badge">${words.length}</span>
    </div>

    <div class="input-mode-tabs">
      <button class="imt ${inputMode === 'bulk' ? 'active' : ''}" data-mode="bulk">Word List</button>
      <button class="imt ${inputMode === 'text' ? 'active' : ''}" data-mode="text">From Text</button>
    </div>

    <div id="panelBulk" style="display:${inputMode === 'bulk' ? '' : 'none'}">
      <textarea class="bulk-textarea" id="bulkInput"
        placeholder="Paste words separated by commas, spaces, or new lines&#10;&#10;e.g. Haus, Baum, laufen, schön"></textarea>
    </div>
    <div id="panelText" style="display:${inputMode === 'text' ? '' : 'none'}">
      <textarea class="bulk-textarea" id="textInput" style="min-height:110px"
        placeholder="Paste any German text here — words will be extracted automatically…"></textarea>
      <div class="extract-status" id="extractStatus"></div>
    </div>

    <button class="btn-add-bulk" id="addBulkBtn">
      ${inputMode === 'bulk' ? '＋ Add Words' : '⚙ Extract & Add Words'}
    </button>

    <div>
      <div class="sidebar-section-title" style="margin-bottom:8px">
        Selected Words
      </div>
      <div class="word-chips-wrap" id="wordChips">
        ${words.map(w => `
          <div class="word-chip" data-id="${w.id}">
            <span>${w.word}</span>
            <button class="remove" data-id="${w.id}" title="Remove">×</button>
          </div>`).join('')}
      </div>
      <div class="chip-row">
        <button class="chip-action-btn" id="clearWordsBtn">Clear all</button>
        <button class="chip-action-btn" id="viewVocabBtn">View cards →</button>
      </div>
    </div>

    <button class="btn-generate" id="generateBtn" ${words.length === 0 ? 'disabled' : ''}>
      ✦ Generate Reading Text
    </button>

    <div>
      <div class="sidebar-section-title" style="margin-bottom:8px">
        Saved Texts
        <button class="chip-action-btn" id="clearTextsBtn" style="font-size:.6rem;padding:2px 7px" title="Delete all saved texts">Clear all</button>
      </div>
      <div class="saved-list" id="savedList">
        ${renderSavedList(s)}
      </div>
    </div>
  `

  bindSidebarEvents(container)
}

function renderSavedList(s) {
  const { texts, currentTextId } = s
  const levelColors = { A1:'#2d7a4f',A2:'#4a9e6a',B1:'#b8860b',B2:'#c0721b',C1:'#b03a2e',C2:'#922b21' }

  if (texts.length === 0) return '<p class="empty-saved">No saved texts yet.</p>'

  return texts.map(t => {
    const lc = levelColors[t.level] || 'var(--accent)'
    const date = new Date(t.created_at).toLocaleDateString('de-DE')
    return `
      <div class="saved-item ${t.id === currentTextId ? 'active' : ''}" data-text-id="${t.id}">
        <button class="saved-delete" data-delete-id="${t.id}" title="Delete">✕</button>
        <div class="saved-title">${t.title}</div>
        <div class="saved-meta">
          <span style="font-weight:700;color:${lc}">${t.level}</span>
          <span>${date}</span>
        </div>
      </div>`
  }).join('')
}

function bindSidebarEvents(container) {
  // Input mode toggle
  container.querySelectorAll('.imt').forEach(btn => {
    btn.addEventListener('click', () => {
      store.set({ inputMode: btn.dataset.mode })
    })
  })

  // Remove single word chip
  container.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const id = btn.dataset.id
      try {
        await deleteWord(id)
        store.set(s => ({ words: s.words.filter(w => w.id !== id) }))
      } catch (err) { console.error(err) }
    })
  })

  // Clear all saved texts
  container.querySelector('#clearTextsBtn')?.addEventListener('click', async () => {
    const { texts, user } = store.get()
    if (!texts.length) return
    if (!confirm(`Delete all ${texts.length} saved text${texts.length !== 1 ? 's' : ''}?`)) return
    try {
      await deleteAllTexts(user.id)
      store.set({ texts: [], currentTextId: null })
    } catch (err) { console.error(err) }
  })

  // Clear all words
  container.querySelector('#clearWordsBtn')?.addEventListener('click', async () => {
    const { words, user } = store.get()
    if (!words.length) return
    if (!confirm(`Remove all ${words.length} words?`)) return
    try {
      await clearAllWords(user.id)
      store.set({ words: [] })
    } catch (err) { console.error(err) }
  })

  // Switch to vocab view
  container.querySelector('#viewVocabBtn')?.addEventListener('click', () => {
    store.set({ currentView: 'vocab' })
  })

  // Add words button
  container.querySelector('#addBulkBtn')?.addEventListener('click', async () => {
    const { inputMode, user, aiConfig } = store.get()
    const btn = container.querySelector('#addBulkBtn')

    if (inputMode === 'bulk') {
      const raw = container.querySelector('#bulkInput')?.value.trim()
      if (!raw) return
      const split = raw.split(/[\s,;\n\t]+/).filter(Boolean)
        .map(w => w.replace(/["""''„\[\](){}*.,;:!?…\/\\]/g, '').trim())
        .filter(w => w.length >= 2)
      const unique = [...new Set(split)]
      try {
        const added = await addWords(user.id, unique)
        store.set(s => ({ words: [...s.words, ...added] }))
        container.querySelector('#bulkInput').value = ''
        flashStatus(container, `${added.length} new word${added.length !== 1 ? 's' : ''} added.`)
      } catch (err) { flashStatus(container, `⚠ ${err.message}`, true) }

    } else {
      const raw = container.querySelector('#textInput')?.value.trim()
      if (!raw) return
      btn.disabled = true
      btn.textContent = '⏳ Extracting…'
      setExtractStatus(container, 'Analysing text with AI…', false)
      try {
        const extracted = await aiExtractWords(raw, aiConfig)
        const added = await addWords(user.id, extracted)
        store.set(s => ({ words: [...s.words, ...added] }))
        container.querySelector('#textInput').value = ''
        setExtractStatus(container,
          `✓ Found ${extracted.length} words — ${added.length} new, ${extracted.length - added.length} already in list.`,
          false)
      } catch (err) {
        setExtractStatus(container, `⚠ ${err.message}`, true)
      } finally {
        btn.disabled = false
        btn.textContent = '⚙ Extract & Add Words'
      }
    }
  })

  // Generate text — dispatch custom event for main app to handle
  container.querySelector('#generateBtn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app:generate'))
  })

  // Saved text clicks
  container.querySelector('#savedList')?.addEventListener('click', e => {
    const delBtn = e.target.closest('[data-delete-id]')
    const item   = e.target.closest('[data-text-id]')

    if (delBtn) {
      document.dispatchEvent(new CustomEvent('app:deleteText', { detail: delBtn.dataset.deleteId }))
      return
    }
    if (item) {
      document.dispatchEvent(new CustomEvent('app:showText', { detail: item.dataset.textId }))
    }
  })
}

function flashStatus(container, msg, isErr = false) {
  const el = container.querySelector('#extractStatus')
  if (!el) return
  el.textContent = msg
  el.style.color = isErr ? 'var(--accent)' : 'var(--green)'
  if (!isErr) setTimeout(() => { if (el) el.textContent = '' }, 3000)
}

function setExtractStatus(container, msg, isErr) {
  const el = container.querySelector('#extractStatus')
  if (!el) return
  el.textContent = msg
  el.style.color = isErr ? 'var(--accent)' : 'var(--muted)'
}
