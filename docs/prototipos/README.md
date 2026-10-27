# Protótipos de fluxo para aprovação

`cadastro-ficha.html` é a revisão 01 da proposta de cadastro, conferência, ficha
e acesso ao agendamento com o aluno selecionado. É um arquivo independente do
aplicativo: dados fictícios permanecem somente em memória e são apagados ao
recarregar. Não consulta o backend, não envia mensagens e não cria cobranças.

Para abrir a partir da raiz do repositório:

```powershell
python -m http.server 18092 --bind 127.0.0.1 --directory docs/prototipos
```

Abrir `http://127.0.0.1:18092/cadastro-ficha.html`. O botão **Preencher exemplo
fictício** demonstra uma aluna antiga com avaliação anterior e convênio.
Prosseguir em **Conferir cadastro**, **Concluir na simulação** e **Agendar avaliação**.

Os campos de início de matrícula, benefício separado, avaliação anterior e escolha
de boas-vindas são propostas sujeitas à revisão do proprietário. Regras completas
de validação/duplicidade, disponibilidade e automações devem ser implementadas
e verificadas no aplicativo após definir o fluxo. Este protótipo não representa
funcionalidades já publicadas. Referência: `docs/PARECER-FLUXOS-E-REGRAS.md`.
