# Histórico da IA — 13/10/2026

Corrigido `list_sent_messages`: filtro de aluno no PostgreSQL antes do limite, join interno somente quando há filtro, ordenação estável por sent_at/id, total exato e indicação de lista parcial. Preserva token/RLS e informa que histórico de tentativas não comprova entrega. Curingas no nome são escapados.

A alteração local anterior de ai-database-actions foi revertida: send-whatsapp já era um endpoint de enfileiramento, sem chamar Evolution. A substituição perdia validação de destinatários, personalização e espaçamento. Produção nunca recebeu essa alteração incorreta. ai_pending_actions já registra autor, ferramenta, argumentos, criação, estado e resultado; isso não equivale a auditoria imutável ou registro completo de transições, mas dispensa criar tabela duplicada sem definir essa necessidade.

Validação: seis testes locais (histórico e dashboard), tipos da aplicação, lint dos arquivos alterados. Treze verificações no staging com Auth/PostgREST/Edge reais: 35 mensagens antigas do aluno e 40 recentes de outro aluno; consulta retorna 30 do alvo com total 35. Anônimo recusado. Fixtures removidas e runtime anterior restaurado. Zero chamadas de provedor real ou envios WhatsApp.

Publicado backend em /opt/workout-releases/20261013-ai-history. Backup imediatamente anterior 20261013T213109Z copiado localmente e hashes conferidos:
- database.dump: df3db9a7602ace98e3cd64c0064ec3555893afa7e93caefe7cb991e05282f885
- runtime.tar.gz: 4642a9c7139f04422469524322365cb5e6b9f9596e30565e553e677015b1c317

Arquivos de runtime conferidos por hash, acesso anônimo recusado com 403 no domínio backend. Preservados 3 alunos, 1 usuário e 13 mensagens de IA. Jobs retomados. Não há alteração de schema. Validação autenticada da consulta realizada no staging; nenhuma chamada paga em produção.

Pendências: prazo fixo de 90 dias na agenda, limites e totais nas demais consultas da IA, primeira execução diária com novo histórico e provedor real de IA. Auditoria permanece em andamento.
