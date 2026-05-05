# Morphos — Análisis Técnico Profundo

Documento de estudio para la presentación del proyecto final. Cubre arquitectura, decisiones de diseño y flujo de datos, con fragmentos reales del código.

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Estructura de archivos y responsabilidades](#2-estructura-de-archivos-y-responsabilidades)
3. [Flujo de datos completo](#3-flujo-de-datos-completo)
4. [Motor de análisis — analisis.js](#4-motor-de-análisis--analisisjs)
5. [Controlador de UI — main.js](#5-controlador-de-ui--mainjs)
6. [Capa de interfaz — ui.js](#6-capa-de-interfaz--uijs)
7. [Autenticación — auth.js y PHP](#7-autenticación--authjs-y-php)
8. [Integración IA — ia.js](#8-integración-ia--iajs)
9. [Datos JSON como base de conocimiento](#9-datos-json-como-base-de-conocimiento)
10. [Decisiones arquitectónicas clave](#10-decisiones-arquitectónicas-clave)
11. [Posibles preguntas del profesor](#11-posibles-preguntas-del-profesor)

---

## 1. Visión general

**Morphos** es una herramienta de apoyo a decisiones clínicas veterinarias. El veterinario ingresa valores de laboratorio de un paciente (perro o gato), y la aplicación:

1. Compara los valores contra rangos de referencia ajustados por especie, raza, edad y sexo.
2. Clasifica cada valor fuera de rango por dirección (alto/bajo) y severidad (leve, moderado, grave).
3. Detecta patrones clínicos combinando múltiples hallazgos (p.ej. anemia microcítica, azotemia, patrón colestásico).
4. Opcionalmente genera una interpretación clínica en lenguaje natural usando el modelo de IA MedGemma.

**Stack tecnológico:**

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5 + JavaScript ES6 Modules (Vanilla, sin frameworks) |
| Estilos | CSS3 con custom properties |
| Backend | PHP 8 (solo autenticación) |
| Base de datos | MySQL (tabla única `usuarios`) |
| IA | MedGemma vía HuggingFace Inference API u Ollama local |
| Datos clínicos | Archivos JSON estáticos |

> **Decisión clave:** No hay paso de compilación (*build step*). Se sirve con cualquier servidor HTTP estático. El análisis clínico nunca requiere red ni servidor.

---

## 2. Estructura de archivos y responsabilidades

```
morphos_proyecto_final/
├── index.html                  ← HTML único (SPA sin router)
├── css/styles.css              ← Tema, custom properties, dark mode
├── data/
│   ├── valores_referencia.json ← Rangos normales por especie
│   └── alteraciones.json       ← Base de conocimiento de patrones clínicos
├── js/
│   ├── main.js      ← Coordinador: recoge datos del DOM, dispara análisis, renderiza
│   ├── analisis.js  ← Motor puro: no toca el DOM, recibe datos y devuelve hallazgos
│   ├── ui.js        ← Navegación por tabs, animaciones, cámara, imágenes
│   ├── auth.js      ← Modal de login/registro, validación, sesión
│   └── ia.js        ← Construcción de prompt, llamadas a HuggingFace/Ollama
└── api/
    ├── actions/
    │   ├── login.php     ← POST: verifica credenciales, inicia sesión
    │   ├── register.php  ← POST: crea usuario, hashea contraseña
    │   ├── logout.php    ← POST: destruye sesión
    │   └── session.php   ← GET: devuelve estado de sesión actual
    └── config/
        ├── conexion.php  ← Conexión PDO a MySQL
        └── config.php    ← Define BASE_URL
```

### Grafo de dependencias entre módulos JS

```
index.html
    └── main.js (coordinator)
            ├── analisis.js   ← importa analizarResultados()
            ├── ui.js         ← importa activateTab(), initMobSync(), colapsarPatrones()
            ├── auth.js       ← importa getSessionActiva()
            └── ia.js         ← importa llamarIA(), initBackendConfig()
```

`analisis.js` es la pieza más importante: **no importa nada** del resto de módulos. Es una función pura.

---

## 3. Flujo de datos completo

### 3.1 Carga inicial

```javascript
// main.js — carga al iniciar la app
let referencias = null;
let alteraciones = null;

async function cargarReferencias() {
  const res = await fetch('data/valores_referencia.json');
  referencias = await res.json();
}

async function cargarAlteraciones() {
  const res = await fetch('data/alteraciones.json');
  alteraciones = await res.json();
}
```

Los dos JSON se cargan **una sola vez** y quedan en memoria. Todo el análisis posterior lee estas variables en lugar de hacer nuevas peticiones de red.

### 3.2 Ciclo de evaluación (reactivo)

Cada vez que el usuario escribe un valor, cambia la especie o modifica datos del paciente:

```
INPUT EVENT en cualquier campo
        │
        ▼
  evaluar()                          ← main.js
        │
        ├── obtenerDatosPaciente()   → { especie, raza, edadMeses, sexo }
        ├── obtenerValoresFormulario() → { rbc: 3.2, wbc: 18, alt: 95, ... }
        │
        ▼
  analizarResultados(valores, paciente, referencias, alteraciones)   ← analisis.js
        │
        ├── ajustarReferencias()     → rangos corregidos por edad/raza/sexo
        ├── comparar cada valor      → lista de hallazgos (alto/bajo + gravedad)
        └── detectarPatrones()       → lista de patrones clínicos
        │
        ▼
  { hallazgos: [...], patrones: [...] }   ← devuelto a main.js
        │
        ├── actualizarClasesInputs()  → colorea inputs, pone badges "Alto · Moderado"
        └── renderizarPatrones()      → dibuja las tarjetas en #patrones-lista
```

### 3.3 Recolección de valores desde el DOM

Los atributos `name` de los inputs HTML coinciden exactamente con las claves del JSON de referencias (`fal`, `vcm`, `neutro`, `sodio`, etc.), por lo que `obtenerValoresFormulario` lee el DOM directamente sin ningún mapeo intermedio:

```javascript
// main.js
const obtenerValoresFormulario = () => {
  const valores = {};
  document.querySelectorAll('input[type="number"]').forEach(input => {
    if (input.name && input.value !== '') valores[input.name] = parseFloat(input.value);
  });
  return valores;
};
```

El mismo nombre sirve como clave en el objeto `valores`, en el JSON de referencias y en los hallazgos que devuelve `analisis.js`. Las tres capas hablan el mismo idioma (español, con guión bajo donde aplica), sin capa de traducción.

---

## 4. Motor de análisis — analisis.js

Este archivo es el **corazón de la aplicación**. Es una función pura exportada: no lee el DOM, no tiene efectos secundarios, no hace fetch. Recibe datos y devuelve un resultado.

```javascript
// analisis.js — firma de la función principal
export function analizarResultados(valoresInput, paciente, referencias, alteraciones) {
  // ... lógica clínica ...
  return { hallazgos, patrones };
}
```

### 4.1 Clasificación de gravedad

```javascript
function clasificarGravedad(valor, ref) {
  const rangoAncho = ref.superior - ref.inferior;
  let desviacion;

  if (valor > ref.superior) {
    desviacion = (valor - ref.superior) / rangoAncho;
  } else {
    desviacion = (ref.inferior - valor) / rangoAncho;
  }

  if (desviacion <= 0.5)  return 'leve';
  if (desviacion <= 1.5)  return 'moderado';
  return 'grave';
}
```

La **desviación** se calcula como fracción del ancho del rango normal. Si el rango normal es 5–8.5 (ancho = 3.5) y el valor es 2, la desviación es (5–2)/3.5 = 0.86 → **moderado**.

Esta fórmula es agnóstica a las unidades y funciona igual para leucocitos, glucosa, sodio o cualquier otro parámetro.

### 4.2 Ajuste de rangos por especie, raza, edad y sexo

```javascript
function ajustarReferencias(refs, especie, raza, edadMeses, sexo) {
  const ajustadas = JSON.parse(JSON.stringify(refs)); // copia profunda

  const edadCat = categorizarEdad(edadMeses, especie);

  // Ejemplo: ALP sube mucho en cachorros (por crecimiento óseo)
  if (edadCat === 'cachorro' && ajustadas.alp) {
    ajustadas.alp.superior *= 3.0;
  }

  // Creatinina más alta en gatos machos
  if (especie === 'felino' && sexo === 'Macho' && ajustadas.creatinine) {
    ajustadas.creatinine.superior *= 1.15;
  }

  // Galgos: RBC más alto (mayor volumen eritrocitario)
  const razasGalgo = ['Galgo', 'Whippet', 'Greyhound'];
  if (razasGalgo.some(r => raza?.includes(r)) && ajustadas.rbc) {
    ajustadas.rbc.inferior *= 1.1;
    ajustadas.rbc.superior *= 1.15;
  }

  return ajustadas;
}
```

Sin este ajuste, un cachorro con ALP de 400 U/L (normal en crecimiento) aparecería falsamente marcado como grave. Esto es conocimiento veterinario codificado como reglas.

### 4.3 Generación de hallazgos

```javascript
const hallazgos = [];
for (const [clave, valor] of Object.entries(valoresInput)) {
  const ref = refsAjustadas[clave];
  if (!ref) continue;

  if (valor > ref.superior || valor < ref.inferior) {
    hallazgos.push({
      clave,
      nombre: ref.nombre,
      valor,
      unidad: ref.unidad,
      direccion: valor > ref.superior ? 'alto' : 'bajo',
      gravedad: clasificarGravedad(valor, ref)
    });
  }
}
```

Estructura de un hallazgo:
```javascript
{
  clave: 'wbc',
  nombre: 'Leucocitos (WBC)',
  valor: 25,
  unidad: 'x10³/μL',
  direccion: 'alto',
  gravedad: 'moderado'
}
```

### 4.4 Detección de patrones clínicos

La función `detectarPatrones(hallazgos, especie, paciente, alteraciones)` contiene más de 150 líneas de lógica de reglas. Cada patrón se activa cuando se cumplen condiciones sobre los hallazgos:

```javascript
// Ejemplo: anemia microcítica (baja RBC + bajo MCV)
const rbcBajo = hayHallazgo(hallazgos, 'rbc', 'bajo');
const mcvBajo = hayHallazgo(hallazgos, 'mcv', 'bajo');
const hgbBajo = hayHallazgo(hallazgos, 'hgb', 'bajo');

if ((rbcBajo || hgbBajo) && mcvBajo) {
  patrones.push({
    nombre: alt.anemia_ferroproiva?.nombre || 'Anemia microcítica hipocrómica',
    descripcion: alt.anemia?.etiologias?.ferropenia || '',
    gravedad: calcularGravedadPatron([rbcBajo, hgbBajo, mcvBajo]),
    parametros: ['rbc', 'hgb', 'mcv']
  });
}

// Ejemplo: ratio Na:K < 27 → sospecha de enfermedad de Addison
const sodioV = valoresInput['sodium'];
const potasioV = valoresInput['potassium'];
if (sodioV && potasioV && (sodioV / potasioV) < 27) {
  patrones.push({
    nombre: alt.ratio_nak?.nombre || 'Ratio Na:K disminuido',
    descripcion: alt.ratio_nak?.descripcion || '',
    gravedad: 'moderado',
    parametros: ['sodium', 'potassium']
  });
}
```

La función auxiliar `hayHallazgo` abstrae la búsqueda en la lista:

```javascript
function hayHallazgo(hallazgos, clave, direccion) {
  return hallazgos.find(h => h.clave === clave && h.direccion === direccion) || null;
}
```

**Patrones detectables (>40):**

| Categoría | Patrones |
|-----------|----------|
| Serie roja | Anemia microcítica, macrocítica, normocítica; eritrocitosis |
| Serie blanca | Leucocitosis neutrofílica/linfocítica, leucopenia, neutropenia, eosinofilia |
| Plaquetas | Trombocitopenia, trombocitosis |
| Hígado | Daño hepatocelular, colestasis, hiperbilirrubinemia |
| Riñón | Azotemia, BUN aislado, diferenciación pre-renal/renal |
| Glucosa | Hiperglucemia, hipoglucemia |
| Proteínas | Hiperproteinemia, hipoalbuminemia |
| Electrolitos | Ratio Na:K (Addison), hiper/hiponatremia, calcio, fósforo |
| Urinálisis | Hiposthenuria, isosthenuria |
| Endocrino | Hipotiroidismo, hipertiroidismo, hiperadrenocorticismo, hipoadrenocorticismo |

---

## 5. Controlador de UI — main.js

`main.js` actúa como **pegamento** entre el motor de análisis y el DOM. No contiene lógica clínica.

### 5.1 Renderizado de hallazgos en el DOM

```javascript
function actualizarClasesInputs(hallazgos) {
  // Primero limpia todo
  document.querySelectorAll('input[type="number"]').forEach(input => {
    input.classList.remove('alto', 'bajo');
    const badge = input.parentElement.querySelector('.estado-badge');
    if (badge) badge.remove();
  });

  // Luego aplica solo los hallazgos actuales
  hallazgos.forEach(h => {
    const input = document.querySelector(`input[name="${getHtmlName(h.clave)}"]`);
    if (!input) return;

    input.classList.add(h.direccion); // agrega clase 'alto' o 'bajo'

    const badge = document.createElement('span');
    badge.className = `estado-badge ${h.gravedad}`;
    badge.textContent = `${h.direccion === 'alto' ? 'Alto' : 'Bajo'} · ${h.gravedad}`;
    input.parentElement.appendChild(badge);
  });
}
```

Las clases CSS `alto` y `bajo` cambian el color del borde del input (rojo/azul). El badge muestra al usuario dirección y severidad junto al campo.

### 5.2 Renderizado de patrones

```javascript
function renderizarPatrones(patrones) {
  const lista = document.getElementById('patrones-lista');
  lista.innerHTML = '';

  if (patrones.length === 0) {
    lista.innerHTML = '<p class="sin-hallazgos">Sin patrones detectados</p>';
    return;
  }

  patrones.forEach(p => {
    const div = document.createElement('div');
    div.className = `patron-card gravedad-${p.gravedad}`;
    div.innerHTML = `
      <strong>${p.nombre}</strong>
      <span class="gravedad-badge">${p.gravedad}</span>
      <p>${p.descripcion}</p>
    `;
    lista.appendChild(div);
  });
}
```

### 5.3 Función de evaluación completa

```javascript
function evaluar() {
  if (!referencias || !alteraciones) return;

  const paciente = obtenerDatosPaciente();
  if (!paciente.especie || !referencias[paciente.especie]) return;

  const valores = obtenerValoresFormulario();

  const { hallazgos, patrones } = analizarResultados(
    valores,
    paciente,
    referencias[paciente.especie],
    alteraciones
  );

  ultimoAnalisis = { hallazgos, patrones };

  actualizarClasesInputs(hallazgos);
  renderizarPatrones(patrones);
}
```

`ultimoAnalisis` es la única variable de estado global del módulo. La lee `ia.js` cuando el usuario pulsa "Análisis IA" para incluir los patrones ya detectados en el prompt.

---

## 6. Capa de interfaz — ui.js

`ui.js` gestiona toda la interacción visual que no está relacionada con el análisis clínico.

### 6.1 Navegación por tabs y swipe

```javascript
// Orden de paneles para navegación secuencial (swipe)
const SWIPE_ORDER = ['flujo', 'paciente', 'hema', 'bioquim', 'uri', 'endo', 'imagenes', 'resultados'];

// Detección de swipe táctil
let touchStartX = 0;
document.querySelector('main').addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
});
document.querySelector('main').addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 50) {
    delta < 0 ? activateTab(nextPanel()) : activateTab(prevPanel());
  }
});
```

### 6.2 Sincronización de datos paciente móvil ↔ escritorio

El header de escritorio y el panel móvil de paciente tienen los mismos campos duplicados. `ui.js` los mantiene sincronizados:

```javascript
export function initMobSync(onCambio) {
  const mobFields = document.querySelectorAll('[id^="mob-pt-"]');
  mobFields.forEach(mobInput => {
    const deskId = mobInput.id.replace('mob-pt-', 'pt-');
    const deskInput = document.getElementById(deskId);

    mobInput.addEventListener('change', () => {
      if (deskInput) deskInput.value = mobInput.value;
      onCambio(); // dispara evaluar()
    });

    // Sincronización inversa también
    if (deskInput) {
      deskInput.addEventListener('change', () => {
        mobInput.value = deskInput.value;
      });
    }
  });
}
```

### 6.3 Captura de microscopio (cámara)

```javascript
async function abrirCamara() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' } // cámara trasera en móvil
  });
  videoEl.srcObject = stream;
}

function capturarFotograma() {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);

  // Convierte a JPEG base64 y almacena en memoria
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  microscopioCaptures.push(dataUrl);
  renderizarGaleria();
}
```

Las capturas se almacenan como Data URLs en el array `microscopioCaptures`. Se pasan a `ia.js` cuando el usuario solicita análisis con imágenes.

---

## 7. Autenticación — auth.js y PHP

La autenticación es **completamente opcional** para el análisis clínico. Solo es necesaria si el usuario quiere usar la IA con su propia clave de HuggingFace.

### 7.1 Validación client-side (auth.js)

```javascript
const REGEX_NOMBRE    = /^[\p{L}\s\-.]{2,100}$/u;      // Unicode: acepta tildes, ñ
const REGEX_EMAIL     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const REGEX_HF_KEY    = /^hf_[A-Za-z0-9]{10,}$/;       // Formato de clave HuggingFace
```

```javascript
async function login(email, password) {
  const res = await fetch('api/actions/login.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();

  if (data.ok) {
    // La clave HF va a sessionStorage (no localStorage: se borra al cerrar pestaña)
    sessionStorage.setItem('hf_api_key', data.hf_api_key);
    cerrarModal();
  } else {
    mostrarErrores(data.errors);
  }
}
```

**Por qué `sessionStorage` y no `localStorage`?**
`sessionStorage` se destruye al cerrar la pestaña. La clave API nunca persiste entre sesiones del navegador. Si usara `localStorage`, la clave quedaría expuesta indefinidamente.

### 7.2 Backend PHP — login.php

```php
<?php
// api/actions/login.php
require_once '../config/conexion.php';
session_start();

header('Content-Type: application/json');

$body = json_decode(file_get_contents('php://input'), true);
$email    = trim($body['email']    ?? '');
$password = trim($body['password'] ?? '');

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'errors' => ['general' => 'Datos incompletos']]);
    exit;
}

$stmt = $pdo->prepare('SELECT id, nombre, password_hash, hf_api_key FROM usuarios WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'errors' => ['general' => 'Credenciales inválidas']]);
    exit;
}

$_SESSION['user_id'] = $user['id'];
$_SESSION['nombre']  = $user['nombre'];

// Cookie con máxima seguridad
session_set_cookie_params([
    'httponly'  => true,
    'samesite'  => 'Strict'
]);

echo json_encode(['ok' => true, 'nombre' => $user['nombre'], 'hf_api_key' => $user['hf_api_key']]);
```

**Puntos clave:**
- `password_verify()` compara contra el hash bcrypt almacenado. Nunca se compara texto plano.
- `php://input` lee el body JSON completo (no `$_POST`, que solo funciona con `form-urlencoded`).
- La cookie de sesión usa `httponly` (JavaScript no puede leerla) y `samesite=Strict` (no se envía en peticiones cross-site).

### 7.3 Backend PHP — register.php

```php
<?php
// api/actions/register.php (fragmento clave)
require_once '../config/conexion.php';
session_start();

$body = json_decode(file_get_contents('php://input'), true);

// Validación server-side (no confiar solo en el cliente)
$errors = [];
if (!preg_match('/^[\p{L}\s\-.]{2,100}$/u', $body['nombre'] ?? '')) {
    $errors['nombre'] = 'Nombre inválido';
}
if (!filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email inválido';
}
if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/', $body['password'] ?? '')) {
    $errors['password'] = 'Contraseña débil';
}
if (!preg_match('/^hf_[A-Za-z0-9]{10,}$/', $body['hf_key'] ?? '')) {
    $errors['hf_key'] = 'Clave HuggingFace inválida';
}

if ($errors) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'errors' => $errors]);
    exit;
}

$hash = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);

try {
    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nombre, email, password_hash, hf_api_key) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$body['nombre'], $body['email'], $hash, $body['hf_key']]);
    echo json_encode(['ok' => true]);

} catch (PDOException $e) {
    if ($e->getCode() === '23000') { // violación de UNIQUE en email
        http_response_code(409);
        echo json_encode(['ok' => false, 'errors' => ['email' => 'Email ya registrado']]);
    } else {
        http_response_code(500);
        echo json_encode(['ok' => false, 'errors' => ['general' => 'Error del servidor']]);
    }
}
```

**`cost: 12` en bcrypt:** El "costo" determina cuántas iteraciones hace el algoritmo de hashing. Con costo 12, tarda ~250ms. Eso es imperceptible para un usuario legítimo, pero hace que un ataque de fuerza bruta sea extremadamente lento.

### 7.4 Conexión PDO — conexion.php

```php
<?php
// api/config/conexion.php
$dsn = 'mysql:host=localhost;dbname=morphos;charset=utf8mb4';

try {
    $pdo = new PDO($dsn, 'root', '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error de base de datos']);
    exit;
}
```

**Por qué PDO y no `mysqli_*`?**
PDO es agnóstico al motor de base de datos (podría cambiarse a PostgreSQL sin tocar los archivos de acción). `ATTR_EMULATE_PREPARES => false` garantiza que las *prepared statements* se ejecuten como tales en el motor, no en PHP, evitando inyección SQL.

### 7.5 Verificación de sesión — session.php

```php
<?php
// api/actions/session.php
session_start();
header('Content-Type: application/json');

if (isset($_SESSION['user_id'])) {
    $stmt = $pdo->prepare('SELECT nombre, hf_api_key FROM usuarios WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();

    echo json_encode([
        'loggedIn'   => true,
        'nombre'     => $user['nombre'],
        'hf_api_key' => $user['hf_api_key']
    ]);
} else {
    echo json_encode(['loggedIn' => false]);
}
```

Este endpoint se llama al cargar la página. Si hay sesión activa, restaura el nombre del usuario y la clave HF en `sessionStorage` sin necesidad de un nuevo login.

---

## 8. Integración IA — ia.js

### 8.1 Construcción del prompt

El prompt que se envía al modelo MedGemma se construye dinámicamente con los datos del paciente y el análisis ya realizado:

```javascript
function construirPrompt(paciente, valoresInput, hallazgos, patrones, referencias, signosClinicos) {
  let prompt = `IMPORTANTE: Responde ÚNICAMENTE en español.\n\n`;
  prompt += `Eres un médico veterinario especialista en patología clínica.\n`;

  if (paciente.especie === 'felino') {
    prompt += `Evalúa posibles hemoparásitos felinos (Mycoplasma haemofelis) si hay anemia.\n`;
  }

  prompt += `\nPaciente: ${paciente.especie}, raza: ${paciente.raza || 'no especificada'}, `;
  prompt += `edad: ${formatearEdad(paciente.edadMeses)}, sexo: ${paciente.sexo || 'no especificado'}\n`;

  prompt += `\nResultados de laboratorio:\n`;
  for (const [clave, valor] of Object.entries(valoresInput)) {
    const ref = referencias[clave];
    if (!ref) continue;
    const hallazgo = hallazgos.find(h => h.clave === clave);
    const flag = hallazgo
      ? ` ← ${hallazgo.direccion.toUpperCase()} (${hallazgo.gravedad})`
      : '';
    prompt += `  ${ref.nombre}: ${valor} ${ref.unidad} [ref: ${ref.inferior}–${ref.superior}]${flag}\n`;
  }

  if (patrones.length > 0) {
    prompt += `\nPatrones detectados:\n`;
    patrones.forEach(p => { prompt += `  - ${p.nombre}: ${p.descripcion}\n`; });
  }

  if (signosClinicos?.trim()) {
    prompt += `\nSignos clínicos reportados: ${signosClinicos}\n`;
  }

  prompt += `\nProporciona una interpretación clínica breve (6-8 oraciones). `;
  prompt += `Incluye diagnósticos diferenciales prioritarios y próximos pasos.`;

  return prompt;
}
```

El prompt incluye:
- Instrucción de idioma (primero, para que MedGemma lo respete)
- Rol del modelo
- Contexto especie-específico
- Datos del paciente
- Tabla de valores con referencias y flags de anormalidad
- Patrones ya detectados por el motor JavaScript
- Signos clínicos opcionales escritos por el veterinario

### 8.2 Llamada a HuggingFace Inference API

```javascript
async function llamarHuggingFace(prompt, imagenes, modelo, apiKey) {
  const messages = [{ role: 'user', content: [] }];

  // Añade imágenes si las hay (formato multimodal)
  imagenes.forEach(dataUrl => {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: dataUrl } // ya viene como data:image/jpeg;base64,...
    });
  });

  messages[0].content.push({ type: 'text', text: prompt });

  const res = await fetch(
    `https://router.huggingface.co/featherless-ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelo,           // e.g. "unsloth/medgemma-4b-it"
        messages,
        max_tokens: 600,
        stream: false
      })
    }
  );

  const data = await res.json();
  return data.choices[0].message.content;
}
```

### 8.3 Llamada a HuggingFace Space (Gradio)

Para el modelo fine-tuned `blackmistcode/morphos_medGemma`, el endpoint es un Space de Gradio que usa Server-Sent Events:

```javascript
async function llamarHuggingFaceSpace(prompt, imagen, apiKey) {
  // Paso 1: iniciar el job
  const initRes = await fetch(`${SPACE_URL}/gradio_api/call/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ data: [imagen || null, prompt] })
  });
  const { event_id } = await initRes.json();

  // Paso 2: escuchar el stream SSE hasta que llegue 'complete'
  return new Promise((resolve, reject) => {
    const evtSource = new EventSource(
      `${SPACE_URL}/gradio_api/call/analyze/${event_id}`
    );
    evtSource.addEventListener('complete', e => {
      evtSource.close();
      const payload = JSON.parse(e.data);
      resolve(payload[0]); // primer elemento del array de salida
    });
    evtSource.onerror = () => { evtSource.close(); reject(new Error('SSE error')); };
  });
}
```

**SSE (Server-Sent Events):** Es un protocolo unidireccional (servidor → cliente) sobre HTTP. El servidor mantiene la conexión abierta y envía eventos con formato `event: tipo\ndata: payload\n\n`. Aquí se usa para saber cuándo el modelo terminó de inferir en el Space de Gradio.

### 8.4 Llamada a Ollama (modo local)

```javascript
async function llamarOllama(prompt, imagenes, baseUrl, modelo) {
  const content = [];
  imagenes.forEach(dataUrl => {
    // Ollama espera base64 puro, sin el prefijo "data:image/jpeg;base64,"
    const base64 = dataUrl.split(',')[1];
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
  });
  content.push({ type: 'text', text: prompt });

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content }],
      max_tokens: 600,
      stream: false
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}
```

Ollama expone una API compatible con OpenAI (`/v1/chat/completions`). El usuario debe tener Ollama corriendo en su máquina local.

### 8.5 Limpieza de la respuesta

MedGemma puede incluir tokens de control de su fine-tuning que no deben mostrarse al usuario:

```javascript
function limpiarRespuesta(texto) {
  return texto
    .replace(/<unused9[0-9]>/g, '')   // tokens especiales de MedGemma
    .replace(/<start_of_turn>/g, '')
    .replace(/<end_of_turn>/g, '')
    .replace(/model\s*/gi, '')
    .trim();
}
```

---

## 9. Datos JSON como base de conocimiento

### 9.1 valores_referencia.json

```json
{
  "canino": {
    "rbc":         { "inferior": 5.5,  "superior": 8.5,   "unidad": "x10⁶/μL",  "nombre": "Eritrocitos (RBC)" },
    "hgb":         { "inferior": 12.0, "superior": 18.0,  "unidad": "g/dL",      "nombre": "Hemoglobina (HGB)" },
    "wbc":         { "inferior": 6.0,  "superior": 17.0,  "unidad": "x10³/μL",   "nombre": "Leucocitos (WBC)" },
    "alp":         { "inferior": 23,   "superior": 212,   "unidad": "U/L",       "nombre": "Fosfatasa Alcalina (ALP)" },
    "creatinine":  { "inferior": 0.5,  "superior": 1.5,   "unidad": "mg/dL",     "nombre": "Creatinina" },
    "sodium":      { "inferior": 141,  "superior": 152,   "unidad": "mEq/L",     "nombre": "Sodio" }
  },
  "felino": {
    "alp":         { "inferior": 10,   "superior": 90,    "unidad": "U/L",       "nombre": "Fosfatasa Alcalina (ALP)" },
    "creatinine":  { "inferior": 0.8,  "superior": 2.4,   "unidad": "mg/dL",     "nombre": "Creatinina" }
  }
}
```

Los rangos de gato y perro **son diferentes** para muchos parámetros. La ALP de un gato tiene rango normal mucho más bajo (10–90) que la de un perro (23–212). Separar esto en JSON permite cambiar rangos sin tocar código.

### 9.2 alteraciones.json

```json
{
  "anemia": {
    "nombre": "Anemia",
    "prefijo": "Parámetros eritrocitarios disminuidos.",
    "etiologias": {
      "ferropenia": "Compatible con déficit de hierro (anemia ferropénica). Causas: hemorragia crónica, parasitismo, malnutrición.",
      "macrocitica": "Compatible con anemia regenerativa activa. Causas: hemólisis, hemorragia aguda.",
      "normocitica": "Compatible con anemia no regenerativa. Causas: enfermedad crónica, aplasia medular, nefropatía."
    }
  },
  "ratio_nak": {
    "nombre": "Ratio Na:K disminuido (<27)",
    "descripcion": {
      "canino": "Sugerente de hipoadrenocorticismo (enfermedad de Addison). Confirmar con test de estimulación con ACTH.",
      "felino": "Menos específico en gatos; descartar también pleural efusión y diarrea crónica."
    }
  }
}
```

Algunos patrones tienen `descripcion` como string simple y otros como objeto `{ canino, felino }` cuando la interpretación clínica difiere por especie. `analisis.js` selecciona la descripción correcta:

```javascript
const desc = alt[clave]?.descripcion;
const descripcionFinal = typeof desc === 'object'
  ? (desc[especie] || desc.canino || '')
  : (desc || '');
```

---

## 10. Decisiones arquitectónicas clave

### 10.1 Sin frameworks, sin build step

No hay React, Vue, Angular, webpack ni Vite. Esto fue una decisión deliberada:

- **Ventaja:** Cero dependencias externas. El proyecto funciona con `python3 -m http.server`.
- **Ventaja:** Es más fácil de entender y auditar (todo el código es visible y legible).
- **Desventaja:** Sin reactividad automática (hay que actualizar el DOM manualmente). Sin componentes reutilizables formales.

### 10.2 Análisis clínico 100% client-side

El motor de análisis (`analisis.js`) nunca hace llamadas de red. Esto significa:

- La app funciona sin conexión una vez cargada.
- No hay latencia de servidor en el análisis.
- No hay datos del paciente enviados a ningún servidor (privacidad por diseño).
- Escala infinito: mil usuarios simultáneos no afectan el rendimiento.

### 10.3 Función pura como núcleo

`analizarResultados()` es una **función pura**: mismo input siempre produce mismo output, sin efectos secundarios. Esto hace que:

- Sea testeable (aunque no hay tests escritos, podría hacerse fácilmente).
- Sea predecible (no hay estado oculto que afecte el resultado).
- Pueda importarse desde cualquier contexto sin efectos secundarios.

### 10.4 Datos clínicos externalizados en JSON

Los rangos de referencia y las descripciones de patrones viven en archivos JSON, no en el código:

- Un veterinario podría actualizar rangos sin saber JavaScript.
- Facilita localización (cambiar idioma de descripciones sin tocar lógica).
- El código de análisis no cambia si cambian los valores clínicos.

### 10.5 IA como capa opcional

El análisis regla-base funciona sin autenticación y sin red. La IA es una mejora encima de eso:

```
SIN IA:  Input → Motor JS → Patrones + Hallazgos  (siempre disponible)
CON IA:  Input → Motor JS → Patrones → Prompt → MedGemma → Interpretación
```

Si HuggingFace no está disponible o el usuario no tiene clave, la app sigue siendo útil.

### 10.6 Multi-backend para IA

La misma interfaz soporta backends radicalmente diferentes (Ollama local vs. HuggingFace remoto) con una sola variable de configuración en `localStorage`. El usuario elige en tiempo de ejecución, no en el código.

### 10.7 Separación de estado

| Tipo de estado | Dónde vive |
|---------------|-----------|
| Preferencia de tema | `localStorage` |
| Estado de paneles colapsados | `localStorage` |
| Backend IA seleccionado | `localStorage` |
| Clave HuggingFace | `sessionStorage` (se borra al cerrar pestaña) |
| Sesión del servidor | Cookie HTTP (gestionada por PHP) |
| Datos del análisis actual | Variables de módulo en `main.js` |
| Referencias y alteraciones | Variables de módulo en `main.js` (cargadas al inicio) |

No hay base de datos de datos de pacientes. Los datos del formulario solo existen en el DOM mientras la página está abierta.

---

## 11. Posibles preguntas del profesor

**¿Por qué no usaron un framework como React o Vue?**
> Para este tipo de aplicación (single-page, sin routing complejo, sin estado compartido profundo), la complejidad de un framework no estaba justificada. Vanilla JS con módulos ES6 es suficiente y más transparente para un proyecto académico. El análisis clínico es una función pura que no se beneficia de la reactividad de un framework.

**¿Cómo protegen la contraseña de los usuarios?**
> Nunca se almacena la contraseña. Se guarda un hash bcrypt con costo 12 (`password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12])`). Para verificar, se usa `password_verify()` que compara el hash sin necesidad de conocer el texto original.

**¿Cómo funciona la detección de patrones clínicos?**
> Es un motor de reglas determinista: para cada patrón conocido (anemia, azotemia, colestasis, etc.) hay condiciones que deben cumplirse sobre los hallazgos. Por ejemplo, anemia microcítica requiere RBC bajo + MCV bajo. No hay machine learning en esta parte; es conocimiento veterinario codificado como if-chains.

**¿Por qué la clave de HuggingFace va en sessionStorage y no en localStorage?**
> `sessionStorage` se destruye cuando se cierra la pestaña del navegador. `localStorage` persiste indefinidamente. Una clave API en `localStorage` quedaría expuesta en cualquier script que corra en el mismo origen. `sessionStorage` limita la exposición a la duración de la sesión activa.

**¿Qué es una función pura y por qué la usaron en `analisis.js`?**
> Una función pura es aquella que: (1) dado el mismo input, siempre devuelve el mismo output, y (2) no tiene efectos secundarios (no modifica variables externas, no hace I/O). `analizarResultados()` cumple ambas condiciones: recibe datos, hace cálculos y devuelve un resultado, sin tocar el DOM ni hacer fetch. Esto la hace predecible y fácil de razonar.

**¿Cómo funciona el SSE (Server-Sent Events) en la integración con el Space de Gradio?**
> SSE es un protocolo donde el servidor mantiene una conexión HTTP abierta y envía datos al cliente cuando tiene algo nuevo. Se usa aquí porque la inferencia del modelo puede tardar varios segundos. En lugar de hacer polling cada X segundos, abrimos un `EventSource` que recibe el evento `complete` automáticamente cuando el modelo termina.

**¿Por qué los `name` de los inputs HTML coinciden con las claves del JSON?**
> Para evitar cualquier capa de traducción entre el DOM y el motor de análisis. Los atributos `name` usan abreviaturas en español (`fal`, `vcm`, `neutro`, `sodio`) que son las mismas claves en `valores_referencia.json` y en los hallazgos de `analisis.js`. Así `obtenerValoresFormulario` es una sola línea de lógica, y `actualizarClasesInputs` busca el input con `h.clave` directamente, sin diccionarios intermedios.

**¿Por qué PHP solo para autenticación y no para el análisis?**
> El análisis clínico no requiere persistencia ni recursos del servidor. Correrlo en PHP implicaría: latencia de red en cada cambio de valor, mantener estado de servidor, y enviar datos del paciente al servidor (problema de privacidad). Correrlo en JavaScript es instantáneo, privado y sin costo de infraestructura.

**¿Cómo funciona el ajuste de rangos de referencia por raza?**
> Se aplican multiplicadores. Por ejemplo, los Galgos tienen fisiológicamente más eritrocitos que razas convencionales. Si el rango normal de RBC para caninos en general es 5.5–8.5, para un Galgo se ajusta a 6.05–9.78 (multiplicadores 1.1 y 1.15). Sin este ajuste, un Galgo sano aparecería con "eritrocitosis" falsamente.

---

*Generado el 5 de mayo de 2026. Versión del proyecto: rama `jose`.*
