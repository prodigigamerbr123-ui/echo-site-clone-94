# Manutenção de segurança

Procedimento técnico para as próximas entregas; o responsável operacional nominal ainda deve ser definido com o proprietário.

## A cada publicação

1. Executar scanner de segredos, auditoria npm, tipos, lint, alcance de módulos, testes e build. Registrar SHA e resultados.
2. Para backend/imagens: inventariar IDs imutáveis e exposição, atualizar base do scanner e comparar original/candidata com a mesma base. Contagens são ocorrências por pacote; não representam explorações confirmadas.
3. Conferir backup completo, hashes e cópia fora da VM antes da mudança. Validar em isolamento sem credenciais de provedores, jobs ou envios reais; definir retorno protegido contra mudanças posteriores.
4. Publicar apenas serviços necessários; conferir saúde, negativas de acesso, compatibilidade e preservação de dados/sessões. Registrar limites e atualizar handoff/índice.

## Rotina operacional

| Frequência proposta | Verificação | Evidência esperada |
| --- | --- | --- |
| Diária | Snapshot completo, sincronização, jobs, fila e conexão | Data do último sucesso, hashes, falhas e itens processando antigos; não apenas existência de arquivo. |
| Semanal | Advisories das imagens/dependências e recursos da VM | Versões, base de scanner, espaço livre, erros, risco/exposição e próximos passos. |
| Mensal e após mudança de backup | Exercício de restauração isolada | Artefatos, imagens, dados, login e arquivos recuperados; tempos e cleanup. |
| Após mudança de autenticação/permissão | Matriz e testes negativos | Acesso anon recusado, identidade/papel correto, negação de caminhos internos. |

A rotina acima não foi agendada como nova automação nem substitui alertas externos; não declarar monitoramento contínuo instalado. Timer de backup e sincronização existentes têm procedimentos próprios no runbook.

## Tratar um alerta

Priorizar exposição pública, possibilidade de exploração, privilégio e impacto nos dados. Falha explorável na borda ou vazamento de credencial exige triagem imediata; se necessário, conter a rota/credencial e preservar evidência. Para os demais achados, registrar responsável e prazo conforme risco e disponibilidade de correção. Versão corrigida de pacote não garante imagem compatível. Não aplicar upgrades de banco automaticamente ou ocultar achados sem justificativa verificável.

Registrar exceções com CVE/pacote, serviço, exposição, evidência, mitigação, risco residual e data de reavaliação. Não tratar patches locais como versão oficial nem eliminar um alerta apenas porque a função não é usada hoje.

## Pendências que exigem decisão do proprietário

Destino independente de backup e custo; metas RTO/RPO; responsável/alertas fora da VM; janela de rotação das credenciais e entrega privada do acesso do dono. SMTP foi dispensado e o administrador compartilhado foi mantido pelo cliente. Essas decisões não encerram os riscos residuais listados no handoff.
