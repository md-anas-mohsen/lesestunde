import { store } from '../lib/store.js'
import { aiGenerateExercises, aiGradeExercises } from '../lib/ai.js'
import { loadExercise, saveExercise, saveExerciseResult } from '../lib/db.js'

export async function renderExerciseView(container, entry) {
  const { user, aiConfig, exercises } = store.get()

  container.innerHTML = `
    <div class="exercise-card">
      <div class="exercise-header">
        <div class="exercise-title-row">
          <button class="btn-small" id="backToRead">← Back</button>
          <h2 class="exercise-heading">Übungen</h2>
          <span class="exercise-text-title">${entry.title}</span>
        </div>
      </div>
      <div id="exerciseBody">
        <div class="loading-text">
          <div class="spinner"></div>
          <span>Preparing exercises…</span>
        </div>
      </div>
    </div>
  `

  container.querySelector('#backToRead').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app:showText', { detail: entry.id }))
  })

  const body = container.querySelector('#exerciseBody')

  try {
    // Load cached exercises or generate new ones
    let exercise = exercises[entry.id] || await loadExercise(entry.id, user.id)

    if (!exercise) {
      body.querySelector('span').textContent = 'Generating exercises with AI…'
      const questions = await aiGenerateExercises(
        entry.title, entry.body, entry.level, entry.words_used || [], aiConfig
      )
      exercise = await saveExercise(user.id, entry.id, questions)
      store.set(s => ({ exercises: { ...s.exercises, [entry.id]: exercise } }))
    } else {
      store.set(s => ({ exercises: { ...s.exercises, [entry.id]: exercise } }))
    }

    renderQuestions(body, exercise, entry)
  } catch (e) {
    body.innerHTML = `<div class="exercise-error">⚠ ${e.message}</div>`
  }
}

function renderQuestions(container, exercise, entry) {
  const questions = exercise.questions || []
  const userAnswers = {}

  container.innerHTML = `
    <div class="questions-list" id="questionsList">
      ${questions.map((q, i) => renderQuestion(q, i)).join('')}
    </div>
    <div class="exercise-actions">
      <button class="btn-submit-exercise" id="submitExercise">✦ Submit &amp; Grade</button>
    </div>
    <div class="grade-result" id="gradeResult" style="display:none"></div>
  `

  // Bind answer collection
  container.querySelector('#questionsList').addEventListener('change', e => {
    const el = e.target
    if (el.dataset.qid) userAnswers[el.dataset.qid] = el.value
  })
  container.querySelector('#questionsList').addEventListener('input', e => {
    const el = e.target
    if (el.dataset.qid) userAnswers[el.dataset.qid] = el.value
  })

  container.querySelector('#submitExercise').addEventListener('click', async () => {
    const btn = container.querySelector('#submitExercise')
    const { aiConfig, user } = store.get()

    // Validate all answered
    const missing = questions.filter(q => !userAnswers[q.id]?.trim())
    if (missing.length) {
      const first = container.querySelector(`[data-qid="${missing[0].id}"]`)
      first?.closest('.question-block')?.classList.add('unanswered')
      first?.focus()
      return
    }

    btn.disabled = true
    btn.textContent = '⏳ Grading…'

    try {
      const result = await aiGradeExercises(questions, userAnswers, entry.body, aiConfig)
      const saved = await saveExerciseResult(user.id, {
        exerciseId: exercise.id,
        textId:     entry.id,
        level:      entry.level,
        answers:    userAnswers,
        grading:    result.grading,
        score:      result.totalScore,
      })

      // Update results in store
      store.set(s => ({ results: [saved, ...s.results] }))

      renderGradeResult(container.querySelector('#gradeResult'), questions, userAnswers, result)
      container.querySelector('#gradeResult').style.display = 'block'
      container.querySelector('#gradeResult').scrollIntoView({ behavior: 'smooth', block: 'start' })
      btn.style.display = 'none'

      // Freeze inputs
      container.querySelectorAll('input, textarea, .mc-option').forEach(el => {
        el.disabled = true
        el.style.pointerEvents = 'none'
      })

      // Annotate questions with correct/incorrect
      questions.forEach(q => {
        const block = container.querySelector(`.question-block[data-qid-block="${q.id}"]`)
        if (!block) return
        const g = result.grading?.[q.id]
        if (!g) return
        block.classList.add(g.correct ? 'q-correct' : g.score > 0 ? 'q-partial' : 'q-wrong')
      })
    } catch (e) {
      btn.disabled = false
      btn.textContent = '✦ Submit & Grade'
      container.querySelector('#gradeResult').innerHTML = `<div class="exercise-error">⚠ ${e.message}</div>`
      container.querySelector('#gradeResult').style.display = 'block'
    }
  })
}

function renderQuestion(q, index) {
  const num = index + 1
  const typeLabel = { mc: 'Multiple Choice', fill: 'Fill in the Blank', translate: 'Translate' }[q.type] || q.type

  let input = ''
  if (q.type === 'mc') {
    input = `<div class="mc-options">
      ${(q.options || []).map(opt => `
        <label class="mc-option">
          <input type="radio" name="q_${q.id}" data-qid="${q.id}" value="${escHtml(opt)}">
          <span>${escHtml(opt)}</span>
        </label>`).join('')}
    </div>`
  } else if (q.type === 'fill') {
    input = `
      <div class="fill-prompt">${escHtml(q.prompt)}</div>
      ${q.hint ? `<div class="fill-hint">💡 ${escHtml(q.hint)}</div>` : ''}
      <input type="text" class="fill-input" data-qid="${q.id}"
        placeholder="Type the missing word…" autocomplete="off" spellcheck="false">`
  } else if (q.type === 'translate') {
    input = `
      <div class="translate-prompt">"${escHtml(q.prompt)}"</div>
      <textarea class="translate-input" data-qid="${q.id}"
        placeholder="Write your English translation…" rows="2"></textarea>`
  }

  return `
    <div class="question-block" data-qid-block="${q.id}">
      <div class="question-meta">
        <span class="question-num">Q${num}</span>
        <span class="question-type-badge">${typeLabel}</span>
      </div>
      ${q.type !== 'fill' ? `<div class="question-prompt">${escHtml(q.prompt)}</div>` : ''}
      ${input}
    </div>`
}

function renderGradeResult(container, questions, answers, result) {
  const grading = result.grading || {}
  const score   = result.totalScore ?? 0
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--accent)'

  container.innerHTML = `
    <div class="grade-summary">
      <div class="grade-score" style="color:${scoreColor}">${Math.round(score)}<span class="grade-pct">%</span></div>
      <div class="grade-label">${scoreLabel(score)}</div>
      <p class="grade-overall">${escHtml(result.overallFeedback || '')}</p>
    </div>
    <div class="grade-breakdown">
      ${questions.map(q => {
        const g = grading[q.id]
        if (!g) return ''
        const icon = g.correct ? '✓' : g.score > 0 ? '½' : '✗'
        const cls  = g.correct ? 'gb-correct' : g.score > 0 ? 'gb-partial' : 'gb-wrong'
        return `
          <div class="grade-item ${cls}">
            <span class="grade-icon">${icon}</span>
            <div class="grade-item-body">
              <div class="grade-item-prompt">${escHtml(q.prompt)}</div>
              <div class="grade-item-answer">
                Your answer: <em>${escHtml(answers[q.id] || '—')}</em>
                ${!g.correct ? `· Correct: <em>${escHtml(q.answer)}</em>` : ''}
              </div>
              ${g.feedback ? `<div class="grade-item-feedback">${escHtml(g.feedback)}</div>` : ''}
            </div>
          </div>`
      }).join('')}
    </div>
    <button class="btn-retry" id="retryBtn">↺ Try Again</button>
  `

  container.querySelector('#retryBtn')?.addEventListener('click', () => {
    const { texts, currentTextId } = store.get()
    const entry = texts.find(t => t.id === currentTextId)
    if (entry) document.dispatchEvent(new CustomEvent('app:exercise', { detail: entry.id }))
  })
}

function scoreLabel(score) {
  if (score >= 90) return 'Ausgezeichnet! 🎉'
  if (score >= 75) return 'Sehr gut! 👏'
  if (score >= 60) return 'Gut gemacht!'
  if (score >= 40) return 'Weiter üben!'
  return 'Noch einmal versuchen!'
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
