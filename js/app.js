/* ============================================================
   SISTEMA DE PROCURA - APLICAÇÃO PRINCIPAL (API + Neon)
   ============================================================ */

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const AppState = {
    usuarioLogado: null,
    registros: [],
    auditoria: [],
    registroAtualId: null,
    tema: 'dark'
};

/* ============================================================
   UTILITÁRIOS DE UI
   ============================================================ */
const Toast = {
    show(mensagem, tipo = 'info', duracao = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.textContent = mensagem;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(120%)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, duracao);
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg)   { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg)    { this.show(msg, 'info'); }
};

const Modal = {
    abrir(id) {
        document.getElementById(id)?.classList.add('active');
    },
    fechar(id) {
        document.getElementById(id)?.classList.remove('active');
    },
    fecharTodos() {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
};

const Loading = {
    show(texto = 'Processando...') {
        const el = document.getElementById('loading-overlay');
        document.getElementById('loading-text').textContent = texto;
        el.hidden = false;
    },
    hide() {
        document.getElementById('loading-overlay').hidden = true;
    }
};

const Confirm = {
    _resolve: null,
    abrir(titulo, mensagem) {
        return new Promise(resolve => {
            this._resolve = resolve;
            document.getElementById('confirm-titulo').textContent = titulo;
            document.getElementById('confirm-mensagem').textContent = mensagem;
            Modal.abrir('modal-confirm');
        });
    },
    init() {
        document.getElementById('confirm-yes')?.addEventListener('click', () => {
            Modal.fechar('modal-confirm');
            if (this._resolve) this._resolve(true);
        });
        document.getElementById('confirm-no')?.addEventListener('click', () => {
            Modal.fechar('modal-confirm');
            if (this._resolve) this._resolve(false);
        });
    }
};

/* Helpers */
function formatarData(dataStr) {
    if (!dataStr) return '—';
    return dataStr;
}

function validarData(data) {
    if (!data) return true;
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(data)) return false;
    const [d, m, a] = data.split('/').map(Number);
    const dt = new Date(a, m - 1, d);
    return dt.getDate() === d && dt.getMonth() === m - 1 && dt.getFullYear() === a;
}

function validarAltura(altura) {
    if (!altura) return true;
    const v = parseFloat(altura.replace(',', '.'));
    return !isNaN(v) && v >= 0.5 && v <= 2.5;
}

function validarRG(rg) {
    if (!rg) return true;
    return /^[\d.\-/]+$/.test(rg);
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
}

function gerarId() {
    return Math.random().toString(36).substr(2, 9);
}

/* ============================================================
   SISTEMA DE ABAS
   ============================================================ */
const TabsManager = {
    init() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.ativar(btn.dataset.tab));
        });
    },
    ativar(nome) {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === nome);
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.classList.toggle('active', p.id === `tab-${nome}`);
        });
        if (nome === 'dashboard') Dashboard.atualizar();
        if (nome === 'auditoria') Auditoria.atualizar();
        localStorage.setItem('sistema-procura-tab', nome);
    }
};

/* ============================================================
   TOOLBAR
   ============================================================ */
const Toolbar = {
    init() {
        document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const acao = btn.dataset.action;
                switch (acao) {
                    case 'novo': Cadastro.novo(); break;
                    case 'salvar': Cadastro.cadastrar(); break;
                    case 'pesquisar': TabsManager.ativar('pesquisa'); break;
                    case 'imagem': TabsManager.ativar('busca-imagem'); break;
                    case 'dashboard': TabsManager.ativar('dashboard'); break;
                    case 'auditoria': TabsManager.ativar('auditoria'); break;
                    case 'backup': Toolbar.backup(); break;
                }
            });
        });
        document.getElementById('btn-logout')?.addEventListener('click', () => AuthUI.logout());
    },
    async backup() {
        try {
            const registros = await API.listarRegistros();
            const dados = {
                registros,
                exportado_em: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Toast.success('Backup exportado!');
        } catch (e) {
            Toast.error('Erro: ' + e.message);
        }
    }
};

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */
const AuthUI = {
    init() {
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
        document.getElementById('btn-login-sair')?.addEventListener('click', () => {
            window.close();
        });
        document.getElementById('login-pass')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    },

    async login() {
        const username = document.getElementById('login-user').value.trim();
        const senha = document.getElementById('login-pass').value;
        if (!username || !senha) {
            Toast.warning('Preencha usuário e senha.');
            return;
        }
        try {
            Loading.show('Autenticando...');
            const user = await API.login(username, senha);
            AppState.usuarioLogado = user;
            // Salva apenas a sessão, não os dados
            sessionStorage.setItem('sp_user', JSON.stringify(user));
            Loading.hide();
            this.mostrarApp();
            Toast.success(`Bem-vindo, ${user.username}!`);
        } catch (e) {
            Loading.hide();
            Toast.error(e.message);
        }
    },

    mostrarApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        document.getElementById('user-display').textContent = AppState.usuarioLogado.username;
        Dashboard.atualizar();
        Cadastro.atualizarListasDinamicas();
        atualizarStatusBar();
    },

    async logout() {
        const ok = await Confirm.abrir('Sair', 'Deseja realmente sair do sistema?');
        if (!ok) return;
        AppState.usuarioLogado = null;
        AppState.registroAtualId = null;
        sessionStorage.removeItem('sp_user');
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('login-form').reset();
        document.getElementById('login-user').focus();
    },

    // Se o usuário já estava logado na mesma sessão do navegador
    tentarRestaurarSessao() {
        const saved = sessionStorage.getItem('sp_user');
        if (saved) {
            try {
                AppState.usuarioLogado = JSON.parse(saved);
                this.mostrarApp();
                return true;
            } catch (e) {
                sessionStorage.removeItem('sp_user');
            }
        }
        return false;
    }
};

/* ============================================================
   STATUS BAR
   ============================================================ */
async function atualizarStatusBar() {
    try {
        const st = await API.estatisticas();
        const user = AppState.usuarioLogado?.username || '—';
        document.getElementById('status-text').textContent =
            `👤 ${user} | 📊 ${st.total} registros | 📷 ${st.com_foto} com foto | 🧠 ${st.com_embedding} indexados | 📄 ${st.com_pdf} com PDF | v3.3`;
    } catch (e) {
        document.getElementById('status-text').textContent = 'Backend offline';
    }
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    Confirm.init();
    TabsManager.init();
    Toolbar.init();
    AuthUI.init();
    Dashboard.init();
    Cadastro.init();
    Pesquisa.init();
    BuscaImagem.init();
    Auditoria.init();

    const ultimaTab = localStorage.getItem('sistema-procura-tab') || 'dashboard';
    TabsManager.ativar(ultimaTab);

    // Tenta restaurar sessão
    AuthUI.tentarRestaurarSessao();

    document.getElementById('login-user')?.focus();

    // Atalhos
    document.addEventListener('keydown', (e) => {
        if (!AppState.usuarioLogado) return;
        if (e.ctrlKey && e.key === 'n') { e.preventDefault(); Cadastro.novo(); }
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); Cadastro.cadastrar(); }
        if (e.ctrlKey && e.key === 't') { e.preventDefault(); ThemeManager.toggle(); }
        if (e.ctrlKey && e.key === 'b') { e.preventDefault(); Toolbar.backup(); }
        if (e.key === 'F5') { e.preventDefault(); Dashboard.atualizar(); }
        if (e.key === 'Escape') Modal.fecharTodos();
    });

    // Fecha modais clicando no overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) Modal.fechar(overlay.id);
        });
        overlay.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => Modal.fechar(btn.dataset.close));
        });
    });
});
