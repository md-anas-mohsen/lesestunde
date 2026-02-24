import { store } from '../lib/store.js'
import { PROVIDERS, aiTestConnection } from '../lib/ai.js'
import { saveApiSettings } from '../lib/db.js'

export function renderSettingsModal(container) {
  const s = store.get()
  const cfg = s.aiConfig

  const providerTabsHTML = Object.entries(PROVIDERS).map(([key, p]) => `
    <button class="ptab ${cfg.provider === key ? 'active' : ''}" data-p="${key}">${p.label.replace('Google ', '')}</button>
  `).join('')

  const localPresetsHTML = PROVIDERS.local.localPresets.map(p => `
    <button class="preset-btn" data-url="${p.url}" data-model="${p.model}">${p.label}</button>
  `).join('')

  container.innerHTML = `
    <div class="modal-backdrop open" id="settingsBackdrop">
      <div class="modal">
        <div class="modal-header">
          <h2>API Settings</h2>
          <button class="modal-close" id="closeSettings">✕</button>
        </div>
        <div class="modal-body">
          <div class="field-group">
            <label class="field-label">Provider</label>
            <div class="provider-tabs" id="providerTabs">${providerTabsHTML}</div>
          </div>
          <div class="field-group">
            <label class="field-label">
              API Key
              <span id="keyOptionalBadge" class="optional-badge" style="display:${cfg.provider === 'local' ? 'inline' : 'none'}">optional</span>
            </label>
            <div class="key-row">
              <input type="password" class="field-input" id="keyInput"
                placeholder="${PROVIDERS[cfg.provider].placeholder}"
                value="${cfg.apiKey || ''}"
                autocomplete="off" spellcheck="false">
              <button class="toggle-vis" id="toggleVis" title="Show/hide">👁</button>
            </div>
            <div class="field-hint" id="keyHint">${PROVIDERS[cfg.provider].keyHint}</div>
          </div>
          <div class="field-group">
            <label class="field-label">Model</label>
            <input type="text" class="field-input" id="modelInput"
              value="${cfg.model}"
              placeholder="${PROVIDERS[cfg.provider].defaultModel}"
              autocomplete="off" spellcheck="false">
          </div>
          <div class="field-group">
            <label class="field-label">Base URL <span class="optional-badge">auto-filled, editable</span></label>
            <input type="text" class="field-input" id="baseURLInput"
              value="${cfg.baseURL}"
              autocomplete="off" spellcheck="false">
            <div id="localPresets" style="display:${cfg.provider === 'local' ? 'block' : 'none'};margin-top:6px">
              <div class="field-hint" style="margin-bottom:5px">Quick-fill:</div>
              <div class="local-presets-row">${localPresetsHTML}</div>
            </div>
          </div>
          <div id="localCorsNote" class="cors-note" style="display:${cfg.provider === 'local' ? 'block' : 'none'}">
            ⚠ <strong>CORS:</strong> Local servers must allow requests from this origin.
            For Ollama set <code>OLLAMA_ORIGINS=*</code>. LM Studio has a CORS toggle in server settings.
          </div>
          <div class="modal-status" id="modalStatus"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-test" id="testBtn">⚡ Test Connection</button>
          <button class="btn-save" id="saveSettingsBtn">Save &amp; Close</button>
        </div>
      </div>
    </div>
  `

  // ── Provider tab logic ──
  function applyProvider(p) {
    const prov = PROVIDERS[p]
    const isLocal = p === 'local'
    container.querySelector('#keyOptionalBadge').style.display = isLocal ? 'inline' : 'none'
    container.querySelector('#localPresets').style.display = isLocal ? 'block' : 'none'
    container.querySelector('#localCorsNote').style.display = isLocal ? 'block' : 'none'
    container.querySelector('#keyHint').textContent = prov.keyHint
    container.querySelector('#keyInput').placeholder = prov.placeholder
    container.querySelector('#modelInput').value = prov.defaultModel
    container.querySelector('#baseURLInput').value = prov.baseURL
    container.querySelector('#modalStatus').textContent = ''
  }

  container.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      applyProvider(tab.dataset.p)
    })
  })

  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelector('#baseURLInput').value = btn.dataset.url
      container.querySelector('#modelInput').value = btn.dataset.model
    })
  })

  container.querySelector('#toggleVis').addEventListener('click', () => {
    const ki = container.querySelector('#keyInput')
    ki.type = ki.type === 'password' ? 'text' : 'password'
  })

  // ── Close ──
  const close = () => {
    container.innerHTML = ''
    store.set({ settingsOpen: false })
  }
  container.querySelector('#closeSettings').addEventListener('click', close)
  container.querySelector('#settingsBackdrop').addEventListener('click', e => {
    if (e.target.id === 'settingsBackdrop') close()
  })

  // ── Test ──
  container.querySelector('#testBtn').addEventListener('click', async () => {
    const provider = container.querySelector('.ptab.active')?.dataset.p || 'gemini'
    const testConfig = {
      provider,
      baseURL: container.querySelector('#baseURLInput').value.trim() || PROVIDERS[provider].baseURL,
      model: container.querySelector('#modelInput').value.trim() || PROVIDERS[provider].defaultModel,
      apiKey: container.querySelector('#keyInput').value.trim(),
    }
    const statusEl = container.querySelector('#modalStatus')
    statusEl.textContent = 'Testing…'
    statusEl.className = 'modal-status'
    try {
      const reply = await aiTestConnection(testConfig)
      statusEl.textContent = `✓ Connected! Model replied: "${reply}"`
      statusEl.className = 'modal-status ok'
    } catch (e) {
      statusEl.textContent = `✗ ${e.message}`
      statusEl.className = 'modal-status err'
    }
  })

  // ── Save ──
  container.querySelector('#saveSettingsBtn').addEventListener('click', async () => {
    const provider = container.querySelector('.ptab.active')?.dataset.p || 'gemini'
    const newConfig = {
      provider,
      baseURL: container.querySelector('#baseURLInput').value.trim() || PROVIDERS[provider].baseURL,
      model: container.querySelector('#modelInput').value.trim() || PROVIDERS[provider].defaultModel,
      apiKey: container.querySelector('#keyInput').value.trim(),
    }
    store.set({ aiConfig: newConfig })
    const user = store.get().user
    if (user) {
      try {
        await saveApiSettings(user.id, {
          provider: newConfig.provider,
          base_url: newConfig.baseURL,
          model: newConfig.model,
          api_key: newConfig.apiKey,
        })
      } catch (e) {
        console.error('Failed to save API settings:', e)
      }
    }
    close()
  })
}
