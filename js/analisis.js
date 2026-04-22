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

    return Object.fromEntries(
        Object.entries(refsEspecie).map(([clave, ref]) => {
            const fEdad = ajEdad[clave] ?? {};
            const fRaza = ajRaza[clave] ?? {};
            const fSexo = ajSexo[clave] ?? {};

            return [clave, {
                ...ref,
                inferior: ref.inferior * (fEdad.inferior ?? 1) * (fRaza.inferior ?? 1) * (fSexo.inferior ?? 1),
                superior: ref.superior * (fEdad.superior ?? 1) * (fRaza.superior ?? 1) * (fSexo.superior ?? 1)
            }];
        })
    );
};


// ─── Detección de patrones clínicos ───────────────────────────────────────────

const detectarPatrones = (hallazgos, especie) => {
    const mapa = Object.fromEntries(hallazgos.map(h => [h.clave, h]));

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

        const etiologia =
            esBajo('mcv') && esBajo('mchc') ? 'Compatible con déficit de hierro o anemia de enfermedad crónica.' :
            esAlto('mcv') ? 'Compatible con anemia regenerativa, déficit de B12/folato o mielodisplasia.' :
            morfologia.includes('normocítica') ? 'Compatible con anemia no regenerativa, hemorragia aguda o hemólisis.' : '';

        agregar({
            nombre: `Anemia${morfologia ? ` ${morfologia}` : ''}`,
            descripcion: `Parámetros eritrocitarios disminuidos. ${etiologia}`.trim(),
            gravedad: gravedadDe('hct', 'hgb', 'rbc'),
            parametros: ['hct', 'hgb', 'rbc', 'mcv', 'mchc'].filter(presente)
        });
    }

    if (esAlto('hct') || esAlto('rbc')) agregar({
        nombre: 'Eritrocitosis',
        descripcion: 'Aumento de la masa eritrocitaria. Considerar deshidratación, eritrocitosis absoluta (cardiopatía, hipoxia crónica, neoplasia eritropoyética).',
        gravedad: gravedadDe('hct', 'rbc'),
        parametros: ['hct', 'rbc', 'hgb'].filter(presente)
    });


    // ── Serie blanca ──────────────────────────────────────────────────────────

    if (esAlto('wbc')) {
        const neutrofilia = esAlto('neutrophils');
        const linfocitosis = esAlto('lymphocytes');
        const eosinofilia = esAlto('eosinophils');

        if (neutrofilia) agregar({
            nombre: 'Leucocitosis neutrofílica',
            descripcion: 'Compatible con infección bacteriana, inflamación aguda, estrés fisiológico o necrosis tisular.',
            gravedad: gravedadDe('wbc', 'neutrophils'),
            parametros: ['wbc', 'neutrophils'].filter(presente)
        });

        if (linfocitosis) agregar({
            nombre: 'Leucocitosis linfocítica',
            descripcion: 'Compatible con estimulación antigénica crónica, linfoma o excitación fisiológica (frecuente en felinos).',
            gravedad: gravedadDe('wbc', 'lymphocytes'),
            parametros: ['wbc', 'lymphocytes'].filter(presente)
        });

        if (eosinofilia) agregar({
            nombre: 'Eosinofilia',
            descripcion: 'Compatible con parasitismo, hipersensibilidad/alergia o síndrome hipereosinofílico.',
            gravedad: gravedadDe('eosinophils'),
            parametros: ['eosinophils', 'wbc'].filter(presente)
        });

        if (!neutrofilia && !linfocitosis && !eosinofilia) agregar({
            nombre: 'Leucocitosis',
            descripcion: 'Aumento del recuento leucocitario. Evaluar diferencial para determinar etiología.',
            gravedad: gravedadDe('wbc'),
            parametros: ['wbc']
        });
    }

    if (esBajo('wbc')) agregar({
        nombre: 'Leucopenia',
        descripcion: 'Compatible con infección viral, sepsis, supresión medular o quimioterapia.',
        gravedad: gravedadDe('wbc'),
        parametros: ['wbc']
    });


    // ── Plaquetas ─────────────────────────────────────────────────────────────

    if (esBajo('platelets')) agregar({
        nombre: 'Trombocitopenia',
        descripcion: 'Evaluar trombocitopenia inmunomediada (IMT), enfermedades vectoriales (Ehrlichia, Anaplasma), CID o supresión medular.',
        gravedad: gravedadDe('platelets'),
        parametros: ['platelets']
    });

    if (esAlto('platelets')) agregar({
        nombre: 'Trombocitosis',
        descripcion: 'Puede ser reactiva (inflamación, ferropenia, esplenectomía) o primaria (neoplasia mieloproliferativa).',
        gravedad: gravedadDe('platelets'),
        parametros: ['platelets']
    });


    // ── Hígado ────────────────────────────────────────────────────────────────

    if (esAlto('alt') && esAlto('ast')) agregar({
        nombre: 'Daño hepatocelular',
        descripcion: 'Elevación de transaminasas compatible con hepatitis, toxicosis, lipidosis hepática (felinos) o necrosis hepatocelular.',
        gravedad: gravedadDe('alt', 'ast'),
        parametros: ['alt', 'ast'].filter(presente)
    });
    else if (esAlto('alt')) agregar({
        nombre: 'Elevación de ALT aislada',
        descripcion: 'Daño hepatocelular leve o muscular. Recomendable repetir la analítica en 2-4 semanas.',
        gravedad: gravedadDe('alt'),
        parametros: ['alt']
    });

    if (esAlto('alp') || esAlto('ggt')) agregar({
        nombre: 'Patrón colestásico',
        descripcion: especie === 'canino'
            ? 'Compatible con colestasis, hiperadrenocorticismo, hepatopatía vacuolar o inducción por glucocorticoides.'
            : 'En felinos la elevación de GGT es más específica de colestasis. Considerar lipidosis hepática, colangitis o colangiohepatitis.',
        gravedad: gravedadDe('alp', 'ggt'),
        parametros: ['alp', 'ggt'].filter(presente)
    });

    if (esAlto('total_bilirubin')) agregar({
        nombre: 'Hiperbilirrubinemia',
        descripcion: 'Posible ictericia prehepática (hemólisis), hepática (hepatopatía) o posthepática (obstrucción biliar). Correlacionar con clínica.',
        gravedad: gravedadDe('total_bilirubin'),
        parametros: ['total_bilirubin']
    });


    // ── Riñón ─────────────────────────────────────────────────────────────────

    if (esAlto('bun') && esAlto('creatinine')) agregar({
        nombre: 'Azotemia',
        descripcion: 'Elevación de BUN y creatinina. Puede ser prerrenal (deshidratación), renal (ERC/IRA) o posrenal (obstrucción). Correlacionar con urianálisis e hidratación.',
        gravedad: gravedadDe('creatinine', 'bun'),
        parametros: ['bun', 'creatinine'].filter(presente)
    });
    else if (esAlto('bun')) agregar({
        nombre: 'Hiperuremia aislada (BUN)',
        descripcion: 'BUN elevado con creatinina normal. Compatible con dieta hiperproteica, deshidratación leve, hemorragia gastrointestinal o catabolismo aumentado.',
        gravedad: gravedadDe('bun'),
        parametros: ['bun']
    });

    if (esBajo('bun')) agregar({
        nombre: 'BUN disminuido',
        descripcion: 'Compatible con insuficiencia hepática grave (shunt portosistémico, cirrosis), malnutrición proteica o poliuria marcada.',
        gravedad: gravedadDe('bun'),
        parametros: ['bun']
    });


    // ── Glucosa ───────────────────────────────────────────────────────────────

    if (esAlto('glucose')) agregar({
        nombre: 'Hiperglucemia',
        descripcion: especie === 'felino'
            ? 'En felinos es frecuente la hiperglucemia por estrés. Si persiste > 300 mg/dL, considerar diabetes mellitus. Correlacionar con fructosamina.'
            : 'Compatible con diabetes mellitus, hiperadrenocorticismo o hiperglucemia por estrés. Evaluar poliuria/polidipsia.',
        gravedad: gravedadDe('glucose'),
        parametros: ['glucose']
    });

    if (esBajo('glucose')) agregar({
        nombre: 'Hipoglucemia',
        descripcion: 'Compatible con insulinoma, sepsis, insuficiencia hepática, neonatos/cachorros o inanición. Requiere evaluación urgente si la gravedad es moderada o grave.',
        gravedad: gravedadDe('glucose'),
        parametros: ['glucose']
    });


    // ── Proteínas ─────────────────────────────────────────────────────────────

    if (esBajo('albumin')) {
        const hipoproteinemia = esBajo('total_protein');
        agregar({
            nombre: hipoproteinemia ? 'Hipoproteinemia / Hipoalbuminemia' : 'Hipoalbuminemia',
            descripcion: hipoproteinemia
                ? 'Compatible con enteropatía o nefropatía con pérdida de proteínas, o malnutrición grave.'
                : 'Hipoalbuminemia con proteína total normal/alta: compatible con insuficiencia hepática (reducción de síntesis) o distribución al tercer espacio.',
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
            nombre: 'Ratio Na:K reducido — sospecha de hipoadrenocorticismo',
            descripcion: `Ratio Na:K de ${ratioNaK.toFixed(1)} (referencia > 27). Altamente compatible con hipoadrenocorticismo (enfermedad de Addison). Confirmar con test de estimulación con ACTH.`,
            gravedad: ratioNaK < 20 ? 'grave' : ratioNaK < 24 ? 'moderado' : 'leve',
            parametros: ['sodium', 'potassium'].filter(presente)
        });
    }

    if (esAlto('calcium')) agregar({
        nombre: 'Hipercalcemia',
        descripcion: 'Compatible con hipercalcemia de malignidad (linfoma, adenocarcinoma apocrino), hiperparatiroidismo primario, hipervitaminosis D o granulomatosis.',
        gravedad: gravedadDe('calcium'),
        parametros: ['calcium']
    });

    if (esBajo('calcium')) agregar({
        nombre: 'Hipocalcemia',
        descripcion: 'Compatible con hipoparatiroidismo, eclampsia puerperal (hembras lactantes), pancreatitis aguda o hipoalbuminemia (evaluar calcio ionizado).',
        gravedad: gravedadDe('calcium'),
        parametros: ['calcium']
    });

    if (esBajo('potassium')) agregar({
        nombre: 'Hipopotasemia',
        descripcion: 'Compatible con pérdidas digestivas (vómito, diarrea), diuresis, alcalosis metabólica o anorexia prolongada. En felinos puede asociarse a miopatía hipopotasémica.',
        gravedad: gravedadDe('potassium'),
        parametros: ['potassium']
    });

    if (esAlto('potassium')) agregar({
        nombre: 'Hiperpotasemia',
        descripcion: 'Compatible con insuficiencia renal, hipoadrenocorticismo, acidosis metabólica o pseudohiperpotasemia por hemólisis in vitro.',
        gravedad: gravedadDe('potassium'),
        parametros: ['potassium']
    });

    return patrones;
};


// ─── Exportación principal ────────────────────────────────────────────────────

export const analizarResultados = (valoresInput, paciente, referencias) => {
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

    return { hallazgos, patrones: detectarPatrones(hallazgos, paciente.especie) };
};
