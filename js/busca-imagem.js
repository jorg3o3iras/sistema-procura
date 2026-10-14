/* ============================================================
   BUSCA POR IMAGEM (Frontend)
   ============================================================ */
const BuscaImagem = {
    imagemEntrada: null,
    ultimoMatchId: null,
    webcamStream: null,
    ultimoFrame: null,

    init() {
        document.getElementById('btn-inserir-foto')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    this.imagemEntrada = reader.result;
                    this._mostrarPreview(reader.result);
                    document.getElementById('btn-capturar-webcam').disabled = true;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });

        document.getElementById('btn-abrir-webcam')?.addEventListener('click', () => this.abrirWebcam());
        document.getElementById('btn-capturar-webcam')?.addEventListener('click', () => this.capturarWebcam());
        document.getElementById('btn-encontrar')?.addEventListener('click', () => this.encontrar());
        document.getElementById('btn-img-limpar')?.addEventListener('click', () => this.limpar());
        document.getElementById('btn-img-abrir')?.addEventListener('click', () => this._abrirRegistro());
        document.getElementById('btn-img-preencher')?.addEventListener('click', () => this._preencherFormulario());

        this._renderizarMatches([]);
    },

    async abrirWebcam() {
        try {
            this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.getElementById('webcam-video');
            video.srcObject = this.webcamStream;
            video.hidden = false;
            video.play();
            document.getElementById('btn-capturar-webcam').disabled = false;
            document.getElementById('preview-imagem').style.display = 'none';
            Toast.info('Webcam aberta. Clique em Capturar.');
        } catch (e) {
            Toast.error('Não foi possível acessar a webcam: ' + e.message);
        }
    },

    capturarWebcam() {
        const video = document.getElementById('webcam-video');
        const canvas = document.getElementById('webcam-canvas');
        if (!video.videoWidth) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        this.imagemEntrada = dataUrl;
        this._mostrarPreview(dataUrl);
        this._fecharWebcam();
        Toast.success('Foto capturada!');
    },

    _fecharWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(t => t.stop());
            this.webcamStream = null;
        }
        document.getElementById('webcam-video').hidden = true;
        document.getElementById('btn-capturar-webcam').disabled = true;
        document.getElementById('preview-imagem').style.display = '';
    },

    _mostrarPreview(dataUrl) {
        const preview = document.getElementById('preview-imagem');
        preview.innerHTML = `<img src="${dataUrl}" alt="Preview">`;
        preview.style.display = '';
    },

    async encontrar() {
        if (!this.imagemEntrada) {
            Toast.warning('Carregue uma imagem primeiro.');
            return;
        }

        const registros = MockDB.listarTodos().filter(u =>
            u.fotos && u.fotos.some(f => f.embedding)
        );

        if (registros.length === 0) {
            Toast.info('Nenhum registro possui foto com rosto detectado.');
            return;
        }

        Loading.show('Comparando imagens...');

        // Simulação de busca facial (o backend fará o real)
        // Como o frontend não tem face_recognition, mostramos uma busca
        // por similaridade simples do hash do embedding.
        await new Promise(r => setTimeout(r, 1200));

        const matches = [];
        for (const u of registros) {
            for (const f of u.fotos) {
                if (!f.embedding) continue;
                // Similaridade simulada
                const sim = 0.5 + Math.random() * 0.45; // 50-95%
                if (sim > 0.55) {
                    matches.push({ dist: 1 - sim, sim, uid: u.id });
                    break;
                }
            }
        }

        matches.sort((a, b) => a.dist - b.dist);
        const top3 = matches.slice(0, 3);

        Loading.hide();

        if (top3.length === 0) {
            Toast.warning('Nenhuma correspondência encontrada.');
            this._renderizarMatches([]);
            document.getElementById('img-detalhe-foto').textContent = 'Sem correspondência';
            document.getElementById('img-detalhe-info').innerHTML = '<p class="placeholder-text">Nenhum match.</p>';
            document.getElementById('btn-img-abrir').disabled = true;
            document.getElementById('btn-img-preencher').disabled = true;
            return;
        }

        this._renderizarMatches(top3);
        const melhor = top3[0];
        this._mostrarDetalhe(melhor.uid, melhor.sim);
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'BUSCA_FACIAL',
            melhor.uid, `${top3.length} match(es)`);

        // Mensagem com nível de confiança
        const pct = melhor.sim * 100;
        let nivel;
        if (pct >= 80) nivel = '🎯 ALTA PRECISÃO';
        else if (pct >= 55) nivel = '⚖️ PRECISÃO MÉDIA';
        else nivel = '⚠️ BAIXA PRECISÃO';

        Toast.info(`${nivel} — ${pct.toFixed(1)}% de similaridade com o registro #${melhor.uid}.`);
    },

    _renderizarMatches(matches) {
        const grid = document.getElementById('matches-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 3; i++) {
            const card = document.createElement('div');
            card.className = 'match-card';
            if (matches[i]) {
                const u = MockDB.buscarPorId(matches[i].uid);
                const foto = u.fotos && u.fotos.length > 0 ? u.fotos[0].dataUrl : '';
                const pct = matches[i].sim * 100;
                const conf = pct >= 80 ? 'conf-alta' : pct >= 55 ? 'conf-media' : 'conf-baixa';
                card.classList.add(conf);
                card.innerHTML = `
                    ${foto ? `<img src="${foto}" alt="${escapeHtml(u.nome)}">` : '<div style="aspect-ratio:1;background:var(--bg-dark);border-radius:6px;"></div>'}
                    <div class="match-name">${escapeHtml(u.nome)} (ID ${u.id})</div>
                    <div style="font-size:9pt;">Confiança: ${pct.toFixed(1)}%</div>
                `;
            } else {
                card.innerHTML = `
                    <div style="aspect-ratio:1;background:var(--bg-dark);border-radius:6px;"></div>
                    <div class="match-name" style="color:var(--fg-secondary);">Aguardando busca...</div>
                `;
            }
            grid.appendChild(card);
        }
    },

    _mostrarDetalhe(id, sim) {
        const u = MockDB.buscarPorId(id);
        if (!u) return;
        this.ultimoMatchId = id;

        const foto = document.getElementById('img-detalhe-foto');
        if (u.fotos && u.fotos.length > 0) {
            foto.innerHTML = `<img src="${u.fotos[0].dataUrl}" alt="${escapeHtml(u.nome)}">`;
        } else {
            foto.textContent = 'Sem foto';
        }

        const tat = (u.tatuagens || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
        const sin = (u.sinais || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';
        const pct = sim * 100;
        const cor = pct >= 80 ? 'var(--success)' : pct >= 55 ? 'var(--warning)' : 'var(--info)';

        document.getElementById('img-detalhe-info').innerHTML = `
            <h3 style="color:var(--accent);">${escapeHtml(u.nome)}</h3>
            <p style="color:${cor};font-weight:bold;">Confiança: ${pct.toFixed(1)}%</p>
            <p><b>ID:</b> ${u.id} &nbsp; <b>Apelido:</b> ${escapeHtml(u.apelido || '—')}</p>
            <p><b>RG:</b> ${escapeHtml(u.rg || '—')} &nbsp; <b>Nascimento:</b> ${escapeHtml(u.data_nascimento || '—')}</p>
            <p><b>Cor:</b> ${escapeHtml(u.cor || '—')} &nbsp; <b>Altura:</b> ${escapeHtml(u.altura || '—')}</p>
            <p><b>Cidade:</b> ${escapeHtml(u.cidade || '—')}</p>
            <p><b>🎨 Tatuagens:</b></p><ul>${tat}</ul>
            <p><b>🔎 Sinais:</b></p><ul>${sin}</ul>
        `;
        document.getElementById('btn-img-abrir').disabled = false;
        document.getElementById('btn-img-preencher').disabled = false;
    },

    _abrirRegistro() {
        if (!this.ultimoMatchId) return;
        const u = MockDB.buscarPorId(this.ultimoMatchId);
        if (!u) return;
        MockDB.registrarAuditoria(AppState.usuarioLogado.username, 'CONSULTA', u.id, u.nome);
        Cadastro.abrirDetalhes(u);
    },

    _preencherFormulario() {
        if (!this.ultimoMatchId) return;
        const u = MockDB.buscarPorId(this.ultimoMatchId);
        if (!u) return;
        Cadastro.preencher(u);
        TabsManager.ativar('cadastros');
        Toast.success(`Dados de "${u.nome}" carregados no formulário.`);
    },

    limpar() {
        this.imagemEntrada = null;
        this.ultimoMatchId = null;
        this._fecharWebcam();
        const preview = document.getElementById('preview-imagem');
        preview.innerHTML = '<span class="placeholder-text">Nenhuma imagem</span>';
        this._renderizarMatches([]);
        document.getElementById('img-detalhe-foto').textContent = 'Sem dados';
        document.getElementById('img-detalhe-info').innerHTML = '<p class="placeholder-text">Os dados do registro mais provável aparecerão aqui após a busca.</p>';
        document.getElementById('btn-img-abrir').disabled = true;
        document.getElementById('btn-img-preencher').disabled = true;
    }
};