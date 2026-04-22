import { analizarResultados } from './analisis.js';

let referencias = [];

const tabs = document.querySelectorAll('.pestanya-nav');
const paneles = document.querySelectorAll('main > .panel');

function activateTab(targetId) {
    tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle('activo',isActive);
        tab.setAttribute('aria-selected', isActive);
    });
    paneles.forEach(panel => {
        panel.classList.toggle('activo',panel.id === targetId);
    });
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
});


const cargarReferencias = async () => {
    try {
        const response = await fetch('data/valores_referencia.json');
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        referencias = await response.json();
    } catch (error) {
        console.error('Error cargando valores de referencia:', error);
    }
};
cargarReferencias();


// ─── Mapeo de campos ──────────────────────────────────────────────────────────

const INPUT_A_CLAVE = {
    rbc: 'rbc', hgb: 'hgb', hct: 'hct', vcm: 'mcv', hcm: 'mch', chcm: 'mchc',
    wbc: 'wbc', neutro: 'neutrophils', linfo: 'lymphocytes', mono: 'monocytes',
    eosino: 'eosinophils', baso: 'basophils', plt: 'platelets',
    alt: 'alt', ast: 'ast', fal: 'alp', ggt: 'ggt', bun: 'bun', creat: 'creatinine',
    gluc: 'glucose', prot: 'total_protein', alb: 'albumin', bili: 'total_bilirubin',
    fosf: 'phosphorus', calc: 'calcium', sodio: 'sodium', potasio: 'potassium', cloro: 'chloride'
};

const CLAVE_A_INPUT = Object.fromEntries(
    Object.entries(INPUT_A_CLAVE).map(([nombre, clave]) => [clave, nombre])
);


// ─── Recolección de datos del formulario ──────────────────────────────────────

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


// ─── Renderizado de resultados ────────────────────────────────────────────────

const ETIQUETA_GRAVEDAD = { leve: 'Leve', moderado: 'Moderado', grave: 'Grave' };
const ETIQUETA_DIRECCION = { alto: 'ALTO', bajo: 'BAJO' };

const actualizarClasesInputs = (hallazgos) => {
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.classList.remove('alto', 'bajo');
    });
    hallazgos.forEach(h => {
        const input = document.querySelector(`input[name="${CLAVE_A_INPUT[h.clave]}"]`);
        input?.classList.add(h.direccion);
    });
};

const renderizarHallazgos = (hallazgos) => {
    const contenedor = document.getElementById('hallazgos-lista');
    if (!contenedor) return;

    contenedor.innerHTML = hallazgos.length === 0
        ? '<p class="sin-hallazgos">Sin valores fuera de rango.</p>'
        : hallazgos.map(h => `
            <div class="insignia-hallazgo ${h.direccion}">
                <span>${h.nombre}</span>
                <span>${h.valor} ${h.unidad}</span>
                <span>${ETIQUETA_DIRECCION[h.direccion]} · ${ETIQUETA_GRAVEDAD[h.gravedad]}</span>
            </div>`).join('');
};

const renderizarPatrones = (patrones) => {
    const contenedor = document.getElementById('patrones-lista');
    if (!contenedor) return;

    contenedor.innerHTML = patrones.length === 0
        ? '<p class="sin-hallazgos">Sin patrones detectados.</p>'
        : patrones.map(p => `
            <div class="elemento-patron gravedad-${p.gravedad}">
                <strong>${p.nombre}</strong> — ${p.descripcion}
            </div>`).join('');
};


// ─── Evaluación principal ─────────────────────────────────────────────────────

const evaluar = () => {
    const paciente = obtenerDatosPaciente();

    if (!paciente.especie || !referencias[paciente.especie]) {
        actualizarClasesInputs([]);
        renderizarHallazgos([]);
        renderizarPatrones([]);
        return;
    }

    const valores = obtenerValoresFormulario();
    const { hallazgos, patrones } = analizarResultados(valores, paciente, referencias);

    actualizarClasesInputs(hallazgos);
    renderizarHallazgos(hallazgos);
    renderizarPatrones(patrones);
};


// ─── Eventos ──────────────────────────────────────────────────────────────────

document.addEventListener('input', e => {
    if (e.target.type !== 'number') return;
    if (e.target.value < 0) e.target.value = 0;
    if (e.target.value.replace('.', '').length > 4) e.target.value = e.target.value.slice(0, 4);
    evaluar();
});

document.getElementById('pt-especie').addEventListener('change', evaluar);
document.getElementById('pt-raza').addEventListener('input', evaluar);
document.getElementById('pt-edad').addEventListener('input', evaluar);
document.getElementById('pt-edad-unidad').addEventListener('change', evaluar);
document.getElementById('pt-sexo').addEventListener('change', evaluar);
