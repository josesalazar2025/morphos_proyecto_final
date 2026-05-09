// Navegación-Pestañas

const tabs = document.querySelectorAll('.tab-nav');
const paneles = document.querySelectorAll('main > .panel, .col3-wrapper > .panel');
const examenesSubtabsBar = document.getElementById('examenes-subtabs-bar');

const EXAMENES_SUBTAB_PANELS = new Set(['panel-hema', 'panel-bioquim', 'panel-uri', 'panel-endo']);
let activeExamenPanel = 'panel-hema';
let activePanel = 'panel-flujo';

const SWIPE_ORDER = ['panel-flujo', 'panel-paciente', 'panel-hema', 'panel-bioquim', 'panel-uri', 'panel-endo', 'panel-imagenes', 'panel-resultados'];

export function activateTab(targetId) {
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

    activePanel = actualPanelId;
    if (targetId === 'panel-paciente') syncMobPatientFromCanon();
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
});

document.querySelectorAll('.tab-examenes').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.subtabTarget));
});

// Swipe para navegar entre secciones

let swipeStartX = 0;
let swipeStartY = 0;

document.querySelector('main').addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.querySelector('main').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = SWIPE_ORDER.indexOf(activePanel);
    const next = dx < 0 ? SWIPE_ORDER[idx + 1] : SWIPE_ORDER[idx - 1];
    if (next) activateTab(next);
}, { passive: true });

// Sincronizacón de datos de pacientes en mobile

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

export function initMobSync(evaluar) {
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
}

// Filas de grid

const panelFlujo = document.getElementById('panel-flujo');
const btnColapsar = document.getElementById('btn-colapsar-flujo');
const mainEl = document.querySelector('main');

let collapsedRow = '';
let expandedRow = '';

export const isDesktopGrid = () => window.innerWidth > 1100;

function initGridRows() {
    if (!isDesktopGrid()) return;
    mainEl.style.gridTemplateRows = '1fr auto auto';

    const panelH = panelFlujo.getBoundingClientRect().height;
    const headerH = panelFlujo.querySelector('.panel-cabecera').getBoundingClientRect().height;
    if (panelH > 0) expandedRow = `${panelH}px`;
    if (headerH > 0) collapsedRow = `${headerH}px`;

    mainEl.style.gridTemplateRows = `1fr auto ${expandedRow || 'auto'}`;
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
    if (!collapsed) {
        ['panel-endo', 'panel-uri'].forEach(id => {
            const sp = document.getElementById(id);
            if (sp) setSubpanelCollapsed(sp, true);
        });
    }
});

window.addEventListener('resize', () => {
    if (isDesktopGrid()) {
        if (!panelFlujo.classList.contains('collapsed')) initGridRows();
    } else {
        document.querySelectorAll('.subpanel-anim').forEach(anim => {
            anim.style.height = '';
            anim.style.transition = '';
        });
        document.getElementById('subpanel-citologia')
            ?.querySelector('.subpanel-anim')
            ?.style.setProperty('height', '');
    }
});

// Paneles colapsables

function setSubpanelCollapsed(subpanel, shouldCollapse) {
    if (!isDesktopGrid()) return;
    const anim = subpanel.querySelector('.subpanel-anim');
    const btn = subpanel.querySelector('.btn-colapsar-subpanel');
    const isFill = subpanel.id === 'subpanel-citologia';
    if (shouldCollapse === subpanel.classList.contains('collapsed')) return;
    subpanel.classList.toggle('collapsed', shouldCollapse);
    if (btn) btn.setAttribute('aria-expanded', String(!shouldCollapse));
    if (shouldCollapse) {
        anim.style.height = `${anim.offsetHeight}px`;
        anim.offsetHeight;
        anim.style.height = '0px';
    } else {
        anim.style.height = `${anim.scrollHeight}px`;
        if (isFill) {
            anim.addEventListener('transitionend', () => { anim.style.height = ''; }, { once: true });
        }
    }
    localStorage.setItem(`mx-${subpanel.id}-collapsed`, shouldCollapse ? '1' : '0');
}

const LINKED_SUBPANEL_IDS = ['panel-endo', 'panel-uri'];

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

    btn.addEventListener('click', (e) => {
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

        if (LINKED_SUBPANEL_IDS.includes(subpanel.id)) {
            LINKED_SUBPANEL_IDS.forEach(id => {
                if (id !== subpanel.id) {
                    const partner = document.getElementById(id);
                    if (partner) setSubpanelCollapsed(partner, collapsed);
                }
            });
        }
    });
});

// Patrones de paneles colapsables

const btnColapsarPatrones = document.getElementById('btn-colapsar-patrones');
const patronesAnim = document.getElementById('patrones-anim');

export function colapsarPatrones(shouldCollapse) {
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

// Imágenes

export const imagenesDataUrl = [null, null];
export const microscopioCaptures = [];
const MAX_MICRO_CAPTURES = 4;

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

// Captura de microscopio

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
