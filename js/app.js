/* ============================================================
   SISTEMA DE PROCURA - APLICAÇÃO PRINCIPAL (FRONTEND)
   ============================================================ */

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const AppState = {
    usuarioLogado: null,
    registros: [],           // Mock de dados
    auditoria: [],
    proximoId: 1,
    tema: 'dark',
    registroAtualId: null
};

/* ============================================================
   DADOS MOCK (simulando SQLite)
   ============================================================ */
const MockDB = {
    init() {
        // Carrega dados de exemplo se não houver
        const saved = localStorage.getItem('sistema-procura-db');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                AppState.registros = data.registros || [];
                AppState.auditoria = data.auditoria || [];
                AppState.proximoId = data.proximoId || 1;
                return;
            } catch (e) {
                console.warn('Falha ao carregar dados salvos', e);
            }
        }
        this.seed();
    },

    seed() {
        AppState.registros = [
            {
                id: 1, nome: 'João da Silva', rg: '12.345.678-9',
                apelido: 'Joãozinho', tatuagem: 'Dragão no braço',
                sinais: 'Cicatriz no queixo', cor: 'Parda',
                altura: '1.75', data_nascimento: '15/03/1985',
                cidade: 'São Paulo', observacoes: 'Registro de exemplo',
                data_cadastro: '2025-01-10 10:30:00',
                fotos: [], pdfs: []
            },
            {
                id: 2, nome: 'Maria Santos', rg: '98.765.432-1',
                apelido: 'Mari', tatuagem: 'Borboleta nas costas',
                sinais: 'Pinta no rosto', cor: 'Branca',
                altura: '1.62', data_nascimento: '22/07/1990',
                cidade: 'Rio de Janeiro', observacoes: '',
                data_cadastro: '2025-01-12 14:15:00',
                fotos: [], pdfs: []
            },
            {
                id: 3, nome: 'Carlos Pereira', rg: '11.222.333-4',
                apelido: 'Carlão', tatuagem: '',
                sinais: 'Tatuagem no pescoço', cor: 'Negra',
                altura: '1.88', data_nascimento: '05/11/1978',
                cidade: 'Belo Horizonte', observacoes: '',
                data_cadastro: '2025-01-15 09:00:00',
                fotos: [], pdfs: []
            }
        ];
        AppState.proximoId = 4;
        this.save();
    },

    save() {
        try {
            localStorage.setItem('sistema-procura-db', JSON.stringify({
                registros: AppState.registros,
                auditoria: AppState.auditoria,
                proximoId: AppState.proximoId
            }));
        } catch (e) {
            console.warn('Falha ao salvar dados', e);
        }
    },

    // --- CRUD ---
    listarTodos() {
        return [...AppState.registros].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    buscarPorId(id) {
        return AppState.registros.find(r => r.id === id) || null;
    },

    nomeExiste(nome, excluirId = null) {
        return AppState.registros.some(r =>
            r.nome.toLowerCase() === nome.toLowerCase() && r.id !== excluirId
        );
    },

    inserir(dados) {
        const novo = {
            id: AppState.proximoId++,
            ...dados,
            data_cadastro: new Date().toLocaleString('pt-BR').replace(',', ''),
            fotos: dados.fotos || [],
            pdfs: dados.pdfs || []
        };
        AppState.registros.push(novo);
        this.save();
        return novo.id;
    },

    atualizar(id, dados) {
        const idx = AppState.registros.findIndex(r => r.id === id);
        if (idx === -1) return 0;
        AppState.registros[idx] = { ...AppState.registros[idx], ...dados };
        this.save();
        return 1;
    },

    excluir(id) {
        AppState.registros = AppState.registros.filter(r => r.id !== id);
        this.save();
    },

    estatisticas() {
        const total = AppState.registros.length;
        const comFoto = AppState.registros.filter(r => r.fotos && r.fotos.length > 0).length;
        const indexados = AppState.registros.filter(r =>
            r.fotos && r.fotos.some(f => f.embedding)
        ).length;
        const comPdf = AppState.registros.filter(r => r.pdfs && r.pdfs.length > 0).length;
        const totalFotos = AppState.registros.reduce((acc, r) => acc + (r.fotos?.length || 0), 0);
        return { total, comFoto, indexados, comPdf, semFoto: total - comFoto, totalFotos };
    },

    registrarAuditoria(usuario, acao, alvoId = null, detalhes = '') {
        AppState.auditoria.unshift({
            id: AppState.auditoria.length + 1,
            usuario, acao, alvo_id: alvoId, detalhes,
            timestamp: new Date().toLocaleString('pt-BR').replace(',', '')
        });
        if (AppState.auditoria.length > 1000) AppState.auditoria.pop();
        this.save();
    },

    listarAuditoria(limite = 500) {
        return AppState.auditoria.slice(0, limite);
    }
};

/* ============================================================
   AUTENTICAÇÃO (mock)
   ============================================================ */
const Auth = {
    USERS_KEY: 'sistema-procura-users',

    init() {
        const saved = localStorage.getItem(this.USERS_KEY);
        if (saved) return;
        // Cria admin padrão
        this.criarUsuario('admin', 'admin123', 'admin');
    },

    criarUsuario(username, senha, role = 'admin') {
        const users = this.listarUsuarios();
        if (users.some(u => u.username === username)) return false;
        users.push({ username, senha: btoa(senha), role, criado_em: new Date().toISOString() });
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        return true;
    },

    listarUsuarios() {
        try {
            return JSON.parse(localStorage.getItem(this.USERS_KEY)) || [];
        } catch { return []; }
    },

    autenticar(username, senha) {
        const user = this.listarUsuarios().find(u => u.username === username);
        if (!user) return null;
        if (user.senha === btoa(senha)) return user;
        return null;
    }
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
        document.getElementById('confirm-yes').addEventListener('click', () => {
            Modal.fechar('modal-confirm');
            if (this._resolve) this._resolve(true);
        });
        document.getElementById('confirm-no').addEventListener('click', () => {
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

        // Atualiza dados ao entrar
        if (nome === 'dashboard') Dashboard.atualizar();
        if (nome === 'auditoria') Auditoria.atualizar();

        // Salva última aba
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

    backup() {
        try {
            const dados = {
                registros: AppState.registros,
                auditoria: AppState.auditoria,
                exportado_em: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            MockDB.registrarAuditoria(AppState.usuarioLogado?.username, 'BACKUP');
            Toast.success('Backup exportado com sucesso!');
        } catch (e) {
            Toast.error('Erro ao exportar backup: ' + e.message);
        }
    }
};

/* ============================================================
   AUTENTICAÇÃO - UI
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

    login() {
        const username = document.getElementById('login-user').value.trim();
        const senha = document.getElementById('login-pass').value;
        if (!username || !senha) {
            Toast.warning('Preencha usuário e senha.');
            return;
        }
        const user = Auth.autenticar(username, senha);
        if (!user) {
            Toast.error('Usuário ou senha incorretos.');
            MockDB.registrarAuditoria(username, 'LOGIN_FALHA');
            return;
        }
        AppState.usuarioLogado = user;
        MockDB.registrarAuditoria(username, 'LOGIN_OK');
        this.mostrarApp();
    },

    mostrarApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        document.getElementById('user-display').textContent = AppState.usuarioLogado.username;
        // Inicializa módulos
        Dashboard.atualizar();
        Cadastro.atualizarListasDinamicas();
        atualizarStatusBar();
    },

    logout() {
        Confirm.abrir('Sair', 'Deseja realmente sair do sistema?').then(ok => {
            if (!ok) return;
            MockDB.registrarAuditoria(AppState.usuarioLogado?.username, 'LOGOUT');
            AppState.usuarioLogado = null;
            AppState.registroAtualId = null;
            document.getElementById('app-screen').classList.remove('active');
            document.getElementById('login-screen').classList.add('active');
            document.getElementById('login-form').reset();
            document.getElementById('login-user').focus();
        });
    }
};

/* ============================================================
   STATUS BAR
   ============================================================ */
function atualizarStatusBar() {
    const st = MockDB.estatisticas();
    const user = AppState.usuarioLogado?.username || '—';
    document.getElementById('status-text').textContent =
        `👤 ${user} | 📊 ${st.total} registros | 📷 ${st.comFoto} com foto | 🧠 ${st.indexados} indexados | 📄 ${st.comPdf} com PDF | v3.3`;
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    MockDB.init();
    Auth.init();
    Confirm.init();
    TabsManager.init();
    Toolbar.init();
    AuthUI.init();
    Dashboard.init();
    Cadastro.init();
    Pesquisa.init();
    BuscaImagem.init();
    Auditoria.init();

    // Aplica última aba
    const ultimaTab = localStorage.getItem('sistema-procura-tab') || 'dashboard';
    TabsManager.ativar(ultimaTab);

    // Foca no usuário do login
    document.getElementById('login-user')?.focus();

    // Atalhos de teclado
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