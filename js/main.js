// Bottom navigation tab switching
let referencias = [];

const tabs = document.querySelectorAll('.nav-tab');
const paneles = document.querySelectorAll('main > .panel');

function activateTab(targetId) {
    tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });
    paneles.forEach(panel => {
        panel.classList.toggle('active', panel.id === targetId);
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
        console.log(referencias);
    } catch (error) {
        console.error('Error cargando Valores de referencia:', error);
    }
};
cargarReferencias();


const INPUT_A_CLAVE = {
    rbc: 'rbc', hgb: 'hgb', hct: 'hct', vcm: 'mcv', hcm: 'mch', chcm: 'mchc',
    wbc: 'wbc', neutro: 'neutrophils', linfo: 'lymphocytes', mono: 'monocytes',
    eosino: 'eosinophils', baso: 'basophils', plt: 'platelets',
    alt: 'alt', ast: 'ast', fal: 'alp', ggt: 'ggt', bun: 'bun', creat: 'creatinine',
    gluc: 'glucose', prot: 'total_protein', alb: 'albumin', bili: 'total_bilirubin',
    fosf: 'phosphorus', calc: 'calcium', sodio: 'sodium', potasio: 'potassium', cloro: 'chloride'
};

const evaluarValores = () => {
    const especieRaw = document.getElementById('pt-especie').value;
    const especie = especieRaw === 'Canino' ? 'canino' : especieRaw === 'Felino' ? 'felino' : null;
    if (!especie || !referencias[especie]) return;

    const ref = referencias[especie];

    document.querySelectorAll('input[type="number"]').forEach(input => {
        const clave = INPUT_A_CLAVE[input.name];
        input.classList.remove('alto', 'bajo');
        if (!clave || !ref[clave] || input.value === '') return;

        const valor = parseFloat(input.value);
        if (valor > ref[clave].superior){
            input.classList.add('alto')
        }else if (valor < ref[clave].inferior){
            input.classList.add('bajo');
        } 
    });
};


document.querySelectorAll('input[type="number"]').forEach(input => {                                                                                                                                                     
      input.addEventListener('input', evaluarValores);
  });                                                                                                                                                                                                                      
                                                                                                                                                                                                                         
document.getElementById('pt-especie').addEventListener('change', evaluarValores);