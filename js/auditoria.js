/* ============================================================
   AUDITORIA
   ============================================================ */
const Auditoria = {
    init() {
        document.getElementById('btn-audit-refresh')?.addEventListener('click', () => this.atualizar());
        document.getElementById('audit-limite')?.addEventListener('change', () => this.atualizar());
    },

    atualizar() {
        const limite = parseInt(document.getElementById('audit-limite').value) || 500;
        const registros = MockDB.listarAuditoria(limite);
        const tbody = document.querySelector('#table-auditoria tbody');

        tbody.innerHTML = registros.map(r => `
            <tr>
                <td>${escapeHtml(r.timestamp || '')}</td>
                <td>${escapeHtml(r.usuario || '')}</td>
                <td>${escapeHtml(r.acao || '')}</td>
                <td>${r.alvo_id || ''}</td>
                <td>${escapeHtml(r.detalhes || '')}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="placeholder-text">Nenhum registro de auditoria</td></tr>';
    }
};