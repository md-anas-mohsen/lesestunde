// ── OpenAI-compatible API client ──────────────────────────────
// Works with Gemini, OpenAI, OpenRouter, and any local server
// (Ollama, LM Studio, llama.cpp, vLLM) that speaks the
// /v1/chat/completions spec.

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    placeholder: 'AIza…',
    keyHint: 'Get key at aistudio.google.com',
    keyRequired: true,
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    placeholder: 'sk-…',
    keyHint: 'Get key at platform.openai.com',
    keyRequired: true,
  },
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-001',
    placeholder: 'sk-or-…',
    keyHint: 'Get key at openrouter.ai',
    keyRequired: true,
  },
  mistral: {
    label: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    placeholder: 'your-mistral-key…',
    keyHint: 'Get key at console.mistral.ai',
    keyRequired: true,
  },
  local: {
    label: 'Local Model',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    placeholder: 'ollama  (or leave blank)',
    keyHint: 'Works with Ollama, LM Studio, llama.cpp, vLLM — key is optional.',
    keyRequired: false,
    localPresets: [
      { label: 'Ollama',    url: 'http://localhost:11434/v1', model: 'llama3' },
      { label: 'LM Studio', url: 'http://localhost:1234/v1',  model: 'local-model' },
      { label: 'llama.cpp', url: 'http://localhost:8080/v1',  model: 'gpt-4' },
      { label: 'vLLM',      url: 'http://localhost:8000/v1',  model: 'default' },
    ],
  },
}

/**
 * Call /v1/chat/completions on the configured provider.
 * @param {string} prompt
 * @param {{ provider: string, baseURL: string, model: string, apiKey?: string }} config
 * @param {number} maxTokens
 */
export async function apiCall(prompt, config, maxTokens = 800) {
  const { provider, baseURL, model, apiKey } = config
  const prov = PROVIDERS[provider]

  if (prov?.keyRequired && !apiKey) {
    throw new Error('No API key set. Open ⚙ Settings to add yours.')
  }

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.choices[0].message.content
}

export function parseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim()

  // Happy path
  try { return JSON.parse(cleaned) } catch (_) {}

  // Recovery: model hit max_tokens and truncated the JSON mid-stream.
  // Extract whatever fully-formed fields we can find via regex.
  const start = cleaned.indexOf('{')
  if (start === -1) {
    // Might be a plain array (aiExtractWords response)
    const arrayMatch = cleaned.match(/\[([\s\S]*?)(?:\]|$)/)
    if (arrayMatch) {
      const items = [...arrayMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      if (items.length > 0) return items.map(m => m[1])
    }
    throw new Error('No JSON found in model response.')
  }

  const partial = cleaned.slice(start)
  const recover = {}

  const titleMatch = partial.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (titleMatch) recover.title = titleMatch[1]

  const bodyMatch = partial.match(/"body"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (bodyMatch) recover.body = bodyMatch[1].replace(/\\n/g, '\n')

  const wordsUsedSection = partial.match(/"wordsUsed"\s*:\s*\[([\s\S]*?)(?:\]|$)/)
  if (wordsUsedSection) {
    const items = [...wordsUsedSection[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    recover.wordsUsed = items.map(m => m[1])
  }

  if (recover.title && recover.body) return recover

  throw new Error(
    'Model response was truncated and could not be recovered. ' +
    'Try fewer words, or use a model with a larger output context.'
  )
}

// ── Domain-level AI functions ─────────────────────────────────

export async function aiExtractWords(text, config) {
  const raw = await apiCall(
    `Extract all unique German words (nouns, verbs, adjectives, adverbs) from this text.
Return base/dictionary forms (infinitive for verbs, nominative singular for nouns).
No duplicates, no articles, no pronouns, no conjunctions.
Respond ONLY with a JSON array of strings — no other text.
Text: """${text.slice(0, 3000)}"""`,
    config,
    900,
  )
  return parseJSON(raw)
}

const LEVEL_DESC = {
  A1: 'absolute beginner A1: very short simple sentences, basic present tense, everyday vocabulary only',
  A2: 'elementary A2: simple connected sentences, basic past tense (Perfekt), familiar everyday topics',
  B1: 'intermediate B1: clear connected text, varied tenses, slightly complex sentence structures',
  B2: 'upper-intermediate B2: complex text, nuanced vocabulary, idiomatic expressions',
  C1: 'advanced C1: fluent sophisticated text, rich vocabulary, varied structures, cultural references',
  C2: 'proficient C2: literary quality, highly idiomatic, stylistically elegant prose',
}

// Pools for randomising passage variety
const FORMATS = [
  'a short news report',
  'a diary entry written by a fictional character (NOT named Anna or Max)',
  'a letter or email between two people',
  'a conversation or dialogue',
  'a short story with an unexpected twist',
  'a travel blog excerpt',
  'a magazine article',
  'a recipe with a short story behind it',
  'a social media post with a short narrative',
  'a short historical anecdote',
  'a radio broadcast transcript',
  'an advertisement with a narrative',
  'a fairy tale opening',
  'a scientific explanation with a narrative framing',
  'an interview excerpt',
]

const SETTINGS = [
  'a train station in Germany',
  'a small town in Bavaria',
  'a bustling Hamburg harbour',
  'a Berlin street market',
  'a mountain hut in the Alps',
  'a university campus',
  'a bakery in Vienna',
  'a forest in autumn',
  'a hospital waiting room',
  'a holiday in a foreign country',
  'a rainy Sunday afternoon at home',
  'a summer festival',
  'a late-night supermarket',
  'a historic castle',
  'a modern office',
  'a school classroom',
  'a riverside café',
  'a crowded subway',
  'a veterinary clinic',
  'a sports stadium',
]

const PERSPECTIVES = [
  'third person (er/sie/es)',
  'first person plural (wir)',
  'second person (du or Sie)',
  'third person plural (sie)',
  // first person singular only sometimes so it isn't always "Ich..."
  'first person singular (ich)',
  'first person singular (ich)',
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Exported so UI can populate dropdowns
export { FORMATS, SETTINGS, PERSPECTIVES }

export async function aiGenerateText(words, level, config, { emphasizedWords = [], options = {} } = {}) {
  const MAX_WORDS = 30

  // Emphasized words always go first, then fill remaining slots from the rest
  const emphasized = words.filter(w => emphasizedWords.includes(w))
  const rest = words.filter(w => !emphasizedWords.includes(w))
  const wordList = [
    ...emphasized,
    ...rest,
  ].slice(0, MAX_WORDS)

  const format      = options.format      || pick(FORMATS)
  const setting     = options.setting     || pick(SETTINGS)
  const perspective = options.perspective || pick(PERSPECTIVES)

  const emphasizedSection = emphasized.length > 0
    ? `PRIORITY WORDS — these must appear in the text: ${emphasized.join(', ')}`
    : ''

  const raw = await apiCall(
    `You are a German language teacher writing a reading passage for a learner.
Write a passage at ${LEVEL_DESC[level]} level using as many of these words as naturally fit:
${wordList.join(', ')}
${emphasizedSection}

FORMAT: ${format}
SETTING: ${setting}
NARRATIVE PERSPECTIVE: ${perspective}

Do NOT write a generic "day in the life of Anna/Max" story. The format, setting, and perspective above
are mandatory — the passage must clearly reflect all three. Be creative and specific.

CRITICAL GERMAN GRAMMAR RULES — you must follow these exactly:

1. SEPARABLE VERBS (trennbare Verben): When a separable verb is used in a main clause,
   the prefix is ALWAYS split off and placed at the END of the clause.
   The stem is conjugated normally near the subject.
   CORRECT:   "Ich rufe meine Mutter an."   (anrufen)
   CORRECT:   "Er macht das Licht an."       (anmachen)
   CORRECT:   "Wir fangen um 8 Uhr an."     (anfangen)
   CORRECT:   "Ich hole das Paket ab."       (abholen)
   WRONG:     "Ich anrufe meine Mutter."
   WRONG:     "Ich anmache das Licht."
   This rule applies to ALL separable verbs, including: anrufen, anmachen, anfangen,
   abholen, abgeben, ankommen, anbieten, ankreuzen, anklicken, anmelden, aufstehen,
   aussteigen, einsteigen, mitkommen, zurückkommen, and any other verb with a
   separable prefix (an-, ab-, auf-, aus-, ein-, mit-, zurück-, vor-, nach-, etc.).

2. VERB CONJUGATION: Always conjugate verbs to match the subject.
   Do NOT use infinitive forms in finite clauses.
   CORRECT: "Ich komme an." / "Er kommt an." / "Wir kommen an."
   WRONG:   "Ich ankommen." / "Ich anrufen."

3. MODAL VERBS: With modals, the infinitive stays whole at the end.
   CORRECT: "Ich muss um 8 Uhr aufstehen." (NOT "Ich muss aufstehen auf.")

Passage requirements:
- 2-3 paragraphs, 150-200 words total
- Written entirely in German
- Coherent and engaging — not a list of sentences
- Give it a specific, evocative German title that reflects the format and setting

Respond ONLY with this JSON object, no markdown fences, no extra text:
{"title":"...","body":"paragraph one\\n\\nparagraph two","wordsUsed":["only","words","actually","in","the","text"]}

IMPORTANT: Keep "wordsUsed" short — list ONLY input words that genuinely appear in the body.`,
    config,
    2000,
  )
  return parseJSON(raw)
}


/**
 * Given a list of dictionary-form German words and a passage body,
 * ask the AI to find how each word actually surfaces in the text —
 * including conjugated, inflected, and split separable verb forms.
 *
 * Returns a map: { dictionaryForm: "exact surface string in text" }
 * Words not found in the text are omitted.
 *
 * Examples:
 *   anrufen  → "rufe … an"   (split separable — we store stem+prefix separately)
 *   aufstehen → "stehe auf"
 *   Haus     → "Haus" or "Häuser" (plural)
 *   gehen    → "geht" or "ging"
 */
export async function aiMapWordsToText(words, body, config) {
  const raw = await apiCall(
    `You are a German linguistics expert. Given this German text and a list of dictionary-form words,
find exactly how each word appears in the text (conjugated verbs, inflected nouns, split separable verbs, etc.).

For SEPARABLE VERBS in main clauses: the prefix is separated to the end of the clause.
Return the conjugated STEM as "stem" and the detached PREFIX as "prefix" — both as they appear in the text.
Example: anrufen used as "Ich rufe meine Mutter an." → stem: "rufe", prefix: "an"
Example: aufstehen used as "Er steht früh auf." → stem: "steht", prefix: "auf"
Example: abgeben used as "Sie gibt das Paket ab." → stem: "gibt", prefix: "ab"

For NON-SEPARABLE words (nouns, adjectives, regular verbs, inseparable verbs): return just "surface".
Example: Haus used as "das Haus" or "die Häuser" → surface: "Haus" (or the form that appears)
Example: gehen used as "geht" → surface: "geht"

German text:
"""
${body}
"""

Dictionary-form words to find: ${words.join(', ')}

Respond ONLY with a JSON object, no markdown. Each key is a dictionary-form word.
Value is either:
  { "surface": "word as it appears" }        ← for regular words
  { "stem": "verb stem", "prefix": "prefix" } ← for split separable verbs

Only include words that actually appear in the text. Omit words not used.

Example output:
{"anrufen":{"stem":"rufe","prefix":"an"},"Haus":{"surface":"Haus"},"gehen":{"surface":"geht"}}`,
    config,
    600,
  )
  try {
    return parseJSON(raw)
  } catch {
    return {}  // graceful degradation — highlighting just won't work for this text
  }
}

export async function aiGetDefinition(word, config) {
  const raw = await apiCall(
    `German word: "${word}"
JSON only (no markdown): {"translation":"short English meaning","pos":"noun/verb/adj/adv/etc","example_de":"short German sentence","example_en":"English translation of sentence"}`,
    config,
    350,
  )
  return parseJSON(raw)
}

export async function aiTestConnection(config) {
  const prov = PROVIDERS[config.provider]
  const isLocal = config.provider === 'local'
  if (prov?.keyRequired && !config.apiKey) {
    throw new Error('No API key provided.')
  }
  try {
    const reply = await apiCall('Reply with just the word: ok', config, 12)
    return reply.trim()
  } catch (e) {
    let msg = e.message
    if (isLocal && (msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
      msg += ' — Is your local server running? Check CORS settings.'
    }
    throw new Error(msg)
  }
}

// ── Exercise generation ───────────────────────────────────────

/**
 * Generate a set of exercises for a German reading passage.
 * Returns an array of question objects.
 */
export async function aiGenerateExercises(title, body, level, wordsUsed, config) {
  const raw = await apiCall(
    `You are a German language teacher. Create exercises for this ${level}-level German reading passage.

Title: ${title}
Text:
"""
${body}
"""
Vocabulary used: ${wordsUsed.join(', ')}

Generate exactly 6 exercises — a mix of these types:
- "mc": multiple-choice comprehension question about the text (4 options, one correct)
- "fill": fill-in-the-blank using one of the vocabulary words (give the sentence with ___ for the blank)
- "translate": translate a short sentence from the passage into English

Rules:
- All prompts and options must be appropriate for ${level} level
- For "mc": options must be plausible but only one correct
- For "fill": the blank must be filled by one of the vocabulary words (give "answer" in base/dictionary form)
- For "translate": choose a sentence that uses key vocabulary

Respond ONLY with this JSON array, no markdown:
[
  {"id":"q1","type":"mc","prompt":"question?","options":["A","B","C","D"],"answer":"A"},
  {"id":"q2","type":"fill","prompt":"Er ___ das Licht an.","answer":"anmachen","hint":"separable verb"},
  {"id":"q3","type":"translate","prompt":"Das Haus ist sehr groß.","answer":"The house is very big."}
]`,
    config,
    1200,
  )
  return parseJSON(raw)
}

/**
 * Grade a completed exercise set. Returns grading object and overall score.
 */
export async function aiGradeExercises(questions, answers, body, config) {
  const pairs = questions.map(q => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    correctAnswer: q.answer,
    userAnswer: answers[q.id] || '',
    options: q.options || null,
  }))

  const raw = await apiCall(
    `You are a German language teacher grading student exercises.

Reading passage for context:
"""
${body.slice(0, 800)}
"""

Grade each answer. For "mc" and "fill" types, marking is strict (correct/incorrect).
For "translate" type, be generous — accept answers that convey the correct meaning even if not word-for-word.

Questions and answers:
${JSON.stringify(pairs, null, 2)}

Respond ONLY with this JSON object, no markdown:
{
  "grading": {
    "q1": {"correct": true, "score": 1, "feedback": "short encouraging feedback"},
    "q2": {"correct": false, "score": 0, "feedback": "hint about correct answer"}
  },
  "totalScore": 85,
  "overallFeedback": "One or two sentences of overall encouraging feedback in English."
}

- score per question: 1 = fully correct, 0.5 = partially correct (translations only), 0 = incorrect
- totalScore: 0-100, percentage of points earned`,
    config,
    800,
  )
  return parseJSON(raw)
}
