/* ============================================================
   FACE RECOGNITION — detecção facial 100% no navegador
   Usa face-api.js para gerar descritores de rosto (128 floats)
   Nenhuma imagem é enviada ao servidor para análise.
   ============================================================ */

const FaceRec = {
    modelsLoaded: false,
    loading: false,
    modelsPath: 'weights',

    /**
     * Carrega os modelos do face-api.js em background.
     * Chamado automaticamente no boot e sob demanda.
     */
    async carregarModelos() {
        if (this.modelsLoaded) return true;
        if (this.loading) {
            while (this.loading) {
                await new Promise(r => setTimeout(r, 200));
            }
            return this.modelsLoaded;
        }

        if (typeof faceapi === 'undefined') {
            console.error('[FaceRec] face-api.js não carregado. Verifique se js/face-api.min.js existe.');
            return false;
        }

        this.loading = true;
        try {
            console.log('[FaceRec] Carregando modelos de IA facial...');

            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(this.modelsPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(this.modelsPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(this.modelsPath)
            ]);

            this.modelsLoaded = true;
            console.log('[FaceRec] ✅ Modelos carregados com sucesso');
            return true;
        } catch (e) {
            console.error('[FaceRec] ❌ Erro ao carregar modelos:', e);
            console.error('[FaceRec] Verifique se a pasta "weights/" existe com os 7 arquivos.');
            this.modelsLoaded = false;
            return false;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Detecta 1 rosto numa imagem e retorna o descritor (128 floats).
     * @param {HTMLImageElement|HTMLCanvasElement} imgElement
     * @returns {Promise<{descriptor: number[], box: object}|null>}
     */
    async detectarRosto(imgElement) {
        if (!this.modelsLoaded) {
            await this.carregarModelos();
        }
        if (!this.modelsLoaded) return null;

        try {
            const deteccao = await faceapi
                .detectSingleFace(imgElement, new faceapi.TinyFaceDetectorOptions({
                    inputSize: 416,
                    scoreThreshold: 0.5
                }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!deteccao) return null;

            return {
                descriptor: Array.from(deteccao.descriptor),
                box: deteccao.detection.box
            };
        } catch (e) {
            console.error('[FaceRec] Erro na detecção:', e);
            return null;
        }
    },

    /**
     * Detecta TODOS os rostos numa imagem.
     * @returns {Promise<Array<{descriptor: number[], box: object}>>}
     */
    async detectarTodos(imgElement) {
        if (!this.modelsLoaded) await this.carregarModelos();
        if (!this.modelsLoaded) return [];

        try {
            const deteccoes = await faceapi
                .detectAllFaces(imgElement, new faceapi.TinyFaceDetectorOptions({
                    inputSize: 416,
                    scoreThreshold: 0.5
                }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            return deteccoes.map(d => ({
                descriptor: Array.from(d.descriptor),
                box: d.detection.box
            }));
        } catch (e) {
            console.error('[FaceRec] Erro na detecção múltipla:', e);
            return [];
        }
    },

    /**
     * Compara dois descritores. Retorna a distância euclidiana.
     * 0 = idênticos, < 0.6 = mesma pessoa (geralmente).
     */
    distancia(a, b) {
        if (!a || !b || a.length !== b.length) return Infinity;
        let s = 0;
        for (let i = 0; i < a.length; i++) {
            const d = a[i] - b[i];
            s += d * d;
        }
        return Math.sqrt(s);
    },

    /**
     * Retorna similaridade de 0 a 1. Quanto maior, mais parecido.
     */
    similaridade(a, b) {
        const d = this.distancia(a, b);
        return Math.max(0, 1 - d);
    },

    /**
     * Converte File ou DataURL em HTMLImageElement.
     */
    async carregarImagem(fonte) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Falha ao carregar imagem'));
            if (typeof fonte === 'string') {
                img.src = fonte;
            } else if (fonte instanceof File) {
                const reader = new FileReader();
                reader.onload = e => { img.src = e.target.result; };
                reader.onerror = reject;
                reader.readAsDataURL(fonte);
            } else {
                reject(new Error('Fonte inválida: use File ou DataURL'));
            }
        });
    },

    /**
     * Processa um arquivo de imagem:
     *   1. Lê como DataURL
     *   2. Carrega em <img>
     *   3. Detecta rosto e gera descritor
     * @returns {Promise<{dataUrl, descriptor, erro}>}
     */
    async processarArquivo(file) {
        try {
            // 1. Lê como DataURL
            const dataUrl = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = () => rej(new Error('Falha ao ler arquivo'));
                r.readAsDataURL(file);
            });

            // 2. Carrega em <img>
            const img = await this.carregarImagem(dataUrl);

            // 3. Detecta rosto
            const resultado = await this.detectarRosto(img);

            return {
                dataUrl,
                descriptor: resultado ? resultado.descriptor : null,
                erro: resultado ? null : 'Nenhum rosto detectado na imagem'
            };
        } catch (e) {
            return {
                dataUrl: null,
                descriptor: null,
                erro: e.message
            };
        }
    }
};

/* ============================================================
   BOOT — inicia o carregamento dos modelos em background
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // Aguarda 1s para não competir com o boot do app
    setTimeout(() => {
        console.log('[FaceRec] Iniciando carregamento automático...');
        FaceRec.carregarModelos();
    }, 1000);
});
