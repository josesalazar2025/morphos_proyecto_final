import { analizarResultados } from './analisis.js';

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

// Inject a status span before each number input (runs once at module load)
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


// ─── Evaluación principal ─────────────────────────────────────────────────────

const evaluar = () => {
    const paciente = obtenerDatosPaciente();

    if (!paciente.especie || !referencias[paciente.especie]) {
        actualizarClasesInputs([]);
        renderizarPatrones([]);
        return;
    }

    const valores = obtenerValoresFormulario();
    const { hallazgos, patrones } = analizarResultados(valores, paciente, referencias, alteraciones);

    actualizarClasesInputs(hallazgos);
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

document.querySelectorAll('.btn-colapsar-subpanel').forEach(btn => {
    const subpanel = btn.closest('.subpanel');
    const anim    = subpanel.querySelector('.subpanel-anim');
    const storageKey = `mx-${subpanel.id}-collapsed`;

    anim.style.transition = 'none';
    anim.style.height = `${anim.scrollHeight}px`;

    if (localStorage.getItem(storageKey) === '1') {
        subpanel.classList.add('collapsed');
        btn.setAttribute('aria-expanded', 'false');
        anim.style.height = '0px';
    }

    anim.offsetHeight;
    anim.style.transition = '';

    btn.addEventListener('click', () => {
        const collapsed = subpanel.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', String(!collapsed));
        anim.style.height = collapsed ? '0px' : `${anim.scrollHeight}px`;
        localStorage.setItem(storageKey, collapsed ? '1' : '0');
    });
});

// ─── Colapsar patrones detectados ─────────────────────────────────────────────

const btnColapsarPatrones = document.getElementById('btn-colapsar-patrones');
const patronesAnim = document.getElementById('patrones-anim');

function colapsarPatrones(shouldCollapse) {
    const isExpanded = btnColapsarPatrones.getAttribute('aria-expanded') === 'true';
    const collapse = shouldCollapse ?? isExpanded;

    if (collapse && isExpanded) {
        // Snapshot px height before animating to 0
        patronesAnim.style.height = `${patronesAnim.scrollHeight}px`;
        patronesAnim.offsetHeight;
        patronesAnim.style.height = '0px';
        btnColapsarPatrones.setAttribute('aria-expanded', 'false');
    } else if (!collapse && !isExpanded) {
        patronesAnim.style.height = `${patronesAnim.scrollHeight}px`;
        patronesAnim.addEventListener('transitionend', () => {
            // Remove fixed height so content can grow naturally as patterns update
            if (btnColapsarPatrones.getAttribute('aria-expanded') === 'true') {
                patronesAnim.style.height = '';
            }
        }, { once: true });
        btnColapsarPatrones.setAttribute('aria-expanded', 'true');
    }
}

btnColapsarPatrones.addEventListener('click', () => colapsarPatrones());

document.querySelector('.boton-analizar').addEventListener('click', () => {
    colapsarPatrones(true);
});
