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
let ultimoAnalisis = { hallazgos: [], patrones: [] };

const tabs = document.querySelectorAll('.tab-nav');
const paneles = document.querySelectorAll('main > .panel, .col3-wrapper > .panel');
const examenesSubtabsBar = document.getElementById('examenes-subtabs-bar');

const EXAMENES_SUBTAB_PANELS = new Set(['panel-hema', 'panel-bioquim', 'panel-uri', 'panel-endo']);
let activeExamenPanel = 'panel-hema';

function activateTab(targetId) {
    const isExamenesSubPanel = EXAMENES_SUBTAB_PANELS.has(targetId);
    const isExamenesTab = targetId === 'examenes';
    const showExamenes = isExamenesTab || isExamenesSubPanel;

    let actualPanelId;
    if (isExamenesTab) {
        actualPanelId = activeExamenPanel;
    } else if (isExamenesSubPanel) {
        activeExamenPanel = targetId;
        actualPanelId = targetId;
    } else {
        actualPanelId = targetId;
    }

    tabs.forEach(tab => {
        const isActive = showExamenes
            ? tab.dataset.target === 'examenes'
            : tab.dataset.target === targetId;
        tab.classList.toggle('activo', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });

    if (examenesSubtabsBar) examenesSubtabsBar.hidden = !showExamenes;

    if (showExamenes) {
        document.querySelectorAll('.tab-examenes').forEach(btn => {
            btn.classList.toggle('activo', btn.dataset.subtabTarget === activeExamenPanel);
        });
    }

    paneles.forEach(panel => {
        panel.classList.toggle('activo', panel.id === actualPanelId);
    });

    if (targetId === 'panel-paciente') syncMobPatientFromCanon();
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
});

document.querySelectorAll('.tab-examenes').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.subtabTarget));
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
    ultimoAnalisis = { hallazgos, patrones };

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

// ─── Sync mobile patient panel → canonical header inputs ──────────────────────

const MOB_TO_CANON_MAP = {
    'mob-pt-especie': 'pt-especie',
    'mob-pt-raza': 'pt-raza',
    'mob-pt-edad': 'pt-edad',
    'mob-pt-edad-unidad': 'pt-edad-unidad',
    'mob-pt-sexo': 'pt-sexo'
};

function syncMobPatientFromCanon() {
    Object.entries(MOB_TO_CANON_MAP).forEach(([mobId, canonId]) => {
        const mobEl = document.getElementById(mobId);
        const canonEl = document.getElementById(canonId);
        if (mobEl && canonEl) mobEl.value = canonEl.value;
    });
}

Object.entries(MOB_TO_CANON_MAP).forEach(([mobId, canonId]) => {
    const mobEl = document.getElementById(mobId);
    if (!mobEl) return;
    const eventType = mobEl.tagName === 'SELECT' ? 'change' : 'input';
    mobEl.addEventListener(eventType, () => {
        const canonEl = document.getElementById(canonId);
        if (canonEl) canonEl.value = mobEl.value;
        evaluar();
    });
});


// ─── Colapsar panel Flujo de trabajo ─────────────────────────────────────────
const panelFlujo = document.getElementById('panel-flujo');
const panelClinico = document.getElementById('panel-clinico');
const btnColapsar = document.getElementById('btn-colapsar-flujo');
const mainEl = document.querySelector('main');

let collapsedRow = '';
let expandedRow = '';

const isDesktopGrid = () => window.innerWidth > 1100;

function initGridRows() {
    if (!isDesktopGrid()) return;
    panelClinico.style.height = '';
    mainEl.style.gridTemplateRows = '1fr auto auto';

    const panelH = panelFlujo.getBoundingClientRect().height;
    const headerH = panelFlujo.querySelector('.panel-cabecera').getBoundingClientRect().height;
    if (panelH > 0) expandedRow = `${panelH}px`;
    if (headerH > 0) collapsedRow = `${headerH}px`;

    mainEl.style.gridTemplateRows = `1fr auto ${expandedRow || 'auto'}`;
    if (expandedRow) panelClinico.style.height = expandedRow;
}

function setGridRows(collapsed, animate) {
    if (!isDesktopGrid()) return;
    if (!animate) mainEl.style.transition = 'none';
    mainEl.style.gridTemplateRows = collapsed
        ? `1fr auto ${collapsedRow}`
        : `1fr auto ${expandedRow}`;
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
        document.querySelectorAll('.subpanel-anim').forEach(anim => {
            anim.style.height = '';
            anim.style.transition = '';
        });
        document.getElementById('subpanel-citologia')
            ?.querySelector('.subpanel-anim')
            ?.style.setProperty('height', '');
    }
});
document.getElementById('pt-sexo').addEventListener('change', evaluar);

document.querySelectorAll('.btn-colapsar-subpanel').forEach(btn => {
    const subpanel = btn.closest('.subpanel');
    const anim = subpanel.querySelector('.subpanel-anim');
    const storageKey = `mx-${subpanel.id}-collapsed`;
    const isFill = subpanel.id === 'subpanel-citologia';

    if (isDesktopGrid()) {
        if (!isFill) {
            anim.style.transition = 'none';
            anim.style.height = `${anim.scrollHeight}px`;
        }

        if (localStorage.getItem(storageKey) === '1') {
            subpanel.classList.add('collapsed');
            btn.setAttribute('aria-expanded', 'false');
            if (isFill) anim.style.transition = 'none';
            anim.style.height = '0px';
            if (isFill) { anim.offsetHeight; anim.style.transition = ''; }
        }

        if (!isFill) { anim.offsetHeight; anim.style.transition = ''; }
    }

    btn.addEventListener('click', () => {
        if (!isDesktopGrid()) return;
        const collapsed = subpanel.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', String(!collapsed));
        if (collapsed) {
            anim.style.height = `${anim.offsetHeight}px`;
            anim.offsetHeight;
            anim.style.height = '0px';
        } else {
            anim.style.height = `${anim.scrollHeight}px`;
            if (isFill) {
                anim.addEventListener('transitionend', () => {
                    anim.style.height = '';
                }, { once: true });
            }
        }
        localStorage.setItem(storageKey, collapsed ? '1' : '0');
    });
});

// ─── Colapsar patrones detectados ─────────────────────────────────────────────

const btnColapsarPatrones = document.getElementById('btn-colapsar-patrones');
const patronesAnim = document.getElementById('patrones-anim');

function colapsarPatrones(shouldCollapse) {
    if (!isDesktopGrid()) return;
    const isExpanded = btnColapsarPatrones.getAttribute('aria-expanded') === 'true';
    const collapse = shouldCollapse ?? isExpanded;

    if (collapse && isExpanded) {
        patronesAnim.style.height = `${patronesAnim.scrollHeight}px`;
        patronesAnim.offsetHeight;
        patronesAnim.style.height = '0px';
        btnColapsarPatrones.setAttribute('aria-expanded', 'false');
    } else if (!collapse && !isExpanded) {
        patronesAnim.style.height = `${patronesAnim.scrollHeight}px`;
        patronesAnim.addEventListener('transitionend', () => {
            if (btnColapsarPatrones.getAttribute('aria-expanded') === 'true') {
                patronesAnim.style.height = '';
            }
        }, { once: true });
        btnColapsarPatrones.setAttribute('aria-expanded', 'true');
    }
}

btnColapsarPatrones.addEventListener('click', () => colapsarPatrones());

// ─── Zonas de imagen ─────────────────────────────────────────────────────────

const imagenesDataUrl = [null, null];
const microscopioCaptures = [];
const MAX_MICRO_CAPTURES = 2;

// ── Zonas de muestra (file picker) ───────────────────────────────────────────
document.querySelectorAll('.zona-imagen').forEach(zona => {
    const idx = parseInt(zona.dataset.zona);
    const input = zona.querySelector('.input-zona');
    const vacia = zona.querySelector('.zona-vacia');
    const preview = zona.querySelector('.zona-img-preview');
    const btnQuitar = zona.querySelector('.btn-quitar-zona');

    zona.addEventListener('click', e => {
        if (btnQuitar.contains(e.target)) return;
        input.click();
    });

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            imagenesDataUrl[idx] = ev.target.result;
            preview.src = ev.target.result;
            preview.hidden = false;
            btnQuitar.hidden = false;
            vacia.hidden = true;
            zona.classList.add('con-imagen');
        };
        reader.readAsDataURL(file);
    });

    btnQuitar.addEventListener('click', e => {
        e.stopPropagation();
        imagenesDataUrl[idx] = null;
        preview.src = '';
        preview.hidden = true;
        btnQuitar.hidden = true;
        vacia.hidden = false;
        zona.classList.remove('con-imagen');
        input.value = '';
    });
});

// ── Zona microscopio (getUserMedia) ──────────────────────────────────────────
(function () {
    const zona = document.querySelector('.zona-microscopio');
    if (!zona) return;

    const micVacia = zona.querySelector('.micro-vacia');
    const video = zona.querySelector('.micro-video');
    const controles = zona.querySelector('.micro-controles');
    const btnGaleria = zona.querySelector('.micro-btn-galeria');
    const badge = zona.querySelector('.micro-badge');
    const btnCapturar = zona.querySelector('.micro-btn-capturar');
    const btnCerrar = zona.querySelector('.micro-btn-cerrar');
    const galeriaEl = zona.querySelector('.micro-galeria');

    let stream = null;
    let galeriaVisible = false;

    function stopStream() {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    function updateBadge() {
        const n = microscopioCaptures.length;
        badge.textContent = n;
        badge.hidden = n === 0;
        btnCapturar.disabled = n >= MAX_MICRO_CAPTURES;
    }

    function renderGaleria() {
        if (microscopioCaptures.length === 0) {
            galeriaEl.innerHTML = '<span class="micro-galeria-vacia">Sin capturas</span>';
            return;
        }
        galeriaEl.innerHTML = microscopioCaptures.map((src, i) => `
            <div class="micro-thumb">
                <img src="${src}" alt="Captura ${i + 1}">
                <button class="micro-thumb-quitar" type="button" data-capture-idx="${i}" aria-label="Eliminar captura ${i + 1}">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>`).join('');

        galeriaEl.querySelectorAll('.micro-thumb-quitar').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const i = parseInt(btn.dataset.captureIdx);
                microscopioCaptures.splice(i, 1);
                updateBadge();
                renderGaleria();
                if (microscopioCaptures.length === 0 && galeriaVisible) toggleGaleria();
            });
        });
    }

    function toggleGaleria() {
        galeriaVisible = !galeriaVisible;
        galeriaEl.hidden = !galeriaVisible;
        if (galeriaVisible) renderGaleria();
        btnGaleria.style.color = galeriaVisible ? 'var(--accent)' : '';
    }

    async function openCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }
            });
            video.srcObject = stream;
            video.hidden = false;
            micVacia.hidden = true;
            controles.hidden = false;
            updateBadge();
        } catch {
            // permission denied or unavailable — no fallback needed
        }
    }

    zona.addEventListener('click', e => {
        if (controles.contains(e.target) || galeriaEl.contains(e.target)) return;
        if (!stream) openCamera();
    });

    btnGaleria.addEventListener('click', e => {
        e.stopPropagation();
        toggleGaleria();
    });

    btnCapturar.addEventListener('click', e => {
        e.stopPropagation();
        if (microscopioCaptures.length >= MAX_MICRO_CAPTURES) return;
        const canvas = document.createElement('canvas');
        const MAX_PX = 1024;
        const scale = Math.min(MAX_PX / video.videoWidth, MAX_PX / video.videoHeight, 1);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        microscopioCaptures.push(canvas.toDataURL('image/jpeg', 0.85));
        updateBadge();
        if (galeriaVisible) renderGaleria();
    });

    btnCerrar.addEventListener('click', e => {
        e.stopPropagation();
        stopStream();
        video.hidden = true;
        video.srcObject = null;
        controles.hidden = true;
        galeriaEl.hidden = true;
        galeriaVisible = false;
        micVacia.hidden = false;
    });
})();

// ─── Autenticación ────────────────────────────────────────────────────────────

let sessionActiva = false;

const btnAuth = document.getElementById('btn-auth');
const modalAuth = document.getElementById('modal-auth');
const btnModalCerrar = document.getElementById('btn-modal-cerrar');
const modalTabs = document.querySelectorAll('.modal-tab');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');

const REGEX_NOMBRE = /^[\p{L}\s\-.]{2,100}$/u;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const REGEX_HF_KEY = /^hf_[A-Za-z0-9]{10,}$/;

function abrirModal(tab = 'login') {
    modalAuth.hidden = false;
    activarTabModal(tab);
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    modalAuth.hidden = true;
    document.body.style.overflow = '';
}

function activarTabModal(tab) {
    modalTabs.forEach(t => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('activo', active);
        t.setAttribute('aria-selected', active);
    });
    formLogin.hidden = tab !== 'login';
    formRegistro.hidden = tab !== 'registro';
}

btnAuth.addEventListener('click', () => sessionActiva ? cerrarSesion() : abrirModal('login'));
btnModalCerrar.addEventListener('click', cerrarModal);
modalAuth.addEventListener('click', e => { if (e.target === modalAuth) cerrarModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalAuth.hidden) cerrarModal(); });
modalTabs.forEach(t => t.addEventListener('click', () => activarTabModal(t.dataset.tab)));

function setFieldError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.previousElementSibling?.classList.toggle('invalido', !!msg);
}

function clearErrors(form) {
    form.querySelectorAll('.error-campo').forEach(el => el.textContent = '');
    form.querySelectorAll('input').forEach(el => el.classList.remove('invalido'));
}

function showMsg(id, msg, tipo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `mensaje-form ${tipo}`;
    el.hidden = !msg;
}

formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(formLogin);
    showMsg('msg-login', '', '');

    const email = formLogin.email.value.trim();
    const password = formLogin.password.value;
    let ok = true;

    if (!REGEX_EMAIL.test(email)) { setFieldError('err-login-email', 'Correo electrónico inválido'); ok = false; }
    if (!password) { setFieldError('err-login-pass', 'Ingresa tu contraseña'); ok = false; }
    if (!ok) return;

    const btn = formLogin.querySelector('.modal-submit');
    btn.disabled = true;
    try {
        const res = await fetch('api/actions/login.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            sessionActiva = true;
            actualizarHeaderAuth(data.nombre);
            cerrarModal();
        } else {
            showMsg('msg-login', data.error ?? 'Error al iniciar sesión', 'error');
        }
    } catch {
        showMsg('msg-login', 'Error de red. Inténtalo de nuevo.', 'error');
    } finally {
        btn.disabled = false;
    }
});

formRegistro.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(formRegistro);
    showMsg('msg-registro', '', '');

    const nombre = formRegistro.nombre.value.trim();
    const email = formRegistro.email.value.trim();
    const password = formRegistro.password.value;
    const password2 = formRegistro.password2.value;
    const hf_key = formRegistro.hf_key.value.trim();
    let ok = true;

    if (!REGEX_NOMBRE.test(nombre)) { setFieldError('err-reg-nombre', 'Nombre inválido (2–100 caracteres, solo letras)'); ok = false; }
    if (!REGEX_EMAIL.test(email)) { setFieldError('err-reg-email', 'Correo electrónico inválido'); ok = false; }
    if (!REGEX_PASSWORD.test(password)) { setFieldError('err-reg-pass', 'Mín. 8 caracteres, una mayúscula, una minúscula y un número'); ok = false; }
    if (password !== password2) { setFieldError('err-reg-pass2', 'Las contraseñas no coinciden'); ok = false; }
    if (!REGEX_HF_KEY.test(hf_key)) { setFieldError('err-reg-hfkey', 'API Key inválida (debe comenzar con hf_ seguido de al menos 10 caracteres)'); ok = false; }
    if (!ok) return;

    const btn = formRegistro.querySelector('.modal-submit');
    btn.disabled = true;
    try {
        const res = await fetch('api/actions/register.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password, password2, hf_key })
        });
        const data = await res.json();
        if (res.ok) {
            showMsg('msg-registro', '¡Cuenta creada! Ahora inicia sesión.', 'exito');
            setTimeout(() => {
                formRegistro.reset();
                clearErrors(formRegistro);
                activarTabModal('login');
                showMsg('msg-registro', '', '');
            }, 1500);
        } else if (data.errors) {
            const idMap = { nombre: 'err-reg-nombre', email: 'err-reg-email', password: 'err-reg-pass', password2: 'err-reg-pass2', hf_key: 'err-reg-hfkey' };
            Object.entries(data.errors).forEach(([f, m]) => { if (idMap[f]) setFieldError(idMap[f], m); });
        } else {
            showMsg('msg-registro', data.error ?? 'Error al registrarse', 'error');
        }
    } catch {
        showMsg('msg-registro', 'Error de red. Inténtalo de nuevo.', 'error');
    } finally {
        btn.disabled = false;
    }
});

function actualizarHeaderAuth(nombre) {
    btnAuth.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${nombre}`;
    btnAuth.title = 'Cerrar sesión';
}

async function cerrarSesion() {
    try { await fetch('api/actions/logout.php', { method: 'POST' }); } catch {}
    sessionActiva = false;
    btnAuth.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Iniciar sesión`;
    btnAuth.title = '';
}

(async () => {
    try {
        const res = await fetch('api/actions/session.php');
        const data = await res.json();
        if (data.loggedIn) { sessionActiva = true; actualizarHeaderAuth(data.nombre); }
    } catch {}
})();

// ─── Backend IA config ────────────────────────────────────────────────────────

const BACKEND_KEY = 'mx-ia-backend';
const OLLAMA_URL_KEY = 'mx-ia-ollama-url';
const OLLAMA_MOD_KEY = 'mx-ia-ollama-model';
const HF_MOD_KEY = 'mx-ia-hf-model';

function initBackendConfig() {
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

initBackendConfig();

// ─── Integración HuggingFace / medGemma ──────────────────────────────────────

function construirPrompt() {
    const paciente = obtenerDatosPaciente();
    const valores = obtenerValoresFormulario();
    const { hallazgos, patrones } = ultimoAnalisis;
    const signosText = document.getElementById('signos-clinicos').value.trim();
    const refEspecie = paciente.especie ? (referencias[paciente.especie] || {}) : {};

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

        return `Eres un médico veterinario especialista en patología clínica. Sólo responderás consultas asociadas a ésta área de conocimiento y basado en la evidencia proporcionada. 
        Si te envían imágenes de citología debes hacer una revisión exhaustiva de la morfología celular, identificar lesiones, patrones anormales, presencia
        de hemoparásitos intracelulares y extracelulares o inclusiones citoplasmáticas.
        Analiza los resultados y proporciona una interpretación clínica concisa en español.
        

        Paciente: ${paciente.especie || 'desconocido'}, raza: ${paciente.raza || 'NE'}, edad: ${edadTexto}, sexo: ${paciente.sexo || 'NE'}

        Resultados de laboratorio:
        ${lineasValores}

        Patrones detectados:
        ${lineasPatrones}
        ${signosText ? `\nSignos clínicos: ${signosText}` : ''}
        Proporciona una interpretación clínica breve (3-5 oraciones) destacando los hallazgos más significativos y las recomendaciones diagnósticas inmediatas.`;
        }

async function llamarIA() {
    const salidaEl = document.getElementById('salida-ia');
    const backend = document.querySelector('input[name="ia-backend"]:checked')?.value ?? 'hf';

    if (backend === 'hf' && !sessionActiva) {
        salidaEl.textContent = 'Inicia sesión para usar el análisis IA con HuggingFace.';
        abrirModal('login');
        return;
    }

    salidaEl.textContent = 'Consultando al modelo de I.A…';
    salidaEl.classList.add('cargando');

    try {
        if (backend === 'local') {
            await _llamarOllama(salidaEl);
        } else {
            await _llamarHuggingFace(salidaEl);
        }
    } finally {
        salidaEl.classList.remove('cargando');
    }
}

async function _llamarOllama(salidaEl) {
    const baseUrl = (document.getElementById('ia-ollama-url')?.value ?? 'http://localhost:11434').replace(/\/$/, '');
    const model = document.getElementById('ia-ollama-model')?.value?.trim() || 'medgemma:4b';
    const prompt = construirPrompt();
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
            salidaEl.textContent = data?.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.';
        }
    } catch {
        salidaEl.textContent = `No se pudo conectar con Ollama en ${baseUrl}. Verifica que esté ejecutándose con "ollama serve".`;
    }
}

async function _llamarHuggingFace(salidaEl) {
    const model = document.getElementById('ia-hf-model')?.value || 'unsloth/medgemma-4b-it';
    try {
        const res = await fetch('api/actions/medgemma.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: construirPrompt(),
                images: [...imagenesDataUrl.filter(Boolean), ...microscopioCaptures],
                model,
            })
        });

        if (res.status === 401) {
            sessionActiva = false;
            salidaEl.textContent = 'Sesión expirada. Por favor inicia sesión de nuevo.';
            abrirModal('login');
            return;
        }

        let data;
        try { data = await res.json(); } catch {
            salidaEl.textContent = `Error del servidor (HTTP ${res.status}). Intenta de nuevo.`;
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
            salidaEl.textContent = data?.choices?.[0]?.message?.content ?? 'Sin respuesta del modelo.';
        }
    } catch (e) {
        salidaEl.textContent = `Error de red: ${e.message}`;
    }
}

document.querySelector('.boton-analizar').addEventListener('click', () => {
    colapsarPatrones(true);
    llamarIA();
});
