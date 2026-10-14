/* ============================================================
   PESQUISA — busca na API (Neon)
   ============================================================ */
const Pesquisa = {
    init() {
        document.getElementById('btn-procurar')?.addEventListener('click', () => this.procurar());
        document.getElementById('btn-pesq-limpar')?.addEventListener('click', () => this.limpar());
        document.getElementById('btn-pesq-abrir')?.addEventListener('click', () => this._abrirSelecionado());
        document.getElementById('btn-pesq-preencher')?.addEventListener('click', () => this._preencherFormulario());

        const inputs = ['pesq-id', 'pesq-nome', 'pesq-apelido', 'pesq-rg',
            'pesq-nascimento', 'pesq-cor', 'pesq-altura', 'pesq-cidade', 'pesq-obs'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                let t;
                el.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => this.procurar(true), 400);
                });
                el.addEventListener('keypress', e => { if (e.key === 'Enter') this.procurar(); });
            }
        });

        document.querySelector('#table-pesquisa tbody')?.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            if (!tr || !tr.dataset.id) return;
            document.querySelectorAll('#table-pesquisa tbody tr').forEach(t => t.classList.remove('selected'));
            tr.classList.add('selected');
            this._mostrarDetalhe(parseInt(tr.dataset.id));
        });

        document.querySelector('#table-pesquisa tbody')?.addEventListener('dblclick', () => this._abrirSelecionado());
    },

    async procurar(silencioso = false) {
        const id = document.getElementById('pesq-id').value.trim();
        const nome = document.getElementById('pesq-nome').value.trim();
        const rg = document.getElementById('pesq-rg').value.trim();
        const apelido = document.getElementById('pesq-apelido').value.trim();
        const nasc = document.getElementById('pesq-nascimento').value.trim();
        const cor = document.getElementById('pesq-cor').value.trim();
        const altura = document.getElementById('pesq-altura').value.trim();
        const cidade = document.getElementById('pesq-cidade').value.trim();
        const obs = document.getElementById('pesq-obs').value.trim();
        const tatuagens = Cadastro.getValoresLista('pesq-lista-tatuagens');
        const sinais = Cadastro.getValoresLista('pesq-lista-sinais');

        const vazio = !id && !nome && !rg && !apelido && !nasc && !cor &&
            !altura && !cidade && !obs && tatuagens.length === 0 && sinais.length === 0;

        if (vazio) {
            if (!silencioso) {
                this._setResultadoTexto('Preencha pelo menos um campo.', 'warning');
                document.querySelector('#table-pesquisa tbody').innerHTML = '';
                this._limparDetalhe();
            }
            return;
        }

        try {
            const registros = await API.listarRegistros();
            const resultados = registros.filter(u => {
                if (id && parseInt(id) !== u.id) return false;
                if (nome && !u.nome.toLowerCase().includes(nome.toLowerCase())) return false;
                if (rg && !(u.rg || '').toLowerCase().includes(rg.toLowerCase())) return false;
                if (apelido && !(u.apelido || '').toLowerCase().includes(apelido.toLowerCase())) return false;
                if (nasc && !(u.data_nascimento || '').includes(nasc)) return false;
                if (cor && !(u.cor || '').toLowerCase().includes(cor.toLowerCase())) return false;
                if (altura && !(u.altura || '').includes(altura)) return false;
                if (cidade && !(u.cidade || '').toLowerCase().includes(cidade.toLowerCase())) return false;
                if (obs && !(u.observacoes || '').toLowerCase().includes(obs.toLowerCase())) return false;

                if (tatuagens.length > 0) {
                    const todas = (u.tatuagens || []).join(' | ').toLowerCase();
                    if (!tatuagens.every(t => todas.includes(t.toLowerCase()))) return false;
                }
                if (sinais.length > 0) {
                    const todos = (u.sinais || []).join(' | ').toLowerCase();
                    if (!sinais.every(s => todos.includes(s.toLowerCase()))) return false;
                }
                return true;
            });

            this._renderizar(resultados);
        } catch (e) {
            Toast.error('Erro na busca: ' + e.message);
        }
    },

    _renderizar(resultados) {
        const tbody = document.querySelector('#table-pesquisa tbody');
        tbody.innerHTML = resultados.map(u => `
            <tr data-id="${u.id}">
                <td>${u.id}</td>
                <td>${escapeHtml(u.nome)}</td>
                <td>${escapeHtml(u.apelido || '')}</td>
                <td>${escapeHtml(u.rg || '')}</td>
                <td>${escapeHtml(u.cidade || '')}</td>
            </tr>
        `).join('');

        if (resultados.length === 0) {
            this._setResultadoTexto('❌ Nenhum registro corresponde aos filtros.', 'danger');
            this._limparDetalhe();
        } else {
            this._setResultadoTexto(`✅ ${resultados.length} registro(s) encontrado(s).`, 'success');
            const first = tbody.querySelector('tr');
            if (first) {
                first.classList.add('selected');
                this._mostrarDetalhe(parseInt(first.dataset.id));
            }
        }
    },

    _setResultadoTexto(texto, tipo) {
        const el = document.getElementById('pesq-resultado-texto');
        el.textContent = texto;
        const cores = { success: 'var(--success)', danger: 'var(--danger)', warning: 'var(--warning)' };
        el.style.color = cores[tipo] || 'var(--fg-secondary)';
    },

    async _mostrarDetalhe(id) {
        try {
            const u = await API.buscarRegistro(id);
            const foto = document.getElementById('pesq-detalhe-foto');
            const info = document.getElementById('pesq-detalhe-info');

            if (u.fotos && u.fotos.length > 0) {
                foto.innerHTML = `<img src="${u.fotos[0].dataUrl}" alt="${escapeHtml(u.nome)}">`;
            } else {
                foto.textContent = 'Sem foto';
            }

            const tat = (u.tatuagens || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
            const sin = (u.sinais || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';

            info.innerHTML = `
                <h3>${escapeHtml(u.nome)}</h3>
                <p><b>ID:</b> ${u.id} &nbsp; <b>Apelido:</b> ${escapeHtml(u.apelido || '—')}</p>
                <p><b>RG:</b> ${escapeHtml(u.rg || '—')} &nbsp; <b>Nascimento:</b> ${escapeHtml(u.data_nascimento || '—')}</p>
                <p><b>Cor:</b> ${escapeHtml(u.cor || '—')} &nbsp; <b>Altura:</b> ${escapeHtml(u.altura || '—')}</p>
                <p><b>Cidade:</b> ${escapeHtml(u.cidade || '—')}</p>
                <p><b>🎨 Tatuagens:</b></p><ul>${tat}</ul>
                <p><b>🔎 Sinais:</b></p><ul>${sin}</ul>
                <p><b>📋 Observações:</b><br>${escapeHtml(u.observacoes || '—')}</p>
            `;
        } catch (e) {
            console.error(e);
        }
    },

    _limparDetalhe() {
        document.getElementById('pesq-detalhe-foto').textContent = 'Sem foto';
        document.getElementById('pesq-detalhe-info').innerHTML = '<p class="placeholder-text">Selecione um registro na tabela para ver os detalhes.</p>';
    },

    async _getSelecionado() {
        const sel = document.querySelector('#table-pesquisa tbody tr.selected');
        if (!sel) return null;
        return await API.buscarRegistro(parseInt(sel.dataset.id));
    },

    async _abrirSelecionado() {
        const u = await this._getSelecionado();
        if (!u) { Toast.warning('Selecione um registro na tabela.'); return; }
        Cadastro.abrirDetalhes(u);
    },

    async _preencherFormulario() {
        const u = await this._getSelecionado();
        if (!u) { Toast.warning('Selecione um registro na tabela.'); return; }
        Cadastro.preencher(u);
        TabsManager.ativar('cadastros');
        Toast.success(`Dados de "${u.nome}" carregados no formulário.`);
    },

    limpar() {
        ['pesq-id', 'pesq-nome', 'pesq-apelido', 'pesq-rg', 'pesq-nascimento',
         'pesq-cor', 'pesq-altura', 'pesq-cidade', 'pesq-obs'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Cadastro.limparListasDinamicas('pesq');
        document.querySelector('#table-pesquisa tbody').innerHTML = '';
        this._setResultadoTexto('Nenhuma pesquisa realizada ainda.', 'info');
        this._limparDetalhe();
    }
};
