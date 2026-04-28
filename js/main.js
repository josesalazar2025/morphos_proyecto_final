import { analizarResultados } from './analisis.js';

// ─── Theme init ────────────────────────────────────────────────────────────────
const saved = localStorage.getItem('mx-theme');
const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = saved || preferred;

// ─── Theme toggle ─────────────────────────────────────────────────────────────
const btnTema = document.getElementById('btn-tema');
if (btnTema) {
    btnTema.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('mx-theme', next);
    });
}

let referencias = [];
let alteraciones = {};

const tabs = document.querySelectorAll('.pestanya-nav');
const paneles = document.querySelectorAll('main > .panel, .col3-wrapper > .panel');

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


// ─── Mapeo de campos ──────────────────────────────────────────────────────────

const INPUT_A_CLAVE = {
    rbc: 'rbc', hgb: 'hgb', hct: 'hct', vcm: 'mcv', hcm: 'mch', chcm: 'mchc',
    wbc: 'wbc', neutro: 'neutrophils', linfo: 'lymphocytes', mono: 'monocytes',
    eosino: 'eosinophils', baso: 'basophils', plt: 'platelets',
    alt: 'alt', ast: 'ast', fal: 'alp', ggt: 'ggt', bun: 'bun', creat: 'creatinine',
    sdma: 'sdma', cistb: 'cystatin_b',
    gluc: 'glucose', prot: 'total_protein', alb: 'albumin', bili: 'total_bilirubin',
    fosf: 'phosphorus', calc: 'calcium', sodio: 'sodium', potasio: 'potassium', cloro: 'chloride',
    usg: 'usg', ph: 'urine_ph', upc: 'upc', microalb: 'microalbumin',
    'cortisol-bas': 'cortisol_basal', 'cortisol-acth': 'cortisol_acth',
    't4-total': 't4_total', ft4: 'ft4', ctsh: 'ctsh',
    fructosamina: 'fructosamina', insulina: 'insulina'
};

const CLAVE_A_INPUT = Object.entries(INPUT_A_CLAVE).reduce((acc, [nombre, clave]) => {
    acc[clave] = nombre;
    return acc;
}, {});


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
                <span class="nombre">${h.nombre}</span>
                <span class="valor">${h.valor} ${h.unidad}</span>
                <span class="etiqueta">${ETIQUETA_DIRECCION[h.direccion]} · ${ETIQUETA_GRAVEDAD[h.gravedad]}</span>
            </div>`).join('');
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
    const { hallazgos, patrones } = analizarResultados(valores, paciente, referencias, alteraciones);

    actualizarClasesInputs(hallazgos);
    renderizarHallazgos(hallazgos);
    renderizarPatrones(patrones);
};


// ─── Eventos ──────────────────────────────────────────────────────────────────

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


// ─── Colapsar panel Flujo de trabajo ─────────────────────────────────────────
const panelFlujo = document.getElementById('panel-flujo');
const panelClinico = document.getElementById('panel-clinico');
const btnColapsar = document.getElementById('btn-colapsar-flujo');
const mainEl = document.querySelector('main');

let collapsedRow = '';
let expandedRow  = '';

const isDesktopGrid = () => window.innerWidth > 1100;

function initGridRows() {
    if (!isDesktopGrid()) return;
    panelClinico.style.height = '';
    mainEl.style.gridTemplateRows = '1fr auto';

    const panelH  = panelFlujo.getBoundingClientRect().height;
    const headerH = panelFlujo.querySelector('.panel-cabecera').getBoundingClientRect().height;
    if (panelH  > 0) expandedRow  = `${panelH}px`;
    if (headerH > 0) collapsedRow = `${headerH}px`;

    mainEl.style.gridTemplateRows = `1fr ${expandedRow || 'auto'}`;
    if (expandedRow) panelClinico.style.height = expandedRow;
}

function setGridRows(collapsed, animate) {
    if (!isDesktopGrid()) return;
    if (!animate) mainEl.style.transition = 'none';
    mainEl.style.gridTemplateRows = collapsed
        ? `1fr ${collapsedRow}`
        : `1fr ${expandedRow}`;
    if (!animate) {
        mainEl.offsetHeight;
        mainEl.style.transition = '';
    }
}

initGridRows();

const startCollapsed = localStorage.getItem('mx-flujo-collapsed') === '1';
if (startCollapsed) {
    panelFlujo.classList.add('collapsed');
    btnColapsar.setAttribute('aria-expanded', 'false');
    setGridRows(true, false);
}

btnColapsar.addEventListener('click', () => {
    const collapsed = panelFlujo.classList.toggle('collapsed');
    btnColapsar.setAttribute('aria-expanded', String(!collapsed));
    setGridRows(collapsed, true);
    localStorage.setItem('mx-flujo-collapsed', collapsed ? '1' : '0');
});

window.addEventListener('resize', () => {
    if (isDesktopGrid()) {
        if (!panelFlujo.classList.contains('collapsed')) initGridRows();
    } else {
        panelClinico.style.height = '';
    }
});
document.getElementById('pt-sexo').addEventListener('change', evaluar);
