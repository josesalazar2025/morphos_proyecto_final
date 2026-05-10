const PROXY_URL = 'api/papers_proxy.php';
const POR_PAGINA = 10;

let todosLosPapers = [];
let paginaActual = 0;
let consultaActual = '';

const TERMINOS_EN = {
    'Anemia': 'anemia',
    'Eritrocitosis': 'erythrocytosis polycythemia',
    'Leucocitosis': 'leukocytosis',
    'Leucocitosis neutrofílica': 'neutrophilic leukocytosis',
    'Leucocitosis linfocítica': 'lymphocytic leukocytosis',
    'Leucopenia': 'leukopenia',
    'Eosinofilia': 'eosinophilia',
    'Neutropenia': 'neutropenia',
    'Linfopenia': 'lymphopenia',
    'Trombocitopenia': 'thrombocytopenia',
    'Trombocitosis': 'thrombocytosis',
    'Daño hepatocelular': 'hepatocellular damage liver injury',
    'Elevación de ALT aislada': 'ALT elevation liver',
    'Patrón colestásico': 'cholestasis',
    'Hiperbilirrubinemia': 'hyperbilirubinemia jaundice',
    'Azotemia': 'azotemia renal failure',
    'Hiperuremia aislada (BUN)': 'elevated BUN prerenal azotemia',
    'BUN disminuido': 'low BUN hepatic failure',
    'Creatinina elevada (BUN normal)': 'elevated creatinine kidney',
    'Hiperglucemia': 'hyperglycemia diabetes mellitus',
    'Hipoglucemia': 'hypoglycemia',
    'Hiperproteinemia': 'hyperproteinemia',
    'Hipoproteinemia / Hipoalbuminemia': 'hypoproteinemia hypoalbuminemia',
    'Hipoalbuminemia': 'hypoalbuminemia',
    'Hipercalcemia': 'hypercalcemia',
    'Hipocalcemia': 'hypocalcemia',
    'Hipernatremia': 'hypernatremia',
    'Hiponatremia': 'hyponatremia',
    'Hiperpotasemia': 'hyperkalemia',
    'Hipopotasemia': 'hypokalemia',
    'Hiperfosforemia': 'hyperphosphatemia',
    'Hipotiroidismo': 'hypothyroidism',
    'Hipertiroidismo': 'hyperthyroidism',
    'Hiperadrenocorticismo (Cushing)': 'hyperadrenocorticism Cushing',
    'Hipoadrenocorticismo (Addison)': 'hypoadrenocorticism Addison',
    'Ratio Na:K reducido — sospecha de hipoadrenocorticismo': 'hypoadrenocorticism sodium potassium ratio',
};

const traducirPatron = (nombre) => {
    for (const [es, en] of Object.entries(TERMINOS_EN)) {
        if (nombre.startsWith(es)) return en;
    }
    return nombre.replace(/[áéíóúñ]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n'})[c] || c);
};

const construirQuery = (patrones) => {
    if (!patrones || patrones.length === 0) return 'veterinary clinical laboratory diagnosis canine feline';
    const terminos = [...new Set(patrones.map(p => traducirPatron(p.nombre)))].slice(0, 3);
    return `${terminos.join(' ')} canine OR feline veterinary`;
};

const buscarPapers = async (query) => {
    const respuesta = await fetch(`${PROXY_URL}?query=${encodeURIComponent(query)}`);
    if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => ({}));
        throw new Error(detalle.error || `Error ${respuesta.status}`);
    }
    const datos = await respuesta.json();
    return datos.data || [];
};

const renderizarTarjetaPaper = (paper) => {
    const titulo = paper.title || 'Sin título';
    const autores = paper.authors?.slice(0, 3).map(a => a.name).join(', ') || 'Autores desconocidos';
    const masAutores = (paper.authors?.length || 0) > 3 ? ' et al.' : '';
    const anio = paper.year || '—';
    const revista = paper.journal || '';
    const resumen = paper.abstract
        ? (paper.abstract.length > 280 ? paper.abstract.slice(0, 280) + '…' : paper.abstract)
        : '';

    const urlPdf = paper.pdf || null;
    const urlDoi = paper.doi ? `https://doi.org/${paper.doi}` : null;
    const urlPubmed = paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : null;
    const urlPrincipal = urlPdf || urlDoi || urlPubmed;

    return `
        <article class="paper-tarjeta">
            <div class="paper-meta">
                <span class="paper-anio">${anio}</span>
                ${revista ? `<span class="paper-revista">${revista}</span>` : ''}
                ${urlPdf ? `<a class="paper-pdf-badge" href="${urlPdf}" target="_blank" rel="noopener noreferrer">PDF</a>` : ''}
            </div>
            <h3 class="paper-titulo">
                ${urlPrincipal
                    ? `<a href="${urlPrincipal}" target="_blank" rel="noopener noreferrer">${titulo}</a>`
                    : titulo}
            </h3>
            <p class="paper-autores">${autores}${masAutores}</p>
            ${resumen ? `<p class="paper-resumen">${resumen}</p>` : ''}
        </article>`;
};

const renderizarPaginacion = () => {
    const totalPaginas = Math.ceil(todosLosPapers.length / POR_PAGINA);
    const contenedor = document.getElementById('papers-paginacion');
    if (!contenedor) return;

    if (totalPaginas <= 1) {
        contenedor.innerHTML = '';
        return;
    }

    const inicio = Math.max(0, paginaActual - 2);
    const fin = Math.min(totalPaginas, inicio + 5);

    let html = `<button class="papers-pag-btn" data-pagina="${paginaActual - 1}" ${paginaActual === 0 ? 'disabled' : ''} aria-label="Página anterior"><img src="assets/icons/anterior.svg" alt="" aria-hidden="true" width="16" height="16"></button>`;
    for (let i = inicio; i < fin; i++) {
        html += `<button class="papers-pag-btn ${i === paginaActual ? 'activo' : ''}" data-pagina="${i}">${i + 1}</button>`;
    }
    html += `<button class="papers-pag-btn" data-pagina="${paginaActual + 1}" ${paginaActual >= totalPaginas - 1 ? 'disabled' : ''} aria-label="Página siguiente"><img src="assets/icons/siguiente.svg" alt="" aria-hidden="true" width="16" height="16"></button>`;

    contenedor.innerHTML = html;
};

const renderizarPaginaActual = () => {
    const lista = document.getElementById('papers-lista');
    if (!lista) return;

    const inicio = paginaActual * POR_PAGINA;
    const pagina = todosLosPapers.slice(inicio, inicio + POR_PAGINA);

    lista.innerHTML = pagina.length === 0
        ? '<p class="papers-vacio">No se encontraron artículos para esta búsqueda.</p>'
        : pagina.map(renderizarTarjetaPaper).join('');

    renderizarPaginacion();
    lista.scrollTop = 0;
};

const irAPagina = (numeroPagina) => {
    const totalPaginas = Math.ceil(todosLosPapers.length / POR_PAGINA);
    if (numeroPagina < 0 || numeroPagina >= totalPaginas) return;
    paginaActual = numeroPagina;
    renderizarPaginaActual();
};

const mostrarEstadoCarga = () => {
    const lista = document.getElementById('papers-lista');
    if (lista) lista.innerHTML = '<p class="papers-cargando">Buscando artículos científicos…</p>';
    const paginacion = document.getElementById('papers-paginacion');
    if (paginacion) paginacion.innerHTML = '';
};

const mostrarError = (mensaje) => {
    const lista = document.getElementById('papers-lista');
    if (lista) lista.innerHTML = `<p class="papers-error">${mensaje}</p>`;
};

export const abrirModalPapers = async (patrones) => {
    const modal = document.getElementById('modal-papers');
    const overlay = document.getElementById('modal-papers-overlay');
    if (!modal || !overlay) return;

    const nuevaConsulta = construirQuery(patrones);

    modal.removeAttribute('hidden');
    overlay.classList.add('activo');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('visible'));

    const etiquetaConsulta = document.getElementById('papers-consulta');
    if (etiquetaConsulta) etiquetaConsulta.textContent = `"${nuevaConsulta}"`;

    if (nuevaConsulta === consultaActual && todosLosPapers.length > 0) {
        renderizarPaginaActual();
        return;
    }

    consultaActual = nuevaConsulta;
    todosLosPapers = [];
    paginaActual = 0;
    mostrarEstadoCarga();

    try {
        todosLosPapers = await buscarPapers(nuevaConsulta);
        renderizarPaginaActual();
    } catch (error) {
        mostrarError(error.message || 'No se pudo conectar con Semantic Scholar. Intenta de nuevo más tarde.');
        console.error('Error buscando papers:', error);
    }
};

export const cerrarModalPapers = () => {
    const modal = document.getElementById('modal-papers');
    const overlay = document.getElementById('modal-papers-overlay');
    if (!modal || !overlay) return;

    modal.classList.remove('visible');
    overlay.classList.remove('activo');
    document.body.style.overflow = '';
    setTimeout(() => modal.setAttribute('hidden', ''), 250);
};

export const inicializarModalPapers = () => {
    document.getElementById('modal-papers-cerrar')?.addEventListener('click', cerrarModalPapers);
    document.getElementById('modal-papers-overlay')?.addEventListener('click', cerrarModalPapers);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('modal-papers');
            if (modal && !modal.hidden) cerrarModalPapers();
        }
    });

    document.getElementById('papers-paginacion')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.papers-pag-btn');
        if (!btn || btn.disabled) return;
        irAPagina(parseInt(btn.dataset.pagina, 10));
    });

    document.getElementById('papers-busqueda-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('papers-busqueda-input');
        const termino = input?.value.trim();
        if (!termino) return;

        const etiquetaConsulta = document.getElementById('papers-consulta');
        if (etiquetaConsulta) etiquetaConsulta.textContent = `"${termino}"`;

        consultaActual = termino;
        todosLosPapers = [];
        paginaActual = 0;
        mostrarEstadoCarga();

        try {
            todosLosPapers = await buscarPapers(termino);
            renderizarPaginaActual();
        } catch (error) {
            mostrarError(error.message || 'No se pudo conectar con Semantic Scholar. Intenta de nuevo más tarde.');
            console.error('Error buscando papers:', error);
        }
    });
};
