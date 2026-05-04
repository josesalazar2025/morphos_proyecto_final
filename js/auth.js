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

export function abrirModal(tab = 'login') {
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
            sessionStorage.setItem('hf_api_key', data.hf_api_key ?? '');
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

    if (!REGEX_NOMBRE.test(nombre)) { setFieldError('err-reg-nombre', 'Nombre inválido (2-100 caracteres, solo letras)'); ok = false; }
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
    sessionStorage.removeItem('hf_api_key');
    btnAuth.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Iniciar sesión`;
    btnAuth.title = '';
}

(async () => {
    try {
        const res = await fetch('api/actions/session.php');
        const data = await res.json();
        if (data.loggedIn) {
            sessionActiva = true;
            sessionStorage.setItem('hf_api_key', data.hf_api_key ?? '');
            actualizarHeaderAuth(data.nombre);
        }
    } catch {}
})();

export const getSessionActiva = () => sessionActiva;
