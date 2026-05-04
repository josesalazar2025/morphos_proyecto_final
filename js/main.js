import { analizarResultados } from './analisis.js';
import './auth.js';
import { colapsarPatrones, initMobSync } from './ui.js';
import { llamarIA, initBackendConfig } from './ia.js';

// Tema oscuro/claro

const saved = localStorage.getItem('mx-theme');
const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = saved || preferred;

const btnTema = document.getElementById('btn-tema');
if (btnTema) {
    btnTema.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('mx-theme', next);
    });
}

// Data

let referencias = [];
let alteraciones = {};
let ultimoAnalisis = { hallazgos: [], patrones: [] };

const cargarReferencias = async () => {
    try {
        const response = await fetch('data/valores_referencia.json');
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        referencias = await response.json();
    } catch (error) {
        console.error('Error cargando valores de referencia:', error);
    }
};

const cargarAlteraciones = async () => {
    try {
        const response = await fetch('data/alteraciones.json');
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        alteraciones = await response.json();
    } catch (error) {
        console.error('Error cargando alteraciones:', error);
    }
};

cargarReferencias();
cargarAlteraciones();

// Mapeo de inputs

const INPUT_A_CLAVE = {
    rbc: 'rbc', hgb: 'hgb', hct: 'hct', vcm: 'mcv', hcm: 'mch',
    wbc: 'wbc', neutro: 'neutrophils', linfo: 'lymphocytes', eosino: 'eosinophils', baso: 'basophils', plt: 'platelets',
    alt: 'alt', ast: 'ast', fal: 'alp', bun: 'bun', creat: 'creatinine',
    gluc: 'glucose', prot: 'total_protein', alb: 'albumin', bili: 'total_bilirubin',
    fosf: 'phosphorus', calc: 'calcium', sodio: 'sodium', potasio: 'potassium', cloro: 'chloride',
    usg: 'usg', ph: 'urine_ph',
    'cortisol-bas': 'cortisol_basal', 'cortisol-acth': 'cortisol_acth',
    't4-total': 't4_total', insulina: 'insulina'
};

const CLAVE_A_INPUT = Object.entries(INPUT_A_CLAVE).reduce((acc, [nombre, clave]) => {
    acc[clave] = nombre;
    return acc;
}, {});

// Colección de datos de formulario

const obtenerDatosPaciente = () => {
    const especieRaw = document.getElementById('pt-especie').value;
    const edadVal = document.getElementById('pt-edad').value;
    const edadUnidad = document.getElementById('pt-edad-unidad').value;
    const edadMeses = edadVal === '' ? null
        : edadUnidad === 'meses' ? parseFloat(edadVal)
        : parseFloat(edadVal) * 12;
    return {
        especie: especieRaw === 'Canino' ? 'canino' : especieRaw === 'Felino' ? 'felino' : null,
        raza: document.getElementById('pt-raza').value,
        edadMeses,
        sexo: document.getElementById('pt-sexo').value
    };
};

const obtenerValoresFormulario = () => {
    const valores = {};
    document.querySelectorAll('input[type="number"]').forEach(input => {
        const clave = INPUT_A_CLAVE[input.name];
        if (clave && input.value !== '') valores[clave] = parseFloat(input.value);
    });
    return valores;
};

// Renderizado

const ETIQUETA_GRAVEDAD = { leve: 'Leve', moderado: 'Moderado', grave: 'Grave' };

document.querySelectorAll('.fila-campo input[type="number"]').forEach(input => {
    const span = document.createElement('span');
    span.className = 'estado-campo';
    input.before(span);
});

const actualizarClasesInputs = (hallazgos) => {
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.classList.remove('alto', 'bajo');
        const span = input.previousElementSibling;
        if (span?.classList.contains('estado-campo')) {
            span.textContent = '';
            span.className = 'estado-campo';
        }
    });
    hallazgos.forEach(h => {
        const input = document.querySelector(`input[name="${CLAVE_A_INPUT[h.clave]}"]`);
        if (!input) return;
        input.classList.add(h.direccion);
        const span = input.previousElementSibling;
        if (span?.classList.contains('estado-campo')) {
            span.textContent = `${h.direccion === 'alto' ? 'Alto' : 'Bajo'} · ${ETIQUETA_GRAVEDAD[h.gravedad]}`;
            span.className = `estado-campo estado-campo--${h.direccion}`;
        }
    });
};

const renderizarPatrones = (patrones) => {
    const contenedor = document.getElementById('patrones-lista');
    if (!contenedor) return;

    contenedor.innerHTML = patrones.length === 0
        ? '<p class="sin-hallazgos">Sin patrones detectados.</p>'
        : patrones.map(p => `
            <div class="elemento-patron gravedad-${p.gravedad}">
                <div class="titulo-patron">${p.nombre}</div>
                <div class="cuerpo-patron">${p.descripcion}</div>
            </div>`).join('');
};

// Evaluación

const evaluar = () => {
    const paciente = obtenerDatosPaciente();

    if (!paciente.especie || !referencias[paciente.especie]) {
        actualizarClasesInputs([]);
        renderizarPatrones([]);
        return;
    }

    const valores = obtenerValoresFormulario();
    const { hallazgos, patrones } = analizarResultados(valores, paciente, referencias, alteraciones);
    ultimoAnalisis = { hallazgos, patrones };

    actualizarClasesInputs(hallazgos);
    renderizarPatrones(patrones);
};

// Eventos

document.addEventListener('input', e => {
    if (e.target.type !== 'number') return;
    if (e.target.value < 0) e.target.value = 0;
    if (e.target.value.replace('.', '').length > 4) e.target.value = e.target.value.slice(0, 4);
    e.target.classList.toggle('max-chars', e.target.value.replace('.', '').length >= 4);
    evaluar();
});

document.getElementById('pt-especie').addEventListener('change', evaluar);
document.getElementById('pt-raza').addEventListener('input', evaluar);
document.getElementById('pt-edad').addEventListener('input', evaluar);
document.getElementById('pt-edad-unidad').addEventListener('change', evaluar);
document.getElementById('pt-sexo').addEventListener('change', evaluar);

initMobSync(evaluar);
initBackendConfig();

document.querySelector('.boton-analizar').addEventListener('click', () => {
    colapsarPatrones(true);
    llamarIA(obtenerDatosPaciente, obtenerValoresFormulario, () => ultimoAnalisis, () => referencias);
});
