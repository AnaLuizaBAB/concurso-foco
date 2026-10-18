# ConcursoFoco — Backlog de implementação (para agente de IA)

Documento para um agente de IA implementar melhorias no projeto. Siga as regras, faça uma tarefa por vez, em ordem de prioridade, e marque as caixas conforme concluir.

## Contexto do projeto

- App estático, vanilla: `index.html`, `app.js`, `styles.css`. Sem build, sem dependências, sem framework.
- Persistência inteiramente em `localStorage`, chave `concursofoco.v1`.
- Abas: Painel (dashboard), Cronômetro (stopwatch/Pomodoro), Matérias, Estatísticas, Histórico, Ajustes.
- UI e strings 100% em pt-BR.
- O arquivo de teste `/tmp/opencode/test-concursofoco.js` (harness Node com stubs de DOM/localStorage) pode não existir em sessões futuras; se citado, recrie conforme descrito em "Verificação".

## Regras para o agente

1. Estilo do código existente: sem comentários no código, funções `camelCase` (renderizadoras usam prefixo `render*`), CSS com classes utilitárias e variáveis em `:root`.
2. Todo texto vindo de dados do usuário precisa passar por `esc()` antes de entrar em `innerHTML`.
3. Toda cor vinda de dados externos precisa passar por `sanitizeColor()` (hex `#rrggbb`).
4. Qualquer campo novo de dados deve ser **opcional** e ter default aplicado em `normalizeState()` — nunca exigir campos novos (backups antigos devem continuar funcionando).
5. Não quebrar funcionalidades existentes. Após cada tarefa, teste manualmente as 6 abas.
6. Commits pequenos, um por tarefa, mensagem em pt-BR. Não fazer push sem pedido do usuário.
7. Não adicionar comentários nem emojis no código (o `todo.md` pode ter ambos).

## Verificação (sem runtime instalado no sistema)

- Sintaxe: baixe um Node temporário ou use um disponível: `node --check app.js`.
- Lógica pura (datas/normalize): rode um harness como o usado antes — `vm.createContext` com stubs de `window`, `document`, `localStorage`, `setInterval`, carregar `app.js` como string e expor funções. Recomendo recriar `tests/logic.test.js` nesse formato quando alterar `normalizeState`, datas ou estatísticas.
- UI: `python3 -m http.server 8000` e abrir `http://localhost:8000` (obrigatório para testar service worker).

## Mapa rápido de `app.js` (pontos de contato)

- Datas: `startOfDay`, `startOfWeek`, `startOfMonth`, `startOfNextMonth`, `dayKey`.
- Estado: `defaultState`, `loadState`, `normalizeState` (sanitização central), `save`.
- Timer: `timerStart`, `timerPause`, `timerFinish`, `onTick`, `renderTimer`, `resetTimerState`, `normalizeTimerData`.
- Render: `renderDashboard`, `renderStats`, `renderGoalStats`, `renderDailyChart`, `renderHistory`, `renderSubjects`, `renderSubjectOptions`, `switchTab`, `bindEvents` (todos os listeners).
- Util: `toast`, `beep`, `notify`, `esc`, `sanitizeColor`, `sessionsInRange`, `addSession`.

---

## Fase 1 — Qualidade base (baixo risco)

### T1. Debounce do `save()` durante o cronômetro

- [x] Hoje `onTick()` (bloco `now - lastPersist > 1500`) grava o estado JSON inteiro a cada 1,5s.
- [x] Criar `scheduleSave()` com debounce (trailing, ~2s) e usar em `onTick`.
- [x] Manter `save()` direto em eventos discretos: pause, finish, fim de fase pomodoro, CRUD de dados.
- [x] Adicionar listener `visibilitychange`: ao ficar `hidden` com timer rodando, salvar imediatamente.
- [x] Critério de aceite: fechar a aba durante o cronômetro rodando mantém o tempo acumulado; `performance` sem queda ao rodar o timer por 10 min.

### T2. Roteamento por hash de aba

- [x] `switchTab(name)` atualiza `location.hash` com o nome da aba.
- [x]Listener `hashchange` → chama `switchTab` com validação contra a lista de abas existentes.
- [x] No `init()`, se `location.hash` aponta para uma aba válida, abrir essa aba.
- [x] Critério de aceite: F5 na aba Estatísticas permanece em Estatísticas; voltar/avançar do navegador troca de aba; hash inválido cai no Painel (dashboard).

### T3. Modal próprio no lugar de `confirm()`

- [x] Criar modal em HTML/CSS (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
- [x] Função `askConfirm(msg)` retornando `Promise<boolean>`; substituir **todas** as chamadas nativas de `confirm(` (troca de modo, exclusão de matéria, exclusão de sessão, reset, import).
- [x] Teclado: `Enter` confirma, `Esc` cancela; foco entra no botão primário ao abrir e volta para o elemento disparador ao fechar (trap de foco simples).
- [x] Critério de aceite: nenhum `confirm(` nativo restante (verificar com grep); todos os fluxos de confirmação funcionam via teclado e mouse.

### T4. README e LICENSE

- [x] `README.md` em pt-BR: descrição, funcionalidades, como rodar (abrir `index.html` ou `python3 -m http.server`), como faz backup/importa, estrutura dos dados no localStorage (schema de `subjects`/`sessions`/`settings`/`timer`).
- [x] `LICENSE` MIT com autor "Analuiza".
- [x] Critério de aceite: um usuário novo consegue rodar o projeto lendo apenas o README.

---

## Fase 2 — Funcionalidades (foco "concurso")

### T5. Questões resolvidas e acertos por sessão

- [x] Novos campos opcionais em cada sessão: `questions` (int >= 0) e `correct` (int >= 0, <= questions); `null` quando não informado.
- [x] `addSession()` recebe e grava os campos; `normalizeState()` sanitize os dois (clamp, coerência `correct <= questions`).
- [x] Formulário do cronômetro: dois `input number` opcionais "Questões" e "Acertos" (esconder "Acertos" enquanto "Questões" vazio/0).
- [x] Formulário manual de registro idem.
- [x] Histórico: exibir "N questões · M% acerto" quando houver (calcular % na renderização, não gravar).
- [x] Estatísticas: dois cards novos no período — "Questões resolvidas" (soma) e "Acerto médio" (soma de acertos / soma de questões, só com sessões que têm o dado; mostrar `—` se nenhuma).
- [x] Export/import JSON: campos já cobertos pela sanitização de `normalizeState`.
- [x] Critério de aceite: registrar sessão com 10 questões/8 acertos aparece corretamente no histórico e nos cards; backups antigos importam sem erro.

### T6. Meta individual por matéria

- [x] Campo opcional em cada matéria: `weeklyGoalMin` (int > 0 ou `null` = proporcional ao peso).
- [x] Formulário de matéria: campo "Meta semanal (min)" com placeholder "proporcional ao peso"; vazio = `null`.
- [x] `renderGoalStats()`: matéria com meta própria usa a meta individual; matérias sem meta dividem o restante da meta semanal `settings.weeklyGoalMin` menos a soma das metas individuais, proporcionalmente ao peso. Se a soma das individuais exceder a semanal, mostrar a meta individual sem redistribuição negativa (clamp >= 0).
- [x] Atualizar também a exibição/sanitização em `normalizeState`.
- [x] Critério de aceite: definir 300min em uma matéria não altera a meta das outras além do rebate proporcional; total somado nunca fica negativo.

### T7. Editar sessão no histórico

- [x] Botão "Editar" em cada linha de `session-row`, junto do "Excluir".
- [x] Formulário de edição em modal (reaproveitar o modal de T3) com: início (`datetime-local`), duração (min), matéria (select), anotação, questões/acertos (reaproveitar campos de T5).
- [x] Ao salvar: atualizar a sessão mantendo o `id`; chamar `save()` + `renderAll()`.
- [x] Critério de aceite: editar uma sessão muda dashboard e estatísticas na hora; cancelar não altera nada.

### T8. Heatmap de 12 semanas nas estatísticas

- [x] Novo card "Últimas 12 semanas" com grade 7 linhas (seg–dom) x 12 colunas, célula colorida por intensidade de minutos do dia (4 faixas de cor derivadas de `--accent`, zero = `--surface-3`).
- [x] Gerar no JS com ESC (`esc()` só para strings; valores numéricos seguros), tooltip via `title` (ex.: "3h 20min · qua, 14 out").
- [x] Semana começa no domingo, igual a `startOfWeek`.
- [x] CSS: usar `grid`, células ~14px, responsivo com scroll horizontal.
- [x] Critério de aceite: dias cruzados por sessões manuais aparecem coloridos; semana de hoje coerente com "Esta semana" do painel.

---

## Fase 3 — Plataforma

### T9. PWA (offline + instalável)

- [x] `manifest.webmanifest`: `name`, `short_name` "ConcursoFoco", `display: standalone`, `background_color`/`theme_color` `#0b0f19`, `icons` (192 e 512; SVG permitido — criar `icons/icon.svg` baseado no logo "CF" do topbar).
- [x] `sw.js`: cache-first para o app shell (`./`, `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, ícones); constantes `CACHE_NAME` versionada; no `activate`, limpar caches antigos; `skipWaiting` + `clients.claim`.
- [x] Registrar em `init()` somente se `('serviceWorker' in navigator)` e `location.protocol` for `https:` ou `localhost`.
- [x] Atualizar a lista de cache do SW sempre que um arquivo novo entrar no app shell (tarefa T9 e as seguintes).
- [x] Critério de aceite: servir via `python3 -m http.server`, abrir, desligar o servidor e recarregar — app funciona offline; no Chrome DevTools aparece "Installable"/manifest sem warnings; cronômetro continua contando corretamente offline.

### T10. Tema claro

- [x] `state.settings.theme`: `"auto" | "dark" | "light"` (default `auto`), sanitizado em `normalizeState`.
- [x] Paleta clara em CSS: manter o `:root` dark atual e adicionar `@media (prefers-color-scheme: light)` e seletor `html[data-theme="light"]` (e `html[data-theme="dark"]` para forçar). Variáveis: `--bg`, `--surface*`, `--text`, `--muted`, `--border`, ajustar também `background-image` do body.
- [x] Picker de tema em Ajustes (3 opções) + aplicar `data-theme` no `<html>`; persistir com `save()`.
- [x] `<meta name="theme-color">` no `index.html`, atualizando em runtime conforme o tema.
- [x] Favicon: `icons/icon.svg` via `<link rel="icon" type="image/svg+xml">`.
- [x] Critério de aceite: alternar tema em Ajustes muda imediatamente e sobrevive a recarregar; "auto" segue a preferência do sistema (testar trocando no SO); contraste legível nos dois temas.

### T11. Acessibilidade

- [x] Abas: `role="tablist"` no nav, `role="tab"` + `aria-selected` nos botões (atualizar em `switchTab`), `role="tabpanel"` nos sections.
- [x] Toast: `role="status"` + `aria-live="polite"`.
- [x] Modal (T3): `dialog`/`aria-modal` + trap de foco (já coberto, revisar juntas).
- [x] CSS: estilos `:focus-visible` (outline com `--accent`), manter contraste AA no tema claro e escuro (T10).
- [x] Navegação por teclado completa: abas com setas esquerda/direita (padrão WAI-ARIA para tablist).
- [x] Critério de aceite: dar a volta em toda a UI usando **somente** o teclado; leitor de tela anuncia troca de aba e toasts.

---

## Fase 4 — Opcional (fazer por último)

### T12. Split de `app.js` em ES modules

- [x] Sugerir apenas quando o arquivo passar de ~1200 linhas. Estrutura: `js/dates.js`, `js/storage.js`, `js/timer.js`, `js/render/*.js`, `js/main.js` com `<script type="module">`.
- [x] Cuidado: atualizar a lista do cache no `sw.js` (T9) com os arquivos novos.
- [x] Critério de aceite: nenhum regresso de comportamento; `node --check` em cada módulo.

### T13. Índice de sessões por dia (otimização)

- [ ] Somente se, com dados reais grandes (5k+ sessões), as renderizações ficarem lentas: manter um Map `dayKey → [sessions]` recontruído em mutações de `state.sessions`, usado por `sessionsInRange`/`computeStreak`/`renderDailyChart`.

---

## Definition of Done (cada tarefa)

- `node --check` OK em todos os arquivos JS tocados.
- Abas testadas manualmente: Painel, Cronômetro (ambos os modos), Matérias, Estatísticas (períodos 7/30/90/tudo), Histórico (filtro + excluir/editar), Ajustes (salvar, exportar, importar, reset).
- Backup antigo (antes da tarefa) importa e funciona.
- Commit próprio em pt-BR; `todo.md` atualizado com a caixa marcada.


> Avaliação em 17/10/2026: benchmark com 5.000 sessões processa todas as renderizações em ~19ms; índice por dia (T13) não é necessário no momento. O split em módulos (T12) foi feito porque o app chegou a ~1.350 linhas; rodar de `file://` deixou de funcionar (ES modules exigem HTTP) e o README foi atualizado.