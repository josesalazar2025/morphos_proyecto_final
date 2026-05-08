// Client-side PDF text extraction and lab-value parsing (no data leaves the browser)

const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Each entry: field name (matches input[name="…"]) → regex that identifies the analyte in PDF text
const ANALYTE_DEFS = [
    // Hematología
    { field: 'rbc',           re: /\b(?:eritrocit\w*|gl[oó]bulos?\s+rojos?|r\.?b\.?c\.?)\b/i },
    { field: 'hgb',           re: /\b(?:hemoglobin[ao]?\w*|hgb|hb)\b(?!a\d)/i },
    { field: 'hct',           re: /\b(?:hematocrit[oo]?\w*|hct|pcv)\b/i },
    { field: 'vcm',           re: /\b(?:v\.?c\.?m\.?|m\.?c\.?v\.?|vol(?:umen)?\s+corp\w*)\b/i },
    { field: 'hcm',           re: /\b(?:h\.?c\.?m\.?|m\.?c\.?h\.?)\b/i },
    { field: 'wbc',           re: /\b(?:leucocit\w*|w\.?b\.?c\.?|white\s+blood\s+cell)\b/i },
    { field: 'neutro',        re: /\b(?:neutr[oó]fil\w*|neut\b|neu\b)\b/i },
    { field: 'linfo',         re: /\b(?:linf[oa]cit\w*|lymph\w*|linf\b)\b/i },
    { field: 'eosino',        re: /\b(?:eosino\w*|eos\b)\b/i },
    { field: 'baso',          re: /\b(?:bas[oó]fil\w*|baso\b)\b/i },
    { field: 'plt',           re: /\b(?:plaqueta\w*|platelet\w*|plt\b|trc\b)\b/i },
    // Bioquímica sanguínea
    { field: 'alt',           re: /\b(?:alt\b|gpt\b|alanin[ao]?\s+amino\w*)\b/i },
    { field: 'ast',           re: /\b(?:ast\b|got\b|aspart\w*)\b/i },
    { field: 'fal',           re: /\b(?:fal\b|alp\b|fosfatasa\s+alcalin\w*|alkaline\s+phosph\w*)\b/i },
    { field: 'bun',           re: /\b(?:bun\b|urea\b|nitr[oó]geno\s+ureico)\b/i },
    { field: 'creat',         re: /\b(?:creatinin[ao]?\w*|crea\b)\b/i },
    { field: 'gluc',          re: /\b(?:gluco(?:sa|se)\b|glucemia\b|glu\b)\b/i },
    { field: 'prot',          re: /\b(?:prote[íi]nas?\s+totales?|prot\s+total)\b/i },
    { field: 'alb',           re: /\b(?:alb[úu]min[ao]?\w*|alb\b)\b/i },
    { field: 'bili',          re: /\b(?:bilirrub\w*|bilirubin\w*|bili\b|tbil\b)\b/i },
    { field: 'fosf',          re: /\b(?:f[oó]sforo\b|phosph\w*|phos\b)\b/i },
    { field: 'calc',          re: /\b(?:calcio\b|calcium\b)\b/i },
    { field: 'sodio',         re: /\b(?:sodio\b|sodium\b)\b/i },
    { field: 'potasio',       re: /\b(?:potasio\b|potassium\b)\b/i },
    { field: 'cloro',         re: /\b(?:clor[ou]\w*|chloride\w*)\b/i },
    // Perfil Endocrino
    { field: 'cortisol_bas',  re: /\b(?:cortisol\s+bas[ae]?l?)\b/i },
    { field: 'cortisol_acth', re: /\b(?:cortisol\s+(?:post[-\s]?acth|post)\b)/i },
    { field: 't4_total',      re: /\b(?:t4\s+total|t4\s+libre|tiroxin\w*|thyroxin\w*)\b/i },
    { field: 'insulina',      re: /\b(?:insulin[ao]?\w*)\b/i },
    // Urianálisis — numeric
    { field: 'usg',           re: /\b(?:usg\b|densidad\s+(?:urin|orin)\w*|gravedad\s+esp\w*)\b/i },
    { field: 'ph',            re: /\b(?:ph\s+(?:urin|orin)\w*|ph\s+orina)\b/i },
];

// Semiquantitative select fields
const SEMI_DEFS = [
    { field: 'uri-prot', re: /\b(?:prote[íi]nas?\s*(?:en\s*orina?|urin\w*)?|proteinuria)\b/i },
    { field: 'uri-gluc', re: /\b(?:glucosuria\b|glucosa\s+(?:en\s*)?orina\w*)\b/i },
];

function parseSemiQuantitative(text) {
    const t = text.toLowerCase();
    if (/negati|nég|neg\b|ausente|absent|no\s+detect/.test(t)) return 'neg';
    if (/\+{3}/.test(t)) return '+++';
    if (/\+{2}/.test(t)) return '++';
    if (/\+/.test(t)) return '+';
    if (/traz|trace/.test(t)) return '+';
    return null;
}

function extractFirstNumber(text) {
    const m = text.match(/(?:^|[\s:=])(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return isFinite(v) && v > 0 ? v : null;
}

function parseLabText(rawText) {
    const results = {};

    for (const def of ANALYTE_DEFS) {
        if (results[def.field] !== undefined) continue;
        const match = def.re.exec(rawText);
        if (!match) continue;
        const lookAhead = rawText.slice(match.index + match[0].length, match.index + match[0].length + 150);
        const num = extractFirstNumber(lookAhead);
        if (num !== null) results[def.field] = num;
    }

    for (const def of SEMI_DEFS) {
        if (results[def.field] !== undefined) continue;
        const match = def.re.exec(rawText);
        if (!match) continue;
        const context = rawText.slice(match.index, match.index + 80);
        const val = parseSemiQuantitative(context);
        if (val) results[def.field] = val;
    }

    return results;
}

async function extractPdfText(file) {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) throw new Error('PDF.js no cargado');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        pages.push(content.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join(''));
    }
    return pages.join('\n');
}

function applyToForm(results, evaluar) {
    let count = 0;
    for (const [field, value] of Object.entries(results)) {
        const el = document.querySelector(`[name="${field}"]`);
        if (!el) continue;
        if (el.tagName === 'SELECT') {
            if ([...el.options].some(o => o.value === value)) {
                el.value = value;
                count++;
            }
        } else {
            el.value = value;
            count++;
        }
    }
    if (count > 0) evaluar();
    return count;
}

function showToast(msg, error = false) {
    let el = document.getElementById('pdf-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'pdf-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'pdf-toast' + (error ? ' pdf-toast--error' : '');
    el.classList.add('pdf-toast--show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('pdf-toast--show'), 3500);
}

export function initPdfParser(evaluar) {
    document.querySelectorAll('.btn-importar-pdf').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            document.getElementById(`pdf-input-${btn.dataset.panel}`)?.click();
        });
    });

    document.querySelectorAll('.pdf-input').forEach(input => {
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            input.value = '';
            try {
                const text = await extractPdfText(file);
                const results = parseLabText(text);
                const count = applyToForm(results, evaluar);
                showToast(count > 0
                    ? `${count} campo${count !== 1 ? 's' : ''} importado${count !== 1 ? 's' : ''} del PDF.`
                    : 'No se encontraron valores reconocibles en el PDF.', count === 0);
            } catch {
                showToast('Error al leer el PDF. ¿Es un PDF con texto (no escaneado)?', true);
            }
        });
    });
}
