// Bottom navigation tab switching
const tabs = document.querySelectorAll('.nav-tab');
const panels = document.querySelectorAll('main > .panel');

function activateTab(targetId) {
    tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });
    panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === targetId);
    });
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
});
