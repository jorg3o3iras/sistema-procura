/* ============================================================
   GERENCIAMENTO DE TEMA CLARO/ESCURO
   ============================================================ */
const ThemeManager = {
    STORAGE_KEY: 'sistema-procura-theme',

    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY) || 'dark';
        this.apply(saved);
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggle());
    },

    apply(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem(this.STORAGE_KEY, theme);
    },

    toggle() {
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        this.apply(next);
        Toast.show(`Tema ${next === 'dark' ? 'escuro' : 'claro'} ativado`, 'info');
    }
};