/* ============================================================
   CADASTRO DE REGISTROS
   ============================================================ */
const Cadastro = {
    fotos: [],       // [{ dataUrl, embedding, status, motivos }]
    MAX_FOTOS: 5,
    registroSelecionado: null,

    init() {
        // Botões principais
        document.getElementById('btn-cadastrar')?.addEventListener('click', () => this.cadastrar());
        document.getElementById('btn-atualizar')?.addEventListener('click', () => this.atualizar());
        document.getElementById('btn-limpar')?.addEventListener('click', () => this.limpar());
        document.getElementById('btn-excluir')?.addEventListener('click', () => this.excluir());
        document.getElementById('btn-listar')?.addEventListener('click', () => this.listar());
        document.getElementById('btn-gerar-pdf')?.addEventListener('click', () => this.gerarPDF());

        // Fotos
        document.getElementById('btn-add-foto')?.addEventListener('click', () => {
            document.getElementById('foto-input').click();
        });
        document.getElementById('foto-input')?.addEventListener('change', (e) => {
            this.adicionarFotos(Array.from(e.target.files));
            e.target.value = '';
        });

        // Listas dinâmicas
        document.querySelectorAll('[data-add-field]').forEach(btn => {
            btn.addEventListener('click', () => {
                const lista = document.getElementById(btn.dataset.addField);
                this.adicionarCampoDinamico(lista, btn.dataset.placeholder);
            });
        });

        // Inicializa listas com 1 campo
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
        const item = document.createElement('div');
        item.className = 'dynamic-item';
        item.innerHTML = `
            <input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(valor)}">
            <button type="button" class="dynamic-remove" title="Remover">❌</button>
        `;
        const input = item.querySelector('input');
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

    limparListasDinamicas() {
        ['lista-tatuagens', 'lista-sinais'].forEach(id => {
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
        container.innerHTML = '';
        if (!valores || valores.length === 0) {
            this.adicionarCampoDinamico(container,
                id.includes('tatuagens') ? 'Descrição da tatuagem' : 'Descrição do sinal');
            return;
        }
        valores.forEach(v => this.adicionarCampoDinamico(container, '', v));
    },

    /* ============ FOTOS ============ */
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
            try {
                const dataUrl = await this.fileToDataURL(file);
                const info = await this.analisarImagem(dataUrl);
                this.fotos.push({
                    dataUrl,
                    nome: file.name,
                    embedding: info.embedding,
                    status: info.status,
                    motivos: info.motivos || []
                });

                if (info.motivos && info.motivos.length > 0) {
                    Toast.warning(`Foto "${file.name}" adicionada, mas: ${info.motivos[0]}`);
                }
            } catch (e) {
                console.error(e);
                Toast.error(`Erro ao processar "${file.name}"`);
            }
        }
        this.renderizarFotos();
    },

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Análise de imagem no frontend.
     * NOTA: No frontend puro, NÃO temos face_recognition nem OpenCV.
     * Aqui simulamos a análise. Quando conectar ao backend Python, esta
     * função fará uma chamada HTTP para o servidor.
     */
    async analisarImagem(dataUrl) {
        // === SIMULAÇÃO (remover quando conectar ao backend) ===
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                // Heurística simples: imagem muito pequena ou muito escura/clara = alerta
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                let soma = 0;
                for (let i = 0; i < data.length; i += 4) {
                    soma += (data[i] + data[i + 1] + data[i + 2]) / 3;
                }
                const brilho = soma / (data.length / 4);

                const motivos = [];
                if (brilho < 40) motivos.push('Imagem muito escura');
                if (brilho > 220) motivos.push('Imagem muito clara');
                if (img.width < 100 || img.height < 100) motivos.push('Imagem muito pequena');

                // Gera um embedding simulado (hash do dataUrl)
                const embedding = 'sim_' + btoa(dataUrl.slice(0, 50)).slice(0, 20);

                resolve({
                    embedding,
                    status: motivos.length === 0 ? 'ok' : (motivos.length === 1 ? 'warn' : 'bad'),
                    motivos
                });
            };
            img.onerror = () => resolve({ embedding: null, status: 'bad', motivos: ['Imagem inválida'] });
            img.src = dataUrl;
        });
    },

    renderizarFotos() {
        const grid = document.getElementById('fotos-grid');
        if (!grid) return;
        grid.innerHTML = '';

        this.fotos.forEach((foto, index) => {
            const card = document.createElement('div');
            card.className = `foto-card status-${foto.status}`;
            const statusTexto = foto.status === 'ok' ? '✅ Boa'
                : foto.status === 'warn' ? '⚠️ ' + (foto.motivos[0] || 'Atenção')
                : '❌ ' + (foto.motivos[0] || 'Ruim');

            card.innerHTML = `
                <img src="${foto.dataUrl}" alt="Foto ${index + 1}">
                <div class="foto-status">${escapeHtml(statusTexto)}</div>
                <button type="button" class="foto-remove" data-index="${index}">🗑️ Remover</button>
            `;
            card.querySelector('.foto-remove').addEventListener('click', () => {
                this.fotos.splice(index, 1);
                this.renderizarFotos();
            });
            grid.appendChild(card);
        });

        document.getElementById('fotos-count').textContent = this.fotos.length;
        document.getElementById('btn-add-foto').disabled = this.fotos.length >= this.MAX_FOTOS;
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

    /* ============ CRUD ============ */
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
                embedding: f.embedding,
                status: f.status
            }))
        };
    },

    async cadastrar() {
        const erros = this.validarCampos();
        if (erros.length) {
            Toast.error(erros.join('\n'));
            return;
        }

        const dados = this.coletar();
        if (MockDB.nomeExiste(dados.nome)) {
            Toast.warning(`Já existe registro com nome "${dados.nome}".`);
            return;
        }

        const semRosto = dados.fotos.filter(f => !f.embedding).length;
        if (semRosto > 0) {
            const ok = await Confirm.abrir('Atenção',
                `${semRosto} foto(s) não têm rosto detectado.\nElas não serão usadas na busca facial.\n\nDeseja cadastrar mesmo assim?`);
            if (!ok) return;
        }

        const id = MockDB.inserir(dados);
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'CADASTRO', id,
            `Nome: ${dados.nome} | ${dados.fotos.length} foto(s)`);

        if (dados.fotos.length < 3) {
            Toast.info(`"${dados.nome}" cadastrado! 💡 Adicione 3-5 fotos para melhorar a busca facial.`);
        } else {
            Toast.success(`"${dados.nome}" cadastrado com ${dados.fotos.length} fotos!`);
        }

        this.limpar();
        Dashboard.atualizar();
    },

    async atualizar() {
        if (!AppState.registroAtualId) {
            Toast.warning('Nenhum registro carregado. Selecione em "Cadastrados".');
            return;
        }
        const erros = this.validarCampos();
        if (erros.length) {
            Toast.error(erros.join('\n'));
            return;
        }
        const dados = this.coletar();
        if (MockDB.nomeExiste(dados.nome, AppState.registroAtualId)) {
            Toast.warning(`Já existe outro registro com nome "${dados.nome}".`);
            return;
        }
        MockDB.atualizar(AppState.registroAtualId, dados);
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'ATUALIZACAO',
            AppState.registroAtualId, `Nome: ${dados.nome}`);
        Toast.success('Registro atualizado!');
        Dashboard.atualizar();
    },

    async excluir() {
        if (!AppState.registroAtualId) {
            Toast.warning('Nenhum registro carregado.');
            return;
        }
        const u = MockDB.buscarPorId(AppState.registroAtualId);
        if (!u) return;
        const ok = await Confirm.abrir('Excluir Registro',
            `Excluir "${u.nome}"?\n\nEsta ação não pode ser desfeita.`);
        if (!ok) return;
        MockDB.excluir(u.id);
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'EXCLUSAO', u.id, `Nome: ${u.nome}`);
        Toast.success('Registro excluído.');
        this.limpar();
        Dashboard.atualizar();
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
        document.getElementById('cad-nome').focus();
    },

    novo() {
        this.limpar();
        TabsManager.ativar('cadastros');
    },

    /* ============ LISTAGEM ============ */
    listar() {
        const registros = MockDB.listarTodos();
        const tbody = document.querySelector('#table-registros tbody');
        const filtro = document.getElementById('filtro-registros');

        const popular = (termo = '') => {
            termo = termo.toLowerCase();
            const filtrados = registros.filter(r =>
                !termo || r.nome.toLowerCase().includes(termo) || (r.apelido || '').toLowerCase().includes(termo)
            );
            tbody.innerHTML = filtrados.map(u => `
                <tr data-id="${u.id}">
                    <td>${u.id}</td>
                    <td>${escapeHtml(u.nome)}</td>
                    <td>${escapeHtml(u.apelido || '')}</td>
                    <td>${escapeHtml(u.cidade || '')}</td>
                    <td>${u.fotos?.length || 0}</td>
                    <td>${u.fotos?.filter(f => f.embedding).length || 0}</td>
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
            if (!sel) { Toast.warning('Selecione um registro na tabela.'); return; }
            this._abrirDoModal(parseInt(sel.dataset.id));
        };

        document.getElementById('btn-reg-excluir').onclick = async () => {
            const sel = tbody.querySelector('tr.selected');
            if (!sel) { Toast.warning('Selecione um registro na tabela.'); return; }
            const id = parseInt(sel.dataset.id);
            const u = MockDB.buscarPorId(id);
            const ok = await Confirm.abrir('Excluir', `Excluir "${u.nome}"?`);
            if (!ok) return;
            MockDB.excluir(id);
            MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'EXCLUSAO', id, u.nome);
            Toast.success('Excluído.');
            this.listar();
            Dashboard.atualizar();
        };

        Modal.abrir('modal-registros');
    },

    _abrirDoModal(id) {
        const u = MockDB.buscarPorId(id);
        if (!u) return;
        Modal.fechar('modal-registros');
        this.preencher(u);
        TabsManager.ativar('cadastros');
        Toast.info(`Registro "${u.nome}" carregado.`);
    },

    preencher(u) {
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

        this.setListaDinamica('lista-tatuagens', u.tatuagens || []);
        this.setListaDinamica('lista-sinais', u.sinais || []);

        this.fotos = (u.fotos || []).map(f => ({
            dataUrl: f.dataUrl,
            embedding: f.embedding,
            status: f.status || 'ok',
            motivos: f.motivos || []
        }));
        this.renderizarFotos();
    },

    abrirDetalhes(u) {
        const body = document.getElementById('modal-detalhes-body');
        document.getElementById('modal-detalhes-titulo').textContent = `Registro - ${u.nome}`;
        const fotos = u.fotos || [];
        const fotoPrincipal = fotos.length > 0
            ? `<img src="${fotos[0].dataUrl}" style="width:180px;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`
            : `<div style="width:180px;height:180px;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--fg-secondary);">Sem foto</div>`;

        const tat = (u.tatuagens || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
        const sin = (u.sinais || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';

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
        const u = MockDB.buscarPorId(AppState.registroAtualId);
        if (!u) return;
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
${(u.tatuagens || ['—']).map(t => '• ' + t).join('\n')}

SINAIS PARTICULARES:
${(u.sinais || ['—']).map(s => '• ' + s).join('\n')}

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
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'PDF_REGISTRO', u.id, u.nome);
        Toast.success('Documento gerado! (Para PDF real, conecte ao backend)');
    }
};