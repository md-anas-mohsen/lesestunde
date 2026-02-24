import { store } from '../lib/store.js'
import { deleteWord, updateWordDefinition } from '../lib/db.js'
import { aiGetDefinition } from '../lib/ai.js'

export function renderVocabView(container) {
  const { words } = store.get()

  container.innerHTML = `
    <div class="vocab-header">
      <h2>Your Vocabulary
        <span class="vocab-count">(${words.length} words)</span>
      </h2>
      <input type="text" class="vocab-search" id="vocabSearch" placeholder="Filter words…">
    </div>
    <div class="vocab-grid" id="vocabGrid">
      ${renderGrid(words)}
    </div>
  `

  const grid = container.querySelector('#vocabGrid')

  container.querySelector('#vocabSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = q ? words.filter(w => w.word.toLowerCase().includes(q)) : words
    grid.innerHTML = renderGrid(filtered, words.length)
  })

  bindVocabGridEvents(grid)
}

function renderGrid(filtered, total = filtered.length) {
  if (total === 0) return `<div class="vocab-empty">No words yet — add some from the sidebar.</div>`
  if (filtered.length === 0) return `<div class="vocab-empty">No words match your filter.</div>`

  return filtered.map(w => `
    <div class="vocab-card" data-word-id="${w.id}" data-word="${w.word}">
      <button class="vc-delete" data-delete-id="${w.id}" title="Remove">✕</button>
      <div class="vc-word">${w.word}</div>
      <div class="vc-pos">${w.pos || ''}</div>
      <div class="vc-translation">${
        w.translation
          ? w.translation
          : '<span class="vc-loading">Tap to look up…</span>'
      }</div>
    </div>`).join('')
}

function bindVocabGridEvents(grid) {
  grid.addEventListener('click', async e => {
    const delBtn = e.target.closest('[data-delete-id]')
    const card   = e.target.closest('.vocab-card')

    if (delBtn) {
      const id = delBtn.dataset.deleteId
      try {
        await deleteWord(id)
        store.set(s => ({ words: s.words.filter(w => w.id !== id) }))
        card?.remove()
      } catch (err) { console.error(err) }
      return
    }

    if (card) {
      const { aiConfig, words, defCache } = store.get()
      const wordId = card.dataset.wordId
      const wordStr = card.dataset.word
      const wordRow = words.find(w => w.id === wordId)

      if (wordRow?.translation) return  // already have it

      const tranEl = card.querySelector('.vc-translation')
      const posEl  = card.querySelector('.vc-pos')
      tranEl.innerHTML = '<span class="vc-loading">Looking up…</span>'

      try {
        let def = defCache[wordStr]
        if (!def) {
          def = await aiGetDefinition(wordStr, aiConfig)
          store.set(s => ({ defCache: { ...s.defCache, [wordStr]: def } }))
        }
        tranEl.textContent = def.translation
        posEl.textContent  = def.pos
        // Persist to DB and update store
        await updateWordDefinition(wordId, def)
        store.set(s => ({
          words: s.words.map(w => w.id === wordId ? { ...w, ...def } : w)
        }))
      } catch {
        tranEl.textContent = '–'
      }
    }
  })
}
