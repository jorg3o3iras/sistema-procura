/* ============================================================
   API CLIENT — Conecta o frontend ao backend Flask + Neon
   ============================================================ */
const API_URL = 'https://sistema-procura.onrender.com';

const API = {
    async request(method, path, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);

        try {
            const res = await fetch(API_URL + path, opts);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.erro || `HTTP ${res.status}`);
            }
            return data;
        } catch (e) {
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                throw new Error('Backend offline. Aguarde 30s e tente de novo.');
            }
            throw e;
        }
    },

    // ============ AUTENTICAÇÃO ============
    login(username, password) {
        return this.request('POST', '/api/login', { username, password });
    },

    // ============ ESTATÍSTICAS ============
    estatisticas() {
        return this.request('GET', '/api/estatisticas');
    },

    // ============ REGISTROS ============
    listarRegistros() {
        return this.request('GET', '/api/registros');
    },
    buscarRegistro(id) {
        return this.request('GET', `/api/registros/${id}`);
    },
    criarRegistro(dados) {
        return this.request('POST', '/api/registros', dados);
    },
    atualizarRegistro(id, dados) {
        return this.request('PUT', `/api/registros/${id}`, dados);
    },
    excluirRegistro(id) {
        return this.request('DELETE', `/api/registros/${id}`);
    },

    // ============ BUSCA FACIAL ============
    buscaFacial(imagemBase64) {
        return this.request('POST', '/api/busca-facial', { imagem: imagemBase64 });
    },

    // ============ AUDITORIA ============
    auditoria(limite = 500) {
        return this.request('GET', `/api/auditoria?limite=${limite}`);
    }
};

console.log('[API] Cliente carregado. Backend em:', API_URL);