# Escopo de encerramento — academia pequena

Decisão do proprietário em 15/10/2026: sistema de uso interno para uma academia pequena; entregar o básico bem feito. Este documento define a prioridade da auditoria. A matriz histórica de 63 itens continua preservada no handoff, mas não representa 63 requisitos obrigatórios para liberar o uso.

## O que precisa funcionar bem

| Essencial | Situação e ação |
| --- | --- |
| Acesso e dados protegidos | Login compartilhado mantido; sem acesso anônimo aos alunos. Concluir troca coordenada das credenciais expostas, preservando o acesso do dono. Uso interno não muda a exposição atual do site à internet. |
| Alunos e avaliações | Cadastro, edição, busca, agenda, remarcação, cancelamento e histórico já têm correções/testes. Corrigir falhas concretas; não reescrever telas apenas por tamanho. |
| Mensagens previsíveis | Preservar fila transacional e tratamento de resultado incerto. Não reenviar falhas antigas automaticamente. Conferir conexão e falhas visíveis ao operador. |
| Backup recuperável | Núcleo Workout e três bancos/configuração Evolution restaurados em isolamento a partir de 20261015T174108Z; cópia no computador verificada. Observar primeiro ciclo automático ampliado. Não foi demonstrada reconexão ao provedor em outro host. Destino externo continua a definir; não contratar serviço sem acordo de custo. |
| Erros compreensíveis | Mostrar falha e opção de tentar novamente; impedir cliques repetidos e sucesso falso. Não exibir dados vazios como se a consulta tivesse funcionado. |
| Operação simples | Instruções curtas de acesso, backup, atualização e retorno. Studio/Meta somente sob demanda de manutenção; dez serviços essenciais mantidos por padrão. Monitorar falhas reais; manter os checks de CI existentes. |

## Melhorias que podem ficar para depois

Não são condições de encerramento básico: contas por funcionário, SMTP, múltiplas academias, campanhas avançadas, financeiro completo, métricas de conversão, linha do tempo abrangente, importação CSV, novos protocolos de avaliação, sincronização de rascunhos entre dispositivos e funcionalidades TUS/S3/transformação de imagem que não sejam usadas.

Testes de carga em escala elevada, otimizações sem lentidão observada e reorganizações adicionais apenas estéticas também ficam para evolução. Conferir os fluxos importantes em celular é útil; não exige uma campanha completa de certificação de todos os navegadores.

## Segurança proporcional e limites honestos

Priorizar credenciais expostas, acesso público indevido, perda de dados, erros de envio e falhas com impacto no uso. Manter registro dos achados dos containers e corrigir os alcançáveis/concretos com mudança compatível. Não exigir zero alertas de qualquer severidade como sinônimo de sistema seguro; também não considerar um alerta resolvido só porque o sistema é pequeno.

Backup independente, recuperação em servidor vazio e estabilidade por vários dias têm valor operacional. Quando ainda não demonstrados, registrar a limitação e o caminho de execução; não inventar garantias de recuperação ou disponibilidade.

## Entrega básica pode ser encerrada quando

Os fluxos essenciais estiverem verificados, falhas conhecidas relevantes corrigidas, acesso do dono protegido, backup dos dados necessários conferido e instruções entregues. Riscos residuais devem estar descritos e priorizados. Melhorias futuras permanecem no backlog, sem prolongar indefinidamente esta entrega.
