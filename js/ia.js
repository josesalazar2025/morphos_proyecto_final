import { abrirModal, getSessionActiva } from './auth.js';
import { imagenesDataUrl, microscopioCaptures } from './ui.js';

// Selección de backend

const BACKEND_KEY = 'mx-ia-backend';
const OLLAMA_URL_KEY = 'mx-ia-ollama-url';
const OLLAMA_MOD_KEY = 'mx-ia-ollama-model';
const HF_MOD_KEY = 'mx-ia-hf-model';

export function initBackendConfig() {
    const localRadio = document.getElementById('ia-backend-local');
    const hfRadio = document.getElementById('ia-backend-hf');
    const urlInput = document.getElementById('ia-ollama-url');
    const modelInput = document.getElementById('ia-ollama-model');
    const ollamaFields = document.getElementById('ia-ollama-fields');
    const hfFields = document.getElementById('ia-hf-fields');
    const hfModelSel = document.getElementById('ia-hf-model');

    const savedBackend = localStorage.getItem(BACKEND_KEY) ?? 'hf';
    if (savedBackend === 'local') localRadio.checked = true;
    else hfRadio.checked = true;

    const savedUrl = localStorage.getItem(OLLAMA_URL_KEY);
    const savedOllMod = localStorage.getItem(OLLAMA_MOD_KEY);
    const savedHfMod = localStorage.getItem(HF_MOD_KEY);
    if (savedUrl) urlInput.value = savedUrl;
    if (savedOllMod) modelInput.value = savedOllMod;
    if (savedHfMod) hfModelSel.value = savedHfMod;

    function applyBackend(val) {
        ollamaFields.hidden = val !== 'local';
        hfFields.hidden = val !== 'hf';
    }
    applyBackend(savedBackend);

    [localRadio, hfRadio].forEach(r => r.addEventListener('change', () => {
        const val = document.querySelector('input[name="ia-backend"]:checked').value;
        localStorage.setItem(BACKEND_KEY, val);
        applyBackend(val);
    }));

    urlInput.addEventListener('input', () => localStorage.setItem(OLLAMA_URL_KEY, urlInput.value.trim()));
    modelInput.addEventListener('input', () => localStorage.setItem(OLLAMA_MOD_KEY, modelInput.value.trim()));
    hfModelSel.addEventListener('change', () => localStorage.setItem(HF_MOD_KEY, hfModelSel.value));
}

// Prompt 

function construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const paciente = obtenerDatosPaciente();
    const valores = obtenerValoresFormulario();
    const { hallazgos, patrones } = getUltimoAnalisis();
    const signosText = document.getElementById('signos-clinicos').value.trim();
    const refEspecie = paciente.especie ? (getReferencias()[paciente.especie] || {}) : {};

    const lineasValores = Object.entries(valores).map(([clave, valor]) => {
        const ref = refEspecie[clave];
        const nombre = ref?.nombre || clave;
        const unidad = ref?.unidad || '';
        const rango = ref ? ` [ref: ${ref.inferior}–${ref.superior}]` : '';
        const h = hallazgos.find(h => h.clave === clave);
        const flag = h ? ` ← ${h.direccion === 'alto' ? 'ELEVADO' : 'BAJO'} (${h.gravedad})` : '';
        return `  ${nombre}: ${valor} ${unidad}${rango}${flag}`;
    }).join('\n') || '  Sin valores ingresados';

    const lineasPatrones = patrones.length > 0
        ? patrones.map(p => `  - ${p.nombre}: ${p.descripcion}`).join('\n')
        : '  Ninguno detectado';

    const edadTexto = paciente.edadMeses != null
        ? (paciente.edadMeses < 24 ? `${Math.round(paciente.edadMeses)} meses` : `${(paciente.edadMeses / 12).toFixed(1)} años`)
        : 'desconocida';

    return `IMPORTANTE: Responde ÚNICAMENTE en español. Do not write in English under any circumstance.

    Eres un médico veterinario especialista en patología clínica. Sólo responderás consultas asociadas a ésta área de conocimiento y basado en la evidencia proporcionada.
    Si te envían imágenes de citología debes hacer una revisión exhaustiva de la morfología celular, identificar lesiones, patrones anormales, presencia de hemoparásitos intracelulares y extracelulares (Anaplasma, Babesia, Ehrlichia, Hepatozoon, Piroplasma, Mycoplasma, etc)  o inclusiones citoplasmáticas.
    Analiza los resultados y proporciona una interpretación clínica concisa.

    Paciente: ${paciente.especie || 'desconocido'}, raza: ${paciente.raza || 'NE'}, edad: ${edadTexto}, sexo: ${paciente.sexo || 'NE'}

    Resultados de laboratorio:
    ${lineasValores}

    Patrones detectados:
    ${lineasPatrones}
    ${signosText ? `\nSignos clínicos: ${signosText}` : ''}
    Proporciona una interpretación clínica breve (6-8 oraciones) destacando los hallazgos más significativos y las recomendaciones diagnósticas inmediatas.`;
        }

function limpiarRespuesta(text) {
    if (text.includes('<unused95>')) {
        text = text.split('<unused95>').slice(1).join('');
    } else if (text.includes('<unused94>')) {
        text = text.slice(0, text.indexOf('<unused94>'));
    }
    text = text.replace(/<unused\d+>/g, '');
    text = text.replace(/<start_of_turn>\w+\n?/g, '').replace(/<end_of_turn>/g, '');
    return text.trim();
}

// Llamado a IA
export async function llamarIA(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const salidaEl = document.getElementById('salida-ia');
    const backend = document.querySelector('input[name="ia-backend"]:checked')?.value ?? 'hf';

    if (backend === 'hf' && !getSessionActiva()) {
        salidaEl.textContent = 'Inicia sesión para usar el análisis IA con HuggingFace.';
        abrirModal('login');
        return;
    }

    salidaEl.textContent = 'Consultando al modelo de I.A…';
    salidaEl.classList.add('cargando');

    try {
        if (backend === 'local') {
            await _llamarOllama(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
        } else {
            await _llamarHuggingFace(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
        }
    } finally {
        salidaEl.classList.remove('cargando');
    }
}

// Ollama

async function _llamarOllama(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const baseUrl = (document.getElementById('ia-ollama-url')?.value ?? 'http://localhost:11434').replace(/\/$/, '');
    const model = document.getElementById('ia-ollama-model')?.value?.trim() || 'medgemma1.5:latest';
    const prompt = construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
    const images = [...imagenesDataUrl.filter(Boolean), ...microscopioCaptures];

    const contenido = [];
    for (const img of images) {
        if (typeof img === 'string' && img.startsWith('data:image/')) {
            contenido.push({ type: 'image_url', image_url: { url: img } });
        }
    }
    contenido.push({ type: 'text', text: prompt });

    const payload = {
        model,
        messages: [{ role: 'user', content: contenido.length === 1 ? prompt : contenido }],
        max_tokens: 600,
        stream: false,
        think: false,
    };

    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        let data;
        try { data = await res.json(); } catch {
            salidaEl.textContent = `Error del servidor Ollama (HTTP ${res.status}). Verifica que esté ejecutándose.`;
            return;
        }

        if (!res.ok) {
            const msg = data?.error?.message ?? data?.error ?? `HTTP ${res.status}`;
            salidaEl.textContent = `Error Ollama: ${msg}`;
        } else {
            salidaEl.textContent = limpiarRespuesta(data?.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.');
        }
    } catch {
        salidaEl.textContent = `No se pudo conectar con Ollama en ${baseUrl}. Verifica que esté ejecutándose con "ollama serve".`;
    }
}

// HuggingFace 

const HF_MODELOS = {
    'unsloth/medgemma-27b-it': { proveedor: 'featherless-ai', multimodal: false, max_tokens: 1000 },
    'unsloth/medgemma-4b-it': { proveedor: 'featherless-ai', multimodal: true, max_tokens: 600 },
    'unsloth/medgemma-1.5-4b-it': { proveedor: 'featherless-ai', multimodal: true, max_tokens: 1000 },
    'google/medgemma-1.5-4b-it': { proveedor: 'scaleway', multimodal: true, max_tokens: 800 },
    'blackmistcode/morphos_medGemma': { proveedor: 'space', multimodal: true, max_tokens: 512 },
};

async function _llamarHuggingFace(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const apiKey = sessionStorage.getItem('hf_api_key') ?? '';
    if (!apiKey) {
        salidaEl.textContent = 'API Key no configurada. Por favor inicia sesión.';
        abrirModal('login');
        return;
    }

    const modelId = document.getElementById('ia-hf-model')?.value || 'unsloth/medgemma-1.5-4b-it';
    const config = HF_MODELOS[modelId] ?? HF_MODELOS['unsloth/medgemma-1.5-4b-it'];
    const modelo = HF_MODELOS[modelId] ? modelId : 'unsloth/medgemma-1.5-4b-it';
    const prompt = construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
    const imagenes = [...imagenesDataUrl.filter(Boolean), ...microscopioCaptures];

    let contenido = [];
    if (config.multimodal) {
        imagenes.forEach(img => {
            if (typeof img === 'string' && /^data:image\/(jpeg|png|gif|webp);base64,/.test(img))
                contenido.push({ type: 'image_url', image_url: { url: img } });
        });
    }
    contenido.push({ type: 'text', text: prompt });
    if (contenido.length === 1) contenido = prompt;

    try {
        let res, data;

        if (config.proveedor === 'space') {
            const SPACE = 'https://blackmistcode-morphos-medgemma.hf.space/gradio_api';
            const imagen = imagenes.find(img => typeof img === 'string' && /^data:image\/(jpeg|png|gif|webp);base64,/.test(img)) ?? null;
            const imageInput = imagen ? { url: imagen } : null;

            const submitRes = await fetch(`${SPACE}/call/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ data: [imageInput, prompt] }),
            });
            if (!submitRes.ok) {
                salidaEl.textContent = `Error Space: HTTP ${submitRes.status}`;
                return;
            }
            const { event_id } = await submitRes.json();

            const streamRes = await fetch(`${SPACE}/call/analyze/${event_id}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '', result = null;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === 'event: complete' && lines[i + 1]?.startsWith('data: ')) {
                        result = JSON.parse(lines[i + 1].slice(6))[0];
                    }
                }
            }
            if (result !== null) {
                salidaEl.textContent = limpiarRespuesta(result);
            } else {
                salidaEl.textContent = 'Sin respuesta del modelo.';
            }
        } else {
            res = await fetch(`https://router.huggingface.co/${config.proveedor}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelo,
                    messages: [{ role: 'user', content: contenido }],
                    max_tokens: config.max_tokens,
                }),
            });

            try { data = await res.json(); } catch {
                salidaEl.textContent = `Error inesperado (HTTP ${res.status}). Intenta de nuevo.`;
                return;
            }

            if (!res.ok) {
                const err = data?.error;
                const msg = typeof err === 'string' ? err
                          : Array.isArray(err) ? err.join(' ')
                          : err != null ? JSON.stringify(err)
                          : `HTTP ${res.status}`;
                salidaEl.textContent = `Error: ${msg}`;
            } else {
                salidaEl.textContent = limpiarRespuesta(data?.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.');
            }
        }
    } catch (e) {
        salidaEl.textContent = `Error de red: ${e.message}`;
    }
}
