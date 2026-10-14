/* ============================================================
   BUSCA POR IMAGEM — 100% no navegador com face-api.js
   Nenhuma imagem é enviada ao servidor.
   ============================================================ */

const BuscaImagem = {
    imagemEntrada: null,
    descriptorEntrada: null,        // 128 números gerados pelo FaceRec
    ultimoMatchId: null,
    webcamStream: null,

    init() {
        document.getElementById('btn-inserir-foto')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                this._processarArquivo(file);
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

    async _processarArquivo(file) {
        Toast.info('Processando imagem...');
        try {
            const info = await FaceRec.processarArquivo(file);
            if (info.erro) {
                this.imagemEntrada = null;
                this.descriptorEntrada = null;
                Toast.error(info.erro);
                return;
            }
            this.imagemEntrada = info.dataUrl;
            this.descriptorEntrada = info.descriptor;
            this._mostrarPreview(info.dataUrl);
            Toast.success('Rosto detectado na imagem ✅');
        } catch (e) {
            console.error(e);
            Toast.error('Erro ao processar imagem.');
        }
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

    async capturarWebcam() {
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

        // Processa descritor a partir da captura
        Toast.info('Detectando rosto...');
        try {
            const img = await FaceRec.carregarImagem(dataUrl);
            const resultado = await FaceRec.detectarRosto(img);
            if (resultado) {
                this.descriptorEntrada = resultado.descriptor;
                Toast.success('Rosto capturado ✅');
            } else {
                this.descriptorEntrada = null;
                Toast.warning('Nenhum rosto detectado na captura.');
            }
        } catch (e) {
            this.descriptorEntrada = null;
            Toast.error('Erro ao processar captura.');
        }
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
        if (!this.descriptorEntrada) {
            Toast.warning('Nenhum rosto detectado nesta imagem. Use uma foto frontal com boa iluminação.');
            return;
        }

        try {
            Loading.show('Comparando rostos...');
            const res = await API.buscaFacial(this.descriptorEntrada);
            Loading.hide();

            if (res.erro) {
                Toast.error(res.erro);
                return;
            }

            const matches = res.matches || [];
            if (matches.length === 0) {
                this._renderizarMatches([]);
                document.getElementById('img-detalhe-foto').textContent = 'Sem correspondência';
                document.getElementById('img-detalhe-info').innerHTML =
                    '<p class="placeholder-text">Nenhum rosto parecido encontrado.</p>';
                document.getElementById('btn-img-abrir').disabled = true;
                document.getElementById('btn-img-preencher').disabled = true;
                Toast.info('Nenhuma correspondência.');
                return;
            }

            this._renderizarMatches(matches);
            const melhor = matches[0];
            await this._mostrarDetalhe(melhor.registro_id, melhor.similaridade);

            const pct = (melhor.similaridade * 100).toFixed(1);
            const nivel = melhor.similaridade >= 0.8 ? '🎯 ALTA PRECISÃO'
                        : melhor.similaridade >= 0.55 ? '⚖️ PRECISÃO MÉDIA'
                        : '⚠️ BAIXA PRECISÃO';
            Toast.info(`${nivel} — ${pct}% (ID ${melhor.registro_id})`);

        } catch (e) {
            Loading.hide();
            console.error(e);
            Toast.error('Erro na busca: ' + e.message);
        }
    },

    _renderizarMatches(matches) {
        const grid = document.getElementById('matches-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 3; i++) {
            const card = document.createElement('div');
            card.className = 'match-card';

            if (matches[i]) {
                const m = matches[i];
                const pct = (m.similaridade * 100).toFixed(1);
                const conf = m.similaridade >= 0.80 ? 'conf-alta'
                          : m.similaridade >= 0.55 ? 'conf-media'
                          : 'conf-baixa';
                card.classList.add(conf);
                card.innerHTML = `
                    <div style="aspect-ratio:1;background:var(--bg-dark);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--fg-secondary);">
                        #${m.registro_id}
                    </div>
                    <div class="match-name">${escapeHtml(m.nome)}</div>
                    <div style="font-size:9pt;">Confiança: ${pct}%</div>
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

    async _mostrarDetalhe(id, sim) {
        try {
            const raw = await API.buscarRegistro(id);
            const u = Cadastro._normalizarRegistro ? Cadastro._normalizarRegistro(raw) : raw;
            this.ultimoMatchId = id;

            const foto = document.getElementById('img-detalhe-foto');
            const fotos = raw.fotos || [];
            if (fotos.length > 0) {
                foto.innerHTML = `<img src="${fotos[0].dataUrl}" alt="${escapeHtml(raw.nome)}">`;
            } else {
                foto.textContent = 'Sem foto';
            }

            const tat = (u.tatuagens || []).map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
            const sin = (u.sinais || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';
            const pct = sim * 100;
            const cor = pct >= 80 ? 'var(--success)' : pct >= 55 ? 'var(--warning)' : 'var(--info)';

            document.getElementById('img-detalhe-info').innerHTML = `
                <h3 style="color:var(--accent);">${escapeHtml(raw.nome)}</h3>
                <p style="color:${cor};font-weight:bold;">Confiança: ${pct.toFixed(1)}%</p>
                <p><b>ID:</b> ${raw.id} &nbsp; <b>Apelido:</b> ${escapeHtml(raw.apelido || '—')}</p>
                <p><b>RG:</b> ${escapeHtml(raw.rg || '—')} &nbsp; <b>Nascimento:</b> ${escapeHtml(raw.data_nascimento || '—')}</p>
                <p><b>Cor:</b> ${escapeHtml(raw.cor || '—')} &nbsp; <b>Altura:</b> ${escapeHtml(raw.altura || '—')}</p>
                <p><b>Cidade:</b> ${escapeHtml(raw.cidade || '—')}</p>
                <p><b>🎨 Tatuagens:</b></p><ul>${tat}</ul>
                <p><b>🔎 Sinais:</b></p><ul>${sin}</ul>
            `;
            document.getElementById('btn-img-abrir').disabled = false;
            document.getElementById('btn-img-preencher').disabled = false;
        } catch (e) {
            console.error(e);
            Toast.error('Erro ao carregar detalhes: ' + e.message);
        }
    },

    async _abrirRegistro() {
        if (!this.ultimoMatchId) return;
        try {
            const u = await API.buscarRegistro(this.ultimoMatchId);
            Cadastro.abrirDetalhes(u);
        } catch (e) {
            Toast.error(e.message);
        }
    },

    async _preencherFormulario() {
        if (!this.ultimoMatchId) return;
        try {
            const u = await API.buscarRegistro(this.ultimoMatchId);
            Cadastro.preencher(u);
            TabsManager.ativar('cadastros');
            Toast.success(`Dados de "${u.nome}" carregados no formulário.`);
        } catch (e) {
            Toast.error(e.message);
        }
    },

    limpar() {
        this.imagemEntrada = null;
        this.descriptorEntrada = null;
        this.ultimoMatchId = null;
        this._fecharWebcam();
        const preview = document.getElementById('preview-imagem');
        preview.innerHTML = '<span class="placeholder-text">Nenhuma imagem</span>';
        this._renderizarMatches([]);
        document.getElementById('img-detalhe-foto').textContent = 'Sem dados';
        document.getElementById('img-detalhe-info').innerHTML =
            '<p class="placeholder-text">Os dados do registro mais provável aparecerão aqui após a busca.</p>';
        document.getElementById('btn-img-abrir').disabled = true;
        document.getElementById('btn-img-preencher').disabled = true;
    }
};
