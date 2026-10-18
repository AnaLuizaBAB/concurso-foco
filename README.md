# ConcursoFoco

Aplicativo web estático para gestão de tempo de estudo voltado a concursos públicos. Sem build, sem dependências e sem framework: apenas HTML, CSS e JavaScript puro (ES modules), com os dados salvos no `localStorage` do navegador.

## Funcionalidades

- **Painel**: resumo de hoje, semana e mês, sequência de dias estudados, anel de meta diária, últimas sessões e início rápido por matéria.
- **Cronômetro**: modo livre (stopwatch) e modo Pomodoro com ciclos, pausas curtas e pausa longa; anotação e questões/acertos por sessão.
- **Matérias**: cadastro com cor, peso no edital e meta semanal individual opcional.
- **Estatísticas**: períodos de 7/30/90 dias ou todo o período, tempo por matéria, meta semanal redistribuída por peso, gráfico dos últimos 14 dias e heatmap das últimas 12 semanas.
- **Histórico**: registro manual de sessões, filtro por matéria, edição e exclusão.
- **Ajustes**: metas, tempos do Pomodoro, tema (automático/escuro/claro), exportação/importação de backup em JSON e reset completo.
- **PWA**: instalável e funcional offline quando servido por HTTP (service worker).
- **Acessibilidade**: navegação por teclado, foco visível, papéis ARIA em abas, modais e toasts.

## Como rodar

Não há instalação nem build, mas o app usa ES modules e service worker, que o navegador só carrega por HTTP — abrir o `index.html` direto do disco (`file://`) não funciona. Sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

Depois acesse <http://localhost:8000>. Também funciona com `npx serve`, Live Server do VS Code e equivalentes.

## Backup e importação

- **Exportar**: aba Ajustes → "Exportar dados (JSON)" baixa um arquivo com todas as matérias, sessões e ajustes.
- **Importar**: aba Ajustes → "Importar dados" → selecione um arquivo exportado pelo app. Os dados atuais são substituídos após confirmação.
- Backups antigos continuam compatíveis: campos novos são opcionais e recebem valores padrão na importação.

## Dados no localStorage

Tudo fica sob a chave `concursofoco.v1`, no formato abaixo.

```json
{
  "subjects": [
    {
      "id": "abc123",
      "name": "Português",
      "color": "#4f8ef7",
      "weight": 1,
      "weeklyGoalMin": null
    }
  ],
  "sessions": [
    {
      "id": "xyz789",
      "subjectId": "abc123",
      "start": 1750000000000,
      "seconds": 3600,
      "note": "Resumo de crase",
      "type": "stopwatch",
      "questions": 20,
      "correct": 17
    }
  ],
  "settings": {
    "dailyGoalMin": 240,
    "weeklyGoalMin": 1200,
    "pomodoroMin": 25,
    "breakMin": 5,
    "longBreakMin": 15,
    "theme": "auto"
  },
  "timer": {
    "mode": "stopwatch",
    "status": "idle",
    "subjectId": "abc123",
    "phase": "focus",
    "accumulatedSec": 0,
    "elapsedSec": 0,
    "startedAt": null,
    "durationSec": null,
    "cyclesToday": 0,
    "cycleDate": "2026-10-17"
  }
}
```

- `subjects`: `id`, `name`, `color` (hex), `weight` (peso no edital) e `weeklyGoalMin` (meta semanal própria em minutos; `null` = proporcional ao peso).
- `sessions`: `id`, `subjectId`, `start` (timestamp em ms), `seconds`, `note`, `type` (`stopwatch`, `pomodoro` ou `manual`), `questions` e `correct` (opcionais; `null` quando não informados).
- `settings`: metas em minutos, tempos do Pomodoro e tema (`auto`, `dark` ou `light`).
- `timer`: estado do cronômetro persistido entre recarregamentos.

## Estrutura de arquivos

```
index.html                 página única com todas as abas
styles.css                 estilos (temas escuro e claro)
manifest.webmanifest       manifest do PWA
sw.js                      service worker (cache offline)
icons/icon.svg             ícone do app
js/main.js                 inicialização, navegação por abas, formulários e backup
js/storage.js              estado, localStorage, sanitização e utilidades de dados
js/timer.js                cronômetro e pomodoro (motor + renderização)
js/ui.js                   toast, som, notificações e modal de confirmação
js/utils.js                helpers de DOM, formatação e escapes
js/dates.js                funções de data
js/render/subjects.js      aba Matérias
js/render/dashboard.js     aba Painel
js/render/stats.js         aba Estatísticas (barras, gráfico e heatmap)
js/render/history.js       aba Histórico (listagem e edição)
tests/logic.test.js        testes de lógica pura (datas, normalização, estatísticas)
```

## Testes

```bash
node tests/logic.test.js
```

Os testes cobrem funções puras de data e a sanitização de dados (`normalizeState`), sem precisar de navegador.

## Licença

MIT — veja [LICENSE](LICENSE).
