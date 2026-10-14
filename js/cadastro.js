/* ============================================================
   CADASTRO — CRUD via API + Neon
   Gera embedding facial no navegador via FaceRec
   ============================================================ */

function _paraArray(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor.map(v => String(v).trim()).filter(v => v);
    if (typeof valor === 'string') return valor.split(';').map(s => s.trim()).filter(s => s);
    return [];
}

function _normalizarRegistro(u) {
    if (!u) return u;
    return {
        ...u,
        tatuagens: _paraArray(u.tatuagens || u.tatuagem),
        sinais: _paraArray(u.sinais),
        fotos: Array.isArray(u.fotos) ? u.fotos : []
    };
}

const Cadastro = {
    fotos: [],
    MAX_FOTOS: 5,
    registroSelecionado: null,

    init() {
        document.getElementById('btn-cadastrar')?.addEventListener('click', () => this.cadastrar());
        document.getElementById('btn-atualizar')?.addEventListener('click', () => this.atualizar());
        document.getElementById('btn-limpar')?.addEventListener('click', () => this.limpar());
        document.getElementById('btn-excluir')?.addEventListener('click', () => this.excluir());
        document.getElementById('btn-listar')?.addEventListener('click', () => this.listar());
        document.getElementById('btn-gerar-pdf')?.addEventListener('click', () => this.gerarPDF());

        document.getElementById('btn-add-foto')?.addEventListener('click', () => {
            document.getElementById('foto-input').click();
        });
        document.getElementById('foto-input')?.addEventListener('change', (e) => {
            this.adicionarFotos(Array.from(e.target.files));
            e.target.value = '';
        });

        document.querySelectorAll('[data-add-field]').forEach(btn => {
            btn.addEventListener('click', () => {
                const lista = document.getElementById(btn.dataset.addField);
                this.adicionarCampoDinamico(lista, btn.dataset.placeholder);
            });
        });

        this.atualizarListasDinamicas();
    },

    atualizarListasDinamicas() {
        ['lista-tatuagens', 'lista-sinais', 'pesq-lista-tatuagens', 'pesq-lista-sinais'].forEach(id => {
            const lista = document.getElementById(id);
            if (lista && lista.children.length === 0) {
                const placeholder = id.includes('tatuagens')
                    ? 'Descrição da tatuagem'
                    : 'Descrição do sinal';
                this.adicionarCampoDinamico(lista, placeholder);
            }
        });
    },

    adicionarCampoDinamico(container, placeholder, valor = '') {
        if (!container) return null;
        const item = document.createElement('div');
        item.className = 'dynamic-item';
        item.innerHTML = `
            <input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(valor)}">
            <button type="button" class="dynamic-remove" title="Remover">❌</button>
        `;
        const btn = item.querySelector('.dynamic-remove');
        btn.addEventListener('click', () => {
            if (container.children.length <= 1) {
                Toast.warning('Mantenha pelo menos 1 campo.');
                return;
            }
            item.remove();
            this._atualizarBotoesRemover(container);
        });
        container.appendChild(item);
        this._atualizarBotoesRemover(container);
        return item;
    },

    _atualizarBotoesRemover(container) {
        const habilitado = container.children.length > 1;
        container.querySelectorAll('.dynamic-remove').forEach(btn => {
            btn.disabled = !habilitado;
        });
    },

    getValoresLista(id) {
        const container = document.getElementById(id);
        if (!container) return [];
        return Array.from(container.querySelectorAll('input'))
            .map(i => i.value.trim())
            .filter(v => v);
    },

    limparListasDinamicas(prefix = '') {
        const ids = prefix === 'pesq'
            ? ['pesq-lista-tatuagens', 'pesq-lista-sinais']
            : ['lista-tatuagens', 'lista-sinais'];
        ids.forEach(id => {
            const container = document.getElementById(id);
            if (!container) return;
            container.innerHTML = '';
            this.adicionarCampoDinamico(container,
                id.includes('tatuagens') ? 'Descrição da tatuagem' : 'Descrição do sinal');
        });
    },

    setListaDinamica(id, valores) {
        const container = document.getElementById(id);
        if (!container) return;
        valores = _paraArray(valores);
        container.innerHTML = '';
        if (valores.length === 0) {
            this.adicionarCampoDinamico(container,
                id.includes('tatuagens') ? 'Descrição da tatuagem' : 'Descrição do sinal');
            return;
        }
        valores.forEach(v => this.adicionarCampoDinamico(container, '', v));
    },

    /* ============ FOTOS — COM EMBEDDING FACIAL ============ */
    async adicionarFotos(files) {
        for (const file of files) {
            if (this.fotos.length >= this.MAX_FOTOS) {
                Toast.warning(`Limite de ${this.MAX_FOTOS} fotos atingido.`);
                break;
            }
            if (!file.type.startsWith('image/')) {
                Toast.warning(`"${file.name}" não é uma imagem válida.`);
                continue;
            }

            Toast.info(`Processando "${file.name}"...`);

            try {
                // Processa a foto usando FaceRec (detecta rosto + gera descritor)
                const info = await FaceRec.processarArquivo(file);

                this.fotos.push({
                    dataUrl: info.dataUrl,
                    nome: file.name,
                    descriptor: info.descriptor,    // 128 números ou null
                    erro: info.erro
                });

                if (info.erro) {
                    Toast.warning(`"${file.name}": ${info.erro}`);
                } else {
                    Toast.success(`"${file.name}" — rosto detectado ✅`);
                }
            } catch (e) {
                console.error(e);
                Toast.error(`Erro ao processar "${file.name}"`);
            }
        }
        this.renderizarFotos();
    },

    renderizarFotos() {
        const grid = document.getElementById('fotos-grid');
        if (!grid) return;
        grid.innerHTML = '';

        this.fotos.forEach((foto, index) => {
            const card = document.createElement('div');
            const temRosto = !!foto.descriptor;
            card.className = `foto-card ${temRosto ? 'status-ok' : 'status-bad'}`;

            const statusTexto = temRosto ? '✅ Rosto detectado' : '❌ Sem rosto';

            card.innerHTML = `
                <img src="${foto.dataUrl}" alt="Foto ${index + 1}">
                <div class="foto-status">${statusTexto}</div>
                <button type="button" class="foto-remove" data-index="${index}">🗑️ Remover</button>
            `;
            card.querySelector('.foto-remove').addEventListener('click', () => {
                this.fotos.splice(index, 1);
                this.renderizarFotos();
            });
            grid.appendChild(card);
        });

        const count = document.getElementById('fotos-count');
        if (count) count.textContent = this.fotos.length;
        const btnAdd = document.getElementById('btn-add-foto');
        if (btnAdd) btnAdd.disabled = this.fotos.length >= this.MAX_FOTOS;
    },

    limparFotos() {
        this.fotos = [];
        this.renderizarFotos();
    },

    /* ============ VALIDAÇÃO ============ */
    validarCampos() {
        const erros = [];
        const nome = document.getElementById('cad-nome').value.trim();
        if (!nome) erros.push('• Nome é obrigatório');

        const nasc = document.getElementById('cad-nascimento').value.trim();
        if (nasc && !validarData(nasc)) erros.push('• Data de nascimento inválida (DD/MM/AAAA)');

        const altura = document.getElementById('cad-altura').value.trim();
        if (altura && !validarAltura(altura)) erros.push('• Altura inválida (ex: 1.75)');

        const rg = document.getElementById('cad-rg').value.trim();
        if (rg && !validarRG(rg)) erros.push('• RG contém caracteres inválidos');

        return erros;
    },

    coletar() {
        return {
            nome: document.getElementById('cad-nome').value.trim(),
            apelido: document.getElementById('cad-apelido').value.trim(),
            rg: document.getElementById('cad-rg').value.trim(),
            data_nascimento: document.getElementById('cad-nascimento').value.trim(),
            cor: document.getElementById('cad-cor').value.trim(),
            altura: document.getElementById('cad-altura').value.trim(),
            cidade: document.getElementById('cad-cidade').value.trim(),
            observacoes: document.getElementById('cad-observacoes').value.trim(),
            tatuagens: this.getValoresLista('lista-tatuagens'),
            sinais: this.getValoresLista('lista-sinais'),
            fotos: this.fotos.map(f => ({
                dataUrl: f.dataUrl,
                descriptor: f.descriptor      // enviado para o backend
            })),
            usuario: AppState.usuarioLogado?.username || '?'
        };
    },

    async cadastrar() {
        const erros = this.validarCampos();
        if (erros.length) {
            Toast.error(erros.join('\n'));
            return;
        }

        const dados = this.coletar();
        const semRosto = dados.fotos.filter(f => !f.descriptor).length;
        if (semRosto > 0) {
            const ok = await Confirm.abrir('Atenção',
                `${semRosto} foto(s) não têm rosto detectado.\n` +
                `Elas não serão usadas na busca facial.\n\n` +
                `Deseja cadastrar mesmo assim?`);
            if (!ok) return;
        }

        try {
            Loading.show('Cadastrando...');
            const res = await API.criarRegistro(dados);
            Loading.hide();
            Toast.success(`"${dados.nome}" cadastrado! (ID ${res.id})`);
            this.limpar();
            Dashboard.atualizar();
        } catch (e) {
            Loading.hide();
            Toast.error('Erro: ' + e.message);
        }
    },

    async atualizar() {
        if (!AppState.registroAtualId) {
            Toast.warning('Nenhum registro carregado.');
            return;
        }
        const erros = this.validarCampos();
        if (erros.length) {
            Toast.error(erros.join('\n'));
            return;
        }
        const dados = this.coletar();

        try {
            Loading.show('Atualizando...');
            await API.atualizarRegistro(AppState.registroAtualId, dados);
            Loading.hide();
            Toast.success('Registro atualizado!');
            Dashboard.atualizar();
        } catch (e) {
            Loading.hide();
            Toast.error('Erro: ' + e.message);
        }
    },

    async excluir() {
        if (!AppState.registroAtualId) {
            Toast.warning('Nenhum registro carregado.');
            return;
        }
        const ok = await Confirm.abrir('Excluir Registro',
            `Excluir registro ID ${AppState.registroAtualId}?`);
        if (!ok) return;

        try {
            Loading.show('Excluindo...');
            await API.excluirRegistro(AppState.registroAtualId);
            Loading.hide();
            Toast.success('Registro excluído.');
            this.limpar();
            Dashboard.atualizar();
        } catch (e) {
            Loading.hide();
            Toast.error('Erro: ' + e.message);
        }
    },

    limpar() {
        ['cad-id', 'cad-nome', 'cad-apelido', 'cad-rg', 'cad-nascimento',
         'cad-cor', 'cad-altura', 'cad-cidade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('cad-observacoes').value = '';
        this.limparListasDinamicas();
        this.limparFotos();
        AppState.registroAtualId = null;
        document.getElementById('cad-nome')?.focus();
    },

    novo() {
        this.limpar();
        TabsManager.ativar('cadastros');
    },

    async listar() {
        try {
            const registros = (await API.listarRegistros()).map(_normalizarRegistro);
            const tbody = document.querySelector('#table-registros tbody');
            const filtro = document.getElementById('filtro-registros');

            const popular = (termo = '') => {
                termo = termo.toLowerCase();
                const filtrados = registros.filter(r =>
                    !termo || r.nome.toLowerCase().includes(termo) ||
                    (r.apelido || '').toLowerCase().includes(termo)
                );
                tbody.innerHTML = filtrados.map(u => `
                    <tr data-id="${u.id}">
                        <td>${u.id}</td>
                        <td>${escapeHtml(u.nome)}</td>
                        <td>${escapeHtml(u.apelido || '')}</td>
                        <td>${escapeHtml(u.cidade || '')}</td>
                        <td>${(u.fotos || []).length}</td>
                        <td>—</td>
                    </tr>
                `).join('') || '<tr><td colspan="6" class="placeholder-text">Nenhum registro</td></tr>';

                tbody.querySelectorAll('tr[data-id]').forEach(tr => {
                    tr.addEventListener('click', () => {
                        tbody.querySelectorAll('tr').forEach(t => t.classList.remove('selected'));
                        tr.classList.add('selected');
                    });
                    tr.addEventListener('dblclick', () => this._abrirDoModal(parseInt(tr.dataset.id)));
                });
            };

            popular();
            filtro.value = '';
            filtro.oninput = () => popular(filtro.value);

            document.getElementById('btn-reg-abrir').onclick = () => {
                const sel = tbody.querySelector('tr.selected');
                if (!sel) { Toast.warning('Selecione um registro.'); return; }
                this._abrirDoModal(parseInt(sel.dataset.id));
            };

            document.getElementById('btn-reg-excluir').onclick = async () => {
                const sel = tbody.querySelector('tr.selected');
                if (!sel) { Toast.warning('Selecione um registro.'); return; }
                const id = parseInt(sel.dataset.id);
                const ok = await Confirm.abrir('Excluir', `Excluir registro ID ${id}?`);
                if (!ok) return;
                try {
                    await API.excluirRegistro(id);
                    Toast.success('Excluído.');
                    Modal.fechar('modal-registros');
                    Dashboard.atualizar();
                } catch (e) {
                    Toast.error(e.message);
                }
            };

            Modal.abrir('modal-registros');
        } catch (e) {
            Toast.error('Erro ao listar: ' + e.message);
        }
    },

    async _abrirDoModal(id) {
        try {
            const raw = await API.buscarRegistro(id);
            const u = _normalizarRegistro(raw);
            Modal.fechar('modal-registros');
            this.preencher(u);
            TabsManager.ativar('cadastros');
            Toast.info(`Registro "${u.nome}" carregado.`);
        } catch (e) {
            Toast.error(e.message);
        }
    },

    preencher(u) {
        u = _normalizarRegistro(u);
        AppState.registroAtualId = u.id;
        document.getElementById('cad-id').value = u.id;
        document.getElementById('cad-nome').value = u.nome || '';
        document.getElementById('cad-apelido').value = u.apelido || '';
        document.getElementById('cad-rg').value = u.rg || '';
        document.getElementById('cad-nascimento').value = u.data_nascimento || '';
        document.getElementById('cad-cor').value = u.cor || '';
        document.getElementById('cad-altura').value = u.altura || '';
        document.getElementById('cad-cidade').value = u.cidade || '';
        document.getElementById('cad-observacoes').value = u.observacoes || '';

        this.setListaDinamica('lista-tatuagens', u.tatuagens);
        this.setListaDinamica('lista-sinais', u.sinais);

        this.fotos = (u.fotos || []).map(f => ({
            dataUrl: f.dataUrl || f.imagem,
            descriptor: f.descriptor || null,  // backend pode ou não devolver
            nome: `foto_${f.id}`,
            erro: null
        })).filter(f => f.dataUrl);
        this.renderizarFotos();
    },

    abrirDetalhes(u) {
        u = _normalizarRegistro(u);
        const body = document.getElementById('modal-detalhes-body');
        document.getElementById('modal-detalhes-titulo').textContent = `Registro - ${u.nome}`;
        const fotos = u.fotos || [];
        const fotoPrincipal = fotos.length > 0
            ? `<img src="${fotos[0].dataUrl}" style="width:180px;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`
            : `<div style="width:180px;height:180px;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--fg-secondary);">Sem foto</div>`;

        const tat = u.tatuagens.map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
        const sin = u.sinais.map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';

        body.innerHTML = `
            <div style="display:flex; gap:16px;">
                <div>${fotoPrincipal}</div>
                <div style="flex:1;">
                    <h3 style="color:var(--accent);">${escapeHtml(u.nome)}</h3>
                    <p><b>ID:</b> ${u.id} | <b>Apelido:</b> ${escapeHtml(u.apelido || '—')}</p>
                    <p><b>RG:</b> ${escapeHtml(u.rg || '—')} | <b>Nascimento:</b> ${escapeHtml(u.data_nascimento || '—')}</p>
                    <p><b>Cor:</b> ${escapeHtml(u.cor || '—')} | <b>Altura:</b> ${escapeHtml(u.altura || '—')}</p>
                    <p><b>Cidade:</b> ${escapeHtml(u.cidade || '—')}</p>
                    <p><b>🎨 Tatuagens:</b></p><ul>${tat}</ul>
                    <p><b>🔎 Sinais:</b></p><ul>${sin}</ul>
                    <p><b>📋 Observações:</b> ${escapeHtml(u.observacoes || '—')}</p>
                    <p style="color:var(--fg-secondary);font-size:9pt;"><i>Cadastrado em: ${escapeHtml(u.data_cadastro || '—')} | ${fotos.length} foto(s)</i></p>
                </div>
            </div>
        `;
        Modal.abrir('modal-detalhes');
    },

    gerarPDF() {
        if (!AppState.registroAtualId) {
            Toast.warning('Nenhum registro carregado.');
            return;
        }
        API.buscarRegistro(AppState.registroAtualId).then(raw => {
            const u = _normalizarRegistro(raw);
            const texto = `
REGISTRO: ${u.nome}
ID: ${u.id}
Apelido: ${u.apelido || '—'}
RG: ${u.rg || '—'}
Nascimento: ${u.data_nascimento || '—'}
Cor: ${u.cor || '—'}
Altura: ${u.altura || '—'}
Cidade: ${u.cidade || '—'}
Cadastro: ${u.data_cadastro || '—'}

TATUAGENS:
${(u.tatuagens.length ? u.tatuagens : ['—']).map(t => '• ' + t).join('\n')}

SINAIS:
${(u.sinais.length ? u.sinais : ['—']).map(s => '• ' + s).join('\n')}

OBSERVAÇÕES:
${u.observacoes || '—'}

Gerado em ${new Date().toLocaleString('pt-BR')} - Sistema de Procura v3.3
            `.trim();
            const blob = new Blob([texto], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `registro_${u.id}_${u.nome.replace(/\s+/g, '_')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            Toast.success('Documento gerado!');
        }).catch(e => Toast.error(e.message));
    }
};
