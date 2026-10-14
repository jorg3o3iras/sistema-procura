/* ============================================================
   DASHBOARD — consome estatísticas da API (Neon)
   ============================================================ */
const Dashboard = {
    init() {
        document.getElementById('btn-refresh-dashboard')?.addEventListener('click', async () => {
            await this.atualizar();
            Toast.info('Dashboard atualizado');
        });
    },

    async atualizar() {
        try {
            const st = await API.estatisticas();
            document.getElementById('stat-total').textContent = st.total;
            document.getElementById('stat-com-foto').textContent = st.com_foto;
            document.getElementById('stat-indexados').textContent = st.com_embedding;
            document.getElementById('stat-com-pdf').textContent = st.com_pdf;
            document.getElementById('stat-sem-foto').textContent = st.sem_foto;
        } catch (e) {
            console.error('Erro dashboard:', e);
            Toast.error('Erro ao carregar dashboard: ' + e.message);
        }

        try {
            const registros = await API.listarRegistros();
            // Últimos 10
            const ultimos = registros.slice(-10).reverse();
            const tbody = document.querySelector('#table-ultimos tbody');
            if (tbody) {
                tbody.innerHTML = ultimos.map(u => `
                    <tr data-id="${u.id}">
                        <td>${u.id}</td>
                        <td>${escapeHtml(u.nome)}</td>
                        <td>${escapeHtml(u.cidade || '—')}</td>
                        <td>${escapeHtml(u.data_cadastro || '—')}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4" class="placeholder-text">Nenhum registro</td></tr>';

                tbody.querySelectorAll('tr[data-id]').forEach(tr => {
                    tr.addEventListener('dblclick', async () => {
                        try {
                            const u = await API.buscarRegistro(parseInt(tr.dataset.id));
                            Cadastro.abrirDetalhes(u);
                        } catch (e) {
                            Toast.error(e.message);
                        }
                    });
                });
            }
        } catch (e) {
            console.error('Erro ao listar registros:', e);
        }

        atualizarStatusBar();
    }
};
