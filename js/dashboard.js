/* ============================================================
   DASHBOARD
   ============================================================ */
const Dashboard = {
    init() {
        document.getElementById('btn-refresh-dashboard')?.addEventListener('click', () => {
            this.atualizar();
            Toast.info('Dashboard atualizado');
        });
    },

    atualizar() {
        const st = MockDB.estatisticas();
        document.getElementById('stat-total').textContent = st.total;
        document.getElementById('stat-com-foto').textContent = st.comFoto;
        document.getElementById('stat-indexados').textContent = st.indexados;
        document.getElementById('stat-com-pdf').textContent = st.comPdf;
        document.getElementById('stat-sem-foto').textContent = st.semFoto;

        // Últimos 10 cadastros
        const ultimos = MockDB.listarTodos().slice(-10).reverse();
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
                tr.addEventListener('dblclick', () => {
                    const u = MockDB.buscarPorId(parseInt(tr.dataset.id));
                    if (u) {
                        Cadastro.abrirDetalhes(u);
                    }
                });
            });
        }

        atualizarStatusBar();
    }
};