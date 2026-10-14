/* ============================================================
   BUSCA POR IMAGEM — envia foto para a API
   ============================================================ */
const BuscaImagem = {
    imagemEntrada: null,
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

        try {
            Loading.show('Enviando imagem para análise...');
            const res = await API.buscaFacial(this.imagemEntrada);
            Loading.hide();

            // Se o backend retornar erro (ex: recurso indisponível)
            if (res && res.erro) {
                this._renderizarMatches([]);
                document.getElementById('img-detalhe-foto').textContent = 'Indisponível';
                document.getElementById('img-detalhe-info').innerHTML =
                    `<p class="placeholder-text">${escapeHtml(res.erro)}</p>`;
                document.getElementById('btn-img-abrir').disabled = true;
                document.getElementById('btn-img-preencher').disabled = true;
                Toast.warning(res.erro);
                return;
            }

            const matches = res.matches || [];

            if (matches.length === 0) {
                this._renderizarMatches([]);
                document.getElementById('img-detalhe-foto').textContent = 'Sem correspondência';
                document.getElementById('img-detalhe-info').innerHTML =
                    '<p class="placeholder-text">Nenhuma correspondência encontrada.</p>';
                document.getElementById('btn-img-abrir').disabled = true;
                document.getElementById('btn-img-preencher').disabled = true;
                Toast.info('Nenhuma correspondência encontrada.');
                return;
            }

            this._renderizarMatches(matches);

            // Mostra detalhes do melhor match
            const melhor = matches[0];
            await this._mostrarDetalhe(melhor.registro_id, melhor.similaridade);

            const pct = (melhor.similaridade * 100).toFixed(1);
            let nivel;
            if (melhor.similaridade >= 0.80) nivel = '🎯 ALTA PRECISÃO';
            else if (melhor.similaridade >= 0.55) nivel = '⚖️ PRECISÃO MÉDIA';
            else nivel = '⚠️ BAIXA PRECISÃO';

            Toast.info(`${nivel} — ${pct}% de similaridade com o registro #${melhor.registro_id}.`);
        } catch (e) {
            Loading.hide();
            console.error('Erro na busca facial:', e);

            // Se o backend não suporta (plano free), avisa
            if (e.message.includes('nao disponivel') || e.message.includes('não disponível') || e.message.includes('503')) {
                Toast.warning('Busca facial indisponível no plano atual do servidor.');
            } else {
                Toast.error('Erro: ' + e.message);
            }
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
            // Converte sinais/tatuagens em array
            const paraArray = (v) => {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                if (typeof v === 'string') return v.split(';').map(s => s.trim()).filter(s => s);
                return [];
            };

            this.ultimoMatchId = id;

            const foto = document.getElementById('img-detalhe-foto');
            const fotos = raw.fotos || [];
            if (fotos.length > 0) {
                foto.innerHTML = `<img src="${fotos[0].dataUrl}" alt="${escapeHtml(raw.nome)}">`;
            } else {
                foto.textContent = 'Sem foto';
            }

            const tatArr = paraArray(raw.tatuagens || raw.tatuagem);
            const sinArr = paraArray(raw.sinais);
            const tat = tatArr.map(t => `<li>${escapeHtml(t)}</li>`).join('') || '<li>—</li>';
            const sin = sinArr.map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>—</li>';
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
