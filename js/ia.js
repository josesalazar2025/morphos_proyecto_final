import { imagenesDataUrl, microscopioCaptures } from './ui.js';

const BACKEND_KEY   = 'mx-ia-backend';
const OLLAMA_URL_KEY = 'mx-ia-ollama-url';
const OLLAMA_MOD_KEY = 'mx-ia-ollama-model';

export function initBackendConfig() {
    const localRadio = document.getElementById('ia-backend-local');
    const hfRadio = document.getElementById('ia-backend-hf');
    const urlInput = document.getElementById('ia-ollama-url');
    const modelInput = document.getElementById('ia-ollama-model');
    const ollamaFields = document.getElementById('ia-ollama-fields');

    const savedBackend = localStorage.getItem(BACKEND_KEY) ?? 'hf';
    if (savedBackend === 'local') localRadio.checked = true;
    else hfRadio.checked = true;

    const savedUrl = localStorage.getItem(OLLAMA_URL_KEY);
    const savedOllMod = localStorage.getItem(OLLAMA_MOD_KEY);
    if (savedUrl) urlInput.value = savedUrl;
    if (savedOllMod) modelInput.value = savedOllMod;

    function applyBackend(val) {
        ollamaFields.hidden = val !== 'local';
    }
    applyBackend(savedBackend);

    [localRadio, hfRadio].forEach(r => r.addEventListener('change', () => {
        const val = document.querySelector('input[name="ia-backend"]:checked').value;
        localStorage.setItem(BACKEND_KEY, val);
        applyBackend(val);
    }));

    urlInput.addEventListener('input', () => localStorage.setItem(OLLAMA_URL_KEY, urlInput.value.trim()));
    modelInput.addEventListener('input', () => localStorage.setItem(OLLAMA_MOD_KEY, modelInput.value.trim()));
}

// Prompt

function construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const paciente = obtenerDatosPaciente();
    const valores  = obtenerValoresFormulario();
    const { hallazgos, patrones } = getUltimoAnalisis();
    const signosText = document.getElementById('signos-clinicos').value.trim();
    const refEspecie = paciente.especie ? (getReferencias()[paciente.especie] || {}) : {};

    const lineasValores = Object.entries(valores).map(([clave, valor]) => {
        const ref = refEspecie[clave];
        const nombre = ref?.nombre || clave;
        const unidad = ref?.unidad || '';
        const rango = ref ? ` [ref: ${ref.inferior}-${ref.superior}]` : '';
        const h = hallazgos.find(h => h.clave === clave);
        const flag = h ? ` ← ${h.direccion === 'alto' ? 'ELEVADO' : 'BAJO'} (${h.gravedad})` : '';
        return `  ${nombre}: ${valor} ${unidad}${rango}${flag}`;
    }).join('\n') || 'Sin valores ingresados';

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
    if (text.includes('<start_of_turn>model')) {
        text = text.split('<start_of_turn>model').pop();
    }
    if (text.includes('<end_of_turn>')) {
        text = text.slice(0, text.indexOf('<end_of_turn>'));
    }
    if (text.includes('<unused95>')) {
        text = text.split('<unused95>').slice(1).join('');
    } else if (text.includes('<unused94>')) {
        // Thinking block present but no answer token — model ran out of tokens
        const afterThinking = text.split('<unused94>').slice(2).join('');
        if (afterThinking.trim()) {
            text = afterThinking;
        } else {
            return 'El modelo agotó los tokens durante el razonamiento. Intenta de nuevo o usa menos imágenes.';
        }
    }
    text = text.replace(/<unused\d+>/g, '');
    text = text.replace(/<start_of_turn>\w+\n?/g, '');
    return text.trim() || 'Sin respuesta del modelo.';
}

// Llamado a IA

export async function llamarIA(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const salidaEl = document.getElementById('salida-ia');
    const backend = document.querySelector('input[name="ia-backend"]:checked')?.value ?? 'hf';

    salidaEl.textContent = 'Consultando al modelo de I.A…';
    salidaEl.classList.add('cargando');

    try {
        if (backend === 'local') {
            await _llamarOllama(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
        } else {
            await _llamarSpace(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
        }
    } finally {
        salidaEl.classList.remove('cargando');
    }
}

// Ollama

async function _llamarOllama(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const baseUrl = (document.getElementById('ia-ollama-url')?.value ?? 'http://localhost:11434').replace(/\/$/, '');
    const model   = document.getElementById('ia-ollama-model')?.value?.trim() || 'medgemma:latest';
    const prompt  = construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
    const images  = [...imagenesDataUrl.filter(Boolean), ...microscopioCaptures];

    const contenido = [];
    for (const img of images) {
        if (typeof img === 'string' && img.startsWith('data:image/'))
            contenido.push({ type: 'image_url', image_url: { url: img } });
    }
    contenido.push({ type: 'text', text: prompt });

    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: contenido.length === 1 ? prompt : contenido }],
                max_tokens: 600,
                stream: false,
                think: false,
            }),
        });

        let data;
        try { data = await res.json(); } catch {
            salidaEl.textContent = `Error del servidor Ollama (HTTP ${res.status}). Verifica que esté ejecutándose.`;
            return;
        }

        if (!res.ok) {
            salidaEl.textContent = `Error Ollama: ${data?.error?.message ?? data?.error ?? `HTTP ${res.status}`}`;
        } else {
            salidaEl.textContent = limpiarRespuesta(data?.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.');
        }
    } catch {
        salidaEl.textContent = `No se pudo conectar con Ollama en ${baseUrl}. Verifica que esté ejecutándose con "ollama serve".`;
    }
}

// Morphos AI Space

async function _llamarSpace(salidaEl, obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias) {
    const prompt = construirPrompt(obtenerDatosPaciente, obtenerValoresFormulario, getUltimoAnalisis, getReferencias);
    const imagenes = [...imagenesDataUrl.filter(Boolean), ...microscopioCaptures]
        .filter(img => typeof img === 'string' && /^data:image\/(jpeg|png|gif|webp);base64,/.test(img))
        .slice(0, 4);

    try {
        const res = await fetch('api/hf_proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: imagenes, prompt }),
        });

        const data = await res.json();
        if (!res.ok) {
            salidaEl.textContent = `Error: ${data?.error ?? `HTTP ${res.status}`}`;
        } else {
            salidaEl.textContent = limpiarRespuesta(data.text ?? 'Sin respuesta del modelo.');
        }
    } catch (e) {
        salidaEl.textContent = `Error de red: ${e.message}`;
    }
}
