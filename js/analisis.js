// ─────────────────────────────────────────────────────────────────────────────
// analisis.js — Clasificación clínica de parámetros analíticos veterinarios
// ─────────────────────────────────────────────────────────────────────────────


// ─── Gravedad ─────────────────────────────────────────────────────────────────
// La desviación se mide en múltiplos del ancho del rango de referencia.
// Ej: rango WBC 6-17 (ancho = 11). WBC = 28 → desviación = 11/11 = 1.0 → moderado.

const UMBRALES_GRAVEDAD = { leve: 0.5, moderado: 1.5 };

const clasificarGravedad = (valor, ref) => {
    const rango = ref.superior - ref.inferior;
    const desviacion = valor > ref.superior
        ? (valor - ref.superior) / rango
        : (ref.inferior - valor) / rango;

    if (desviacion <= UMBRALES_GRAVEDAD.leve) return 'leve';
    if (desviacion <= UMBRALES_GRAVEDAD.moderado) return 'moderado';
    return 'grave';
};


// ─── Edad ─────────────────────────────────────────────────────────────────────


const categorizarEdad = (edadMeses, especie) => {
    if (edadMeses === null) return 'adulto';

    if (especie === 'canino') {
        if (edadMeses < 12) return 'cachorro';
        if (edadMeses < 84) return 'adulto';
        if (edadMeses < 120) return 'senior';
        return 'geriatrico';
    }

    // felino
    if (edadMeses < 12) return 'cachorro';
    if (edadMeses < 120) return 'adulto';
    return 'senior';
};


// ─── Ajustes por edad ─────────────────────────────────────────────────────────
// Factores multiplicativos aplicados sobre los límites de referencia estándar.
// La ALP fisiológicamente alta en animales jóvenes (crecimiento óseo activo)
// es el ajuste más relevante en la práctica clínica.

const AJUSTES_EDAD = {
    canino: {
        cachorro: { alp: { superior: 3.0 }, wbc: { superior: 1.25 } },
        adulto: {},
        senior: { bun: { superior: 1.15 }, creatinine: { superior: 1.15 } },
        geriatrico: { bun: { superior: 1.25 }, creatinine: { superior: 1.25 }, alp: { superior: 1.40 } }
    },
    felino: {
        cachorro: { alp: { superior: 2.0 }, wbc: { superior: 1.20 } },
        adulto: {},
        senior: { bun: { superior: 1.20 }, creatinine: { superior: 1.20 } }
    }
};


// ─── Ajustes por raza ─────────────────────────────────────────────────────────
// Los galgos y razas afines tienen eritrocitosis fisiológica y trombocitopenia
// fisiológica que no deben interpretarse como patológicas.

const AJUSTES_RAZA = {
    canino: [
        {
            razas: ['galgo', 'greyhound', 'whippet', 'lebrel'],
            ajustes: {
                rbc: { inferior: 1.15, superior: 1.15 },
                hgb: { inferior: 1.12, superior: 1.12 },
                hct: { inferior: 1.12, superior: 1.12 },
                platelets: { inferior: 0.75, superior: 0.75 }
            }
        },
        {
            razas: ['shiba', 'akita'],
            ajustes: {
                rbc: { inferior: 1.10, superior: 1.10 },
                hct: { inferior: 1.08, superior: 1.08 },
                hgb: { inferior: 1.08, superior: 1.08 }
            }
        }
    ]
};


// ─── Ajustes por sexo ─────────────────────────────────────────────────────────
// Los machos felinos tienen creatinina fisiológicamente más alta
// por su mayor masa muscular.

const AJUSTES_SEXO = {
    felino: {
        Macho: { creatinine: { superior: 1.15 } }
    }
};


const obtenerAjustesRaza = (raza, especie) => {
    const razaNorm = raza?.toLowerCase().trim() ?? '';
    const grupos = AJUSTES_RAZA[especie] ?? [];
    return grupos.find(g => g.razas.some(r => razaNorm.includes(r)))?.ajustes ?? {};
};


// ─── Ajuste de referencias ────────────────────────────────────────────────────

const ajustarReferencias = (refsEspecie, paciente) => {
    const catEdad = categorizarEdad(paciente.edadMeses, paciente.especie);
    const ajEdad = AJUSTES_EDAD[paciente.especie]?.[catEdad] ?? {};
    const ajRaza = obtenerAjustesRaza(paciente.raza, paciente.especie);
    const ajSexo = AJUSTES_SEXO[paciente.especie]?.[paciente.sexo] ?? {};

    return Object.entries(refsEspecie).reduce((acc, [clave, ref]) => {
        const fEdad = ajEdad[clave] ?? {};
        const fRaza = ajRaza[clave] ?? {};
        const fSexo = ajSexo[clave] ?? {};

        acc[clave] = {
            ...ref,
            inferior: ref.inferior * (fEdad.inferior ?? 1) * (fRaza.inferior ?? 1) * (fSexo.inferior ?? 1),
            superior: ref.superior * (fEdad.superior ?? 1) * (fRaza.superior ?? 1) * (fSexo.superior ?? 1)
        };
        return acc;
    }, {});
};


// ─── Detección de patrones clínicos ───────────────────────────────────────────

const detectarPatrones = (hallazgos, especie, alt) => {
    const mapa = hallazgos.reduce((acc, h) => { acc[h.clave] = h; return acc; }, {});

    const esAlto = (clave) => mapa[clave]?.direccion === 'alto';
    const esBajo = (clave) => mapa[clave]?.direccion === 'bajo';
    const presente = (clave) => clave in mapa;
    const valor = (clave) => mapa[clave]?.valor ?? null;

    // Devuelve la gravedad del primer parámetro presente de la lista
    const gravedadDe = (...claves) => {
        const clave = claves.find(c => mapa[c]);
        return mapa[clave]?.gravedad ?? 'leve';
    };

    const patrones = [];
    const agregar = (patron) => patrones.push(patron);


    // ── Serie roja ────────────────────────────────────────────────────────────

    if (esBajo('hct') || esBajo('hgb') || esBajo('rbc')) {
        const tipoPorVcm = !presente('mcv') ? '' :
            esBajo('mcv') ? 'microcítica' :
            esAlto('mcv') ? 'macrocítica' : 'normocítica';

        const tipoPorMchc = !presente('mchc') ? '' :
            esBajo('mchc') ? ' hipocrómica' :
            esAlto('mchc') ? ' hipercrómica' : ' normocrómica';

        const morfologia = (tipoPorVcm + tipoPorMchc).trim();

        const etKey = esBajo('mcv') && esBajo('mchc') ? 'ferropenia' :
                      esAlto('mcv') ? 'macrocitica' :
                      morfologia.includes('normocítica') ? 'normocitica' : null;
        const etiologia = etKey ? alt.anemia.etiologias[etKey] : '';

        agregar({
            nombre: `${alt.anemia.nombre}${morfologia ? ` ${morfologia}` : ''}`,
            descripcion: [alt.anemia.prefijo, etiologia].filter(Boolean).join(' '),
            gravedad: gravedadDe('hct', 'hgb', 'rbc'),
            parametros: ['hct', 'hgb', 'rbc', 'mcv', 'mchc'].filter(presente)
        });
    }

    if (esAlto('hct') || esAlto('rbc')) agregar({
        nombre: alt.eritrocitosis.nombre,
        descripcion: alt.eritrocitosis.descripcion,
        gravedad: gravedadDe('hct', 'rbc'),
        parametros: ['hct', 'rbc', 'hgb'].filter(presente)
    });


    // ── Serie blanca ──────────────────────────────────────────────────────────

    if (esAlto('wbc')) {
        const neutrofilia = esAlto('neutrophils');
        const linfocitosis = esAlto('lymphocytes');
        const eosinofilia = esAlto('eosinophils');

        if (neutrofilia) agregar({
            nombre: alt.leucocitosis_neutrofilica.nombre,
            descripcion: alt.leucocitosis_neutrofilica.descripcion,
            gravedad: gravedadDe('wbc', 'neutrophils'),
            parametros: ['wbc', 'neutrophils'].filter(presente)
        });

        if (linfocitosis) agregar({
            nombre: alt.leucocitosis_linfocitica.nombre,
            descripcion: alt.leucocitosis_linfocitica.descripcion,
            gravedad: gravedadDe('wbc', 'lymphocytes'),
            parametros: ['wbc', 'lymphocytes'].filter(presente)
        });

        if (eosinofilia) agregar({
            nombre: alt.eosinofilia.nombre,
            descripcion: alt.eosinofilia.descripcion,
            gravedad: gravedadDe('eosinophils'),
            parametros: ['eosinophils', 'wbc'].filter(presente)
        });

        if (!neutrofilia && !linfocitosis && !eosinofilia) agregar({
            nombre: alt.leucocitosis.nombre,
            descripcion: alt.leucocitosis.descripcion,
            gravedad: gravedadDe('wbc'),
            parametros: ['wbc']
        });
    }

    if (esBajo('wbc')) agregar({
        nombre: alt.leucopenia.nombre,
        descripcion: alt.leucopenia.descripcion,
        gravedad: gravedadDe('wbc'),
        parametros: ['wbc']
    });

    if (esBajo('neutrophils')) agregar({
        nombre: alt.neutropenia.nombre,
        descripcion: alt.neutropenia.descripcion,
        gravedad: gravedadDe('neutrophils'),
        parametros: ['neutrophils']
    });

    if (esBajo('lymphocytes')) agregar({
        nombre: alt.linfopenia.nombre,
        descripcion: alt.linfopenia.descripcion,
        gravedad: gravedadDe('lymphocytes'),
        parametros: ['lymphocytes']
    });

    if (esAlto('monocytes')) agregar({
        nombre: alt.monocitosis.nombre,
        descripcion: alt.monocitosis.descripcion,
        gravedad: gravedadDe('monocytes'),
        parametros: ['monocytes']
    });


    // ── Plaquetas ─────────────────────────────────────────────────────────────

    if (esBajo('platelets')) agregar({
        nombre: alt.trombocitopenia.nombre,
        descripcion: alt.trombocitopenia.descripcion,
        gravedad: gravedadDe('platelets'),
        parametros: ['platelets']
    });

    if (esAlto('platelets')) agregar({
        nombre: alt.trombocitosis.nombre,
        descripcion: alt.trombocitosis.descripcion,
        gravedad: gravedadDe('platelets'),
        parametros: ['platelets']
    });


    // ── Hígado ────────────────────────────────────────────────────────────────

    if (esAlto('alt') && esAlto('ast')) agregar({
        nombre: alt.dano_hepatocelular.nombre,
        descripcion: alt.dano_hepatocelular.descripcion,
        gravedad: gravedadDe('alt', 'ast'),
        parametros: ['alt', 'ast'].filter(presente)
    });
    else if (esAlto('alt')) agregar({
        nombre: alt.alt_aislada.nombre,
        descripcion: alt.alt_aislada.descripcion,
        gravedad: gravedadDe('alt'),
        parametros: ['alt']
    });

    if (esAlto('alp') || esAlto('ggt')) agregar({
        nombre: alt.patron_colestasico.nombre,
        descripcion: alt.patron_colestasico.descripcion[especie] ?? alt.patron_colestasico.descripcion.canino,
        gravedad: gravedadDe('alp', 'ggt'),
        parametros: ['alp', 'ggt'].filter(presente)
    });

    if (esAlto('total_bilirubin')) agregar({
        nombre: alt.hiperbilirrubinemia.nombre,
        descripcion: alt.hiperbilirrubinemia.descripcion,
        gravedad: gravedadDe('total_bilirubin'),
        parametros: ['total_bilirubin']
    });


    // ── Riñón ─────────────────────────────────────────────────────────────────

    if (esAlto('bun') && esAlto('creatinine')) agregar({
        nombre: alt.azotemia.nombre,
        descripcion: alt.azotemia.descripcion,
        gravedad: gravedadDe('creatinine', 'bun'),
        parametros: ['bun', 'creatinine'].filter(presente)
    });
    else if (esAlto('bun')) agregar({
        nombre: alt.hiperuremia_bun.nombre,
        descripcion: alt.hiperuremia_bun.descripcion,
        gravedad: gravedadDe('bun'),
        parametros: ['bun']
    });
    else if (esAlto('creatinine')) agregar({
        nombre: alt.creatinina_aislada.nombre,
        descripcion: alt.creatinina_aislada.descripcion,
        gravedad: gravedadDe('creatinine'),
        parametros: ['creatinine']
    });

    if (esBajo('bun')) agregar({
        nombre: alt.bun_disminuido.nombre,
        descripcion: alt.bun_disminuido.descripcion,
        gravedad: gravedadDe('bun'),
        parametros: ['bun']
    });


    // ── Glucosa ───────────────────────────────────────────────────────────────

    if (esAlto('glucose')) agregar({
        nombre: alt.hiperglucemia.nombre,
        descripcion: alt.hiperglucemia.descripcion[especie] ?? alt.hiperglucemia.descripcion.canino,
        gravedad: gravedadDe('glucose'),
        parametros: ['glucose']
    });

    if (esBajo('glucose')) agregar({
        nombre: alt.hipoglucemia.nombre,
        descripcion: alt.hipoglucemia.descripcion,
        gravedad: gravedadDe('glucose'),
        parametros: ['glucose']
    });


    // ── Proteínas ─────────────────────────────────────────────────────────────

    if (esAlto('total_protein')) agregar({
        nombre: alt.hiperproteinemia.nombre,
        descripcion: alt.hiperproteinemia.descripcion,
        gravedad: gravedadDe('total_protein'),
        parametros: ['total_protein']
    });

    if (esBajo('albumin')) {
        const hipoproteinemia = esBajo('total_protein');
        const altKey = hipoproteinemia ? 'hipoproteinemia_hipoalbuminemia' : 'hipoalbuminemia';
        agregar({
            nombre: alt[altKey].nombre,
            descripcion: alt[altKey].descripcion,
            gravedad: gravedadDe('albumin'),
            parametros: ['albumin', ...(hipoproteinemia ? ['total_protein'] : [])].filter(presente)
        });
    }


    // ── Electrolitos ──────────────────────────────────────────────────────────

    const valSodio = valor('sodium');
    const valPotasio = valor('potassium');

    // Ratio Na:K < 27 es un marcador clásico de hipoadrenocorticismo (Addison)
    if (valSodio !== null && valPotasio !== null && valPotasio > 0) {
        const ratioNaK = valSodio / valPotasio;
        if (ratioNaK < 27) agregar({
            nombre: alt.ratio_nak.nombre,
            descripcion: alt.ratio_nak.descripcion.replace('{ratio}', ratioNaK.toFixed(1)),
            gravedad: ratioNaK < 20 ? 'grave' : ratioNaK < 24 ? 'moderado' : 'leve',
            parametros: ['sodium', 'potassium'].filter(presente)
        });
    }

    if (esAlto('sodium')) agregar({
        nombre: alt.hipernatremia.nombre,
        descripcion: alt.hipernatremia.descripcion,
        gravedad: gravedadDe('sodium'),
        parametros: ['sodium']
    });

    if (esBajo('sodium')) agregar({
        nombre: alt.hiponatremia.nombre,
        descripcion: alt.hiponatremia.descripcion,
        gravedad: gravedadDe('sodium'),
        parametros: ['sodium']
    });

    if (esAlto('calcium')) agregar({
        nombre: alt.hipercalcemia.nombre,
        descripcion: alt.hipercalcemia.descripcion,
        gravedad: gravedadDe('calcium'),
        parametros: ['calcium']
    });

    if (esBajo('calcium')) agregar({
        nombre: alt.hipocalcemia.nombre,
        descripcion: alt.hipocalcemia.descripcion,
        gravedad: gravedadDe('calcium'),
        parametros: ['calcium']
    });

    if (esBajo('potassium')) agregar({
        nombre: alt.hipopotasemia.nombre,
        descripcion: alt.hipopotasemia.descripcion,
        gravedad: gravedadDe('potassium'),
        parametros: ['potassium']
    });

    if (esAlto('potassium')) agregar({
        nombre: alt.hiperpotasemia.nombre,
        descripcion: alt.hiperpotasemia.descripcion,
        gravedad: gravedadDe('potassium'),
        parametros: ['potassium']
    });

    if (esAlto('phosphorus')) agregar({
        nombre: alt.hiperfosforemia.nombre,
        descripcion: alt.hiperfosforemia.descripcion,
        gravedad: gravedadDe('phosphorus'),
        parametros: ['phosphorus']
    });

    return patrones;
};


// ─── Exportación principal ────────────────────────────────────────────────────

export const analizarResultados = (valoresInput, paciente, referencias, alteraciones) => {
    const refsEspecie = referencias[paciente.especie];
    if (!refsEspecie) return { hallazgos: [], patrones: [] };

    const refsAjustadas = ajustarReferencias(refsEspecie, paciente);
    const hallazgos = [];

    for (const [clave, ref] of Object.entries(refsAjustadas)) {
        const raw = valoresInput[clave];
        if (raw === null || raw === undefined || raw === '') continue;

        const valorNum = parseFloat(raw);
        if (isNaN(valorNum)) continue;

        if (valorNum > ref.superior) {
            hallazgos.push({
                clave, nombre: ref.nombre, valor: valorNum, unidad: ref.unidad,
                direccion: 'alto', gravedad: clasificarGravedad(valorNum, ref)
            });
        } else if (valorNum < ref.inferior) {
            hallazgos.push({
                clave, nombre: ref.nombre, valor: valorNum, unidad: ref.unidad,
                direccion: 'bajo', gravedad: clasificarGravedad(valorNum, ref)
            });
        }
    }

    return { hallazgos, patrones: detectarPatrones(hallazgos, paciente.especie, alteraciones) };
};
