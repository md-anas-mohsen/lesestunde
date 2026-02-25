// ── Reactive app state ────────────────────────────────────────
// A minimal observable store — no framework needed.

function createStore(initial) {
  let state = { ...initial }
  const listeners = new Set()

  return {
    get: () => state,
    set(partial) {
      state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) }
      listeners.forEach(fn => fn(state))
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export const store = createStore({
  // Auth
  user: null,
  authLoading: true,

  // AI config (loaded from Supabase api_settings on login)
  aiConfig: {
    provider: 'gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    apiKey: '',
  },

  // Vocabulary
  words: [],           // [{ id, word, translation, pos, example_de, example_en }]
  wordsLoading: false,

  // Generated texts
  texts: [],           // [{ id, title, body, level, words_input, words_used, created_at }]
  textsLoading: false,

  // UI
  currentView: 'read', // 'read' | 'vocab'
  currentLevel: 'A1',
  currentTextId: null,
  inputMode: 'bulk',   // 'bulk' | 'text'
  settingsOpen: false,
  defCache: {},        // word -> definition (in-memory, also stored in words table)

  // Exercises
  exercises: {},       // { textId: exerciseRow }
  results: [],         // exercise_results rows, newest first

  // Generation controls
  emphasizedWords: new Set(),  // Set of word IDs to prioritise in generation
  generationOptions: {
    format: '',       // '' = random
    setting: '',      // '' = random
    perspective: '',  // '' = random
  },
})
