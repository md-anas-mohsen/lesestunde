import { store } from './lib/store.js'
import { PROVIDERS } from './lib/ai.js'
import { aiGenerateText, aiMapWordsToText } from './lib/ai.js'
import {
  onAuthChange, getCurrentUser,
  loadApiSettings, loadWords, loadTexts,
  saveText, deleteText as dbDeleteText, loadResults,
} from './lib/db.js'
import { renderAuthScreen } from './components/AuthScreen.js'
import { renderSettingsModal } from './components/SettingsModal.js'
import { renderSidebar } from './components/Sidebar.js'
import { renderReadView, renderArticle } from './components/ReadView.js'
import { renderVocabView } from './components/VocabView.js'
import { renderExerciseView } from './components/ExerciseView.js'
import { renderProgressView } from './components/ProgressView.js'

// ── Root DOM nodes ─────────────────────────────────────────────
const root        = document.getElementById('app')
const modalMount  = document.getElementById('modal-mount')

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  // Listen for auth changes (handles initial session restore + OAuth redirect)
  const unsub = onAuthChange(async user => {
    if (user) {
      store.set({ user, authLoading: false })
      await loadUserData(user)
      render()
    } else {
      store.set({ user: null, authLoading: false, words: [], texts: [] })
      render()
    }
  })

  render()
}

async function loadUserData(user) {
  try {
    // Load API settings
    const apiRow = await loadApiSettings(user.id)
    if (apiRow) {
      store.set({
        aiConfig: {
          provider: apiRow.provider,
          baseURL:  apiRow.base_url,
          model:    apiRow.model,
          apiKey:   apiRow.api_key || '',
        }
      })
    }

    // Load words
    store.set({ wordsLoading: true })
    const words = await loadWords(user.id)
    store.set({ words, wordsLoading: false })

    // Load texts
    store.set({ textsLoading: true })
    const texts = await loadTexts(user.id)
    const currentTextId = texts.length > 0 ? texts[0].id : null
    store.set({ texts, textsLoading: false, currentTextId })

    // Load results (for progress view)
    const results = await loadResults(user.id)
    store.set({ results })
  } catch (e) {
    console.error('Failed to load user data:', e)
    store.set({ wordsLoading: false, textsLoading: false })
  }
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const { user, authLoading } = store.get()

  if (authLoading) {
    root.innerHTML = `<div class="auth-loading"><div class="spinner"></div></div>`
    return
  }

  if (!user) {
    renderAuthScreen(root)
    return
  }

  renderApp()
}

function renderApp() {
  const { currentView, currentLevel, aiConfig, user } = store.get()
  const levelColors = { A1:'#2d7a4f',A2:'#4a9e6a',B1:'#b8860b',B2:'#c0721b',C1:'#b03a2e',C2:'#922b21' }

  root.innerHTML = `
    <div class="app">
      <header>
        <h1 class="site-title">Lese<em>stunde</em></h1>
        <span class="tagline">German Reading Studio</span>

        <div class="level-bar">
          <span class="level-bar-label">Level:</span>
          <div class="level-pills">
            ${['A1','A2','B1','B2','C1','C2'].map(l => `
              <button class="level-pill ${l === currentLevel ? 'active' : ''}" data-level="${l}"
                style="${l === currentLevel ? `background:${levelColors[l]};border-color:${levelColors[l]};color:white` : `color:${levelColors[l]};border-color:${levelColors[l]}`}"
              >${l}</button>`).join('')}
          </div>
        </div>

        <div class="header-right">
          <div class="nav-tabs">
            <button class="nav-tab ${currentView === 'read' ? 'active' : ''}" data-view="read">📖 Read</button>
            <button class="nav-tab ${currentView === 'vocab' ? 'active' : ''}" data-view="vocab">🗂 Vocab</button>
            <button class="nav-tab ${currentView === 'progress' ? 'active' : ''}" data-view="progress">📊 Progress</button>
          </div>
          <button class="settings-btn ${aiConfig.apiKey || aiConfig.provider === 'local' ? 'has-key' : ''}" id="openSettings">
            ⚙ ${aiConfig.provider === 'local' ? 'Local ✓' : aiConfig.apiKey ? 'API Key ✓' : 'API Key'}
          </button>
          <div class="user-menu">
            <img class="avatar" src="${user.user_metadata?.avatar_url || ''}" alt="" onerror="this.style.display='none'">
            <button class="btn-signout" id="signOutBtn" title="Sign out">↩ Sign out</button>
          </div>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar" id="sidebar"></aside>
        <main class="main" id="mainContent"></main>
      </div>
    </div>
  `

  // Render sub-components
  renderSidebar(document.getElementById('sidebar'))
  renderMainContent()
  bindHeaderEvents()
}

function renderMainContent() {
  const { currentView, currentTextId, texts } = store.get()
  const main = document.getElementById('mainContent')
  if (!main) return
  if (currentView === 'read') renderReadView(main)
  else if (currentView === 'vocab') renderVocabView(main)
  else if (currentView === 'exercise') {
    const entry = texts.find(t => t.id === currentTextId)
    if (entry) renderExerciseView(main, entry)
    else renderReadView(main)
  }
  else if (currentView === 'progress') renderProgressView(main)
}

function bindHeaderEvents() {
  // Level pills
  document.querySelectorAll('.level-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      store.set({ currentLevel: pill.dataset.level })
    })
  })

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      store.set({ currentView: tab.dataset.view })
    })
  })

  // Settings
  document.getElementById('openSettings')?.addEventListener('click', () => {
    store.set({ settingsOpen: true })
  })

  // Sign out
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    const { signOut } = await import('./lib/db.js')
    await signOut()
  })
}

// ── App-level events ──────────────────────────────────────────
document.addEventListener('app:generate', async () => {
  const { words, currentLevel, aiConfig, user } = store.get()
  if (!words.length) return

  const main = document.getElementById('mainContent')
  if (!main) return

  // Ensure we're on read view
  store.set({ currentView: 'read', currentTextId: null })

  main.innerHTML = `
    <div class="loading-text">
      <div class="spinner"></div>
      <span>Generating ${currentLevel} passage…</span>
    </div>`

  try {
    const { emphasizedWords, generationOptions } = store.get()
    const wordStrings = words.map(w => w.word)
    const emphasizedStrings = words
      .filter(w => emphasizedWords.has(w.id))
      .map(w => w.word)
    const result = await aiGenerateText(wordStrings, currentLevel, aiConfig, {
      emphasizedWords: emphasizedStrings,
      options: generationOptions,
    })
    const wordsUsed = result.wordsUsed || wordStrings

    // Update loader to show second step
    const loaderEl = main.querySelector('.loading-text span')
    if (loaderEl) loaderEl.textContent = 'Mapping vocabulary…'

    // Second AI call: map each dictionary-form word to how it surfaces
    // in the text (handles separable verbs, inflections, etc.)
    const wordMap = await aiMapWordsToText(wordsUsed, result.body, aiConfig)

    const saved = await saveText(user.id, {
      title:       result.title,
      body:        result.body,
      level:       currentLevel,
      words_input: wordStrings,
      words_used:  wordsUsed,
      word_map:    wordMap,
    })

    store.set(s => ({
      texts:         [saved, ...s.texts],
      currentTextId: saved.id,
    }))

    renderArticle(main, saved)
    re_renderSidebar()
  } catch (e) {
    main.innerHTML = `<div class="loading-text" style="color:var(--accent)">⚠ ${e.message}</div>`
  }
})

document.addEventListener('app:exercise', e => {
  const textId = e.detail
  const { texts } = store.get()
  const entry = texts.find(t => t.id === textId)
  if (!entry) return
  store.set({ currentTextId: textId, currentView: 'exercise' })
})

document.addEventListener('app:showText', e => {
  const textId = e.detail
  const { texts } = store.get()
  const entry = texts.find(t => t.id === textId)
  if (!entry) return
  store.set({ currentTextId: textId, currentView: 'read' })
})

document.addEventListener('app:deleteText', async e => {
  const textId = e.detail
  const { currentTextId } = store.get()
  try {
    await dbDeleteText(textId)
    store.set(s => {
      const texts = s.texts.filter(t => t.id !== textId)
      return {
        texts,
        currentTextId: s.currentTextId === textId
          ? (texts[0]?.id || null)
          : s.currentTextId,
      }
    })
  } catch (e) { console.error(e) }
})

// ── Store subscription → re-render ───────────────────────────
let prevState = store.get()

store.subscribe(state => {
  const prev = prevState
  prevState = state

  // Auth change → full re-render
  if (state.user !== prev.user || state.authLoading !== prev.authLoading) {
    render(); return
  }

  // Not logged in — nothing else to do
  if (!state.user) return

  // Settings modal open/close
  if (state.settingsOpen !== prev.settingsOpen) {
    if (state.settingsOpen) renderSettingsModal(modalMount)
    else modalMount.innerHTML = ''
  }

  // Header-level changes (level, view, aiConfig)
  if (state.currentLevel !== prev.currentLevel
    || state.currentView  !== prev.currentView
    || state.aiConfig     !== prev.aiConfig) {
    renderApp(); return
  }

  // Results changed (exercise completed) → re-render progress if visible
  if (state.results !== prev.results) {
    const main = document.getElementById('mainContent')
    if (main && state.currentView === 'progress') renderProgressView(main)
  }

  // Words or texts changed → re-render sidebar and possibly main
  const wordsChanged = state.words !== prev.words
  const textsChanged = state.texts !== prev.texts
  const textIdChanged = state.currentTextId !== prev.currentTextId

  const sidebar = document.getElementById('sidebar')
  if (sidebar && (wordsChanged || textsChanged || textIdChanged)) {
    renderSidebar(sidebar)
  }

  const main = document.getElementById('mainContent')
  if (main && (textIdChanged || state.currentView !== prev.currentView)) {
    renderMainContent()
  }

  // inputMode toggle → re-render sidebar
  if (state.inputMode !== prev.inputMode && sidebar) {
    renderSidebar(sidebar)
  }
})

function re_renderSidebar() {
  const sidebar = document.getElementById('sidebar')
  if (sidebar) renderSidebar(sidebar)
}

// ── Start ─────────────────────────────────────────────────────
boot()
