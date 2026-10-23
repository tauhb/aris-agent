# Kiểm kê giao diện web của dsh

> Tự sinh bởi `node scripts/ui/inventory.mjs --md docs/giao-dien/kiem-ke-dsh.md` từ profile `aris`, dsh `0.2.1-rc.2`. Đừng sửa tay; chạy lại sau mỗi lần nâng dsh rồi so khác biệt.

- 73 row có phần client, 52 row có vẽ giao diện hoặc có chữ.
- 89 chỗ cắm (slot) được khai báo.
- 403 token theme `--dsw-*`; 2413 chuỗi chữ tiếng Anh.

## Row có giao diện

| Row | Gói | Chuỗi chữ | Cắm vào | Mô tả |
|---|---|---|---|---|
| `session-log-download` | `dsh-session-log-export` | 10 | `conversation.session.header.utilities` | Web Session-log export command and shared download dialog |
| `ui-open-in-app` | `dsh-client-ui-open-in-app` | 15 | `conversation.session.header.utilities` `sidebar.right.tab.files.actions` `sidebar.right.tab.document.actions` `sidebar.right.tab.document.unpreviewable` `deliverables.file.actions` `deliverables.review.file.actions` | Web "Open In..." controls: the Session-header split button opening the workspace directory in an installed app |
| `ui-settings-account` | `dsh-client-ui-settings-account` | 94 | `shell.overlay` `settings.launcher` `settings.section` | Manage DeepSeek login and open Platform billing pages |
| `ui-theme` | `dsh-client-ui-theme` | 25 | `settings.general.item` | Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; -- |
| `locale` | `dsh-client-locale` | 47 | `settings.general.item` | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dicti |
| `ui-shortcuts` | `dsh-client-ui-shortcuts` | 56 | `settings.general.item` `shell.overlay` | Keyboard shortcut reference, recording, and local preference editing |
| `ui-layout` | `dsh-client-ui-layout` | 4 |  | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `ui-sidebar` (tắt có điều kiện) | `dsh-client-ui-sidebar` | 5 | `sidebar` `shell.leading` | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `ui-sidebar-right` | `dsh-client-ui-sidebar-right` | 34 | `rightbar.session` `conversation.session.header.corner` `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigat |
| `ui-sidebar-documentpreview` | `dsh-client-ui-sidebar-documentpreview` | 77 | `sidebar.right.tab.document` `sidebar.right.tab.document.action` `sidebar.right.tab.document.office.pdf` `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain t |
| `ui-sidebar-browser` (tắt có điều kiện) | `dsh-client-ui-sidebar-browser` | 26 | `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` | Sandboxed Web browser tabs for the right Sidebar |
| `ui-sidebar-terminal` | `dsh-client-ui-sidebar-terminal` | 28 | `sidebar.right.tab.guide.entry` `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` | Interactive shell tabs for the right Sidebar |
| `ui-sidebar-files` | `dsh-client-ui-sidebar-files` | 17 | `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` | Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote name |
| `ui-settings-general` | `dsh-client-ui-settings-general` | 41 | `settings.general.item` `sidebar.toggle.badge` `sidebar.settings` `settings.trigger` `settings.header` `settings.action` … | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome conten |
| `ui-settings-models` | `dsh-client-ui-settings-models` | 134 | `settings.section` `settings.onboarding` | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `ui-plugin-manager` | `dsh-client-ui-plugin-manager` | 221 | `shell.overlay` `main` `sidebar.panellist` | Plugin management for the dsh web client: the sidebar Plugins panel installs, enables, disables, retries, and  |
| `ui-settings-plugin-inventory` | `dsh-client-ui-settings-plugin-inventory` | 37 | `settings.plugins.tab` | Read-only Cordis Loader inventory tab in Web Plugins settings |
| `ui-conversation` | `dsh-client-ui-conversation` | 373 | `conversation.input.dock` `conversation.user.text` `conversation.user.text.node` `settings.general.item` `main.conversation` `conversation.content` … | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `ui-approval` | `dsh-client-ui-approval` | 5 | `conversation.composer` | Approval composer takeover over the scoped Remote Event waterfall |
| `ui-chat` | `dsh-client-ui-chat` | 191 | `conversation.chat.reasoning.content` `conversation.chat.reasoning.body` `conversation.chat.node` `settings.general.item` `conversation.chat.user.content` `conversation.chat.flow` … | Chat Conversation target, node definitions, renderers, and details surface |
| `ui-brand-official` | `dsh-client-ui-brand-official` |  | `sidebar.brand.mark` `sidebar.brand.name` | Official DeepSeek Harness brand occupants for the Web client's sidebar slots |
| `ui-attachment` | `dsh-client-ui-attachment` |  | `conversation.images.content` `conversation.input.attachments` `conversation.chat.message.images` `conversation.chat.user.images` `conversation.trajectory.images` `tool.call.images` | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `ui-tool` | `dsh-client-ui-tool` |  | `tool.call.toolview` `conversation.chat.node` | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `ui-cordis` | `dsh-client-ui-cordis` | 51 | `sidebar.footer.action` `tool.call.toolview` | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `ui-deliverables` | `dsh-client-ui-deliverables` | 60 | `conversation.chat.turnTail` `tool.call.toolview` `sidebar.right.pane.tab` | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references |
| `ui-workspace` | `dsh-client-ui-workspace` | 119 | `dsh.sessions.current` `workspace.toast.content` `workspace.toast` `sidebar.workspaces` `sidebar.workspaces.session.menu.item` `sidebar.workspaces.session.row.action` … | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |
| `ui-workflow-run` | `dsh-client-ui-workflow-run` | 18 | `conversation.chat.node` | Durable workflow-run Conversation Node and nested member disclosure for dsh web |
| `ui-input-trigger` | `dsh-client-ui-input-trigger` | 9 | `conversation.input.overlay` | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `ui-commands` | `dsh-client-ui-commands` | 28 | `conversation.input.overlay` | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `ui-skill` | `dsh-client-ui-skill` | 8 | `tool.call.toolview` `conversation.user.text.node` | Web skill references and the dedicated skill tool row |
| `ui-subagent` | `dsh-client-ui-subagent` | 41 | `sidebar.right.pane.tab` `sidebar.chat.conversation` `conversation.session.header.lineage` `conversation.session.header.actions` `conversation.composer` | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `ui-reference` | `dsh-client-ui-reference` | 15 | `conversation.user.text.node` | Unified Web @file and @session reference source |
| `ui-secret-mask` | `dsh-client-ui-secret-mask` | 2 | `conversation.user.text.node` | Web display masking for recognized credentials in sent user text |
| `ui-jobs` | `dsh-client-ui-jobs` | 40 | `conversation.session.header.actions` | Session-header background-job list with on-demand streaming record panels |
| `ui-schedule` | `dsh-client-ui-schedule` | 150 | `shell.overlay` `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` `main` `sidebar.panellist` `conversation.chat.turnTail` … | Host task management page and Session reminder catalog |
| `ui-goal` | `dsh-client-ui-goal` | 12 | `conversation.user.text.node` `conversation.chat.node` `conversation.input.dock` | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `ui-message-feedback` | `dsh-client-ui-message-feedback` | 20 | `conversation.input.overlay` | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dial |
| `ui-model-selection` | `dsh-client-ui-model-selection` | 23 | `conversation.input.model` | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `ui-deepseek-model-label-1017` | `dsh-client-ui-deepseek-model-label-1017` |  | `conversation.input.model.label` | Temporary 1017 release badge for official DeepSeek Flash model labels |
| `ui-permission` | `dsh-client-ui-permission-presets` | 12 | `settings.general.item` `conversation.input.permission` | Permission surfaces: a new-session default in General settings and a current-session /permission popup over th |
| `ui-agent-preset` | `dsh-client-ui-agent-preset` | 28 | `conversation.hero.agentPreset` `conversation.session.header.actions` `plugins.add.actions` `settings.section` | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `ui-settings-session-log` | `dsh-client-ui-settings-session-log` | 4 | `settings.general.item` `shell.overlay` | General settings control for Session-log upload with DeepSeek API requests |
| `ui-settings-plugins` | `dsh-client-ui-settings-plugins` | 5 | `settings.section` | Built-in plugins settings section for the dsh web client: the Settings navigation entry and the tab chrome fea |
| `ui-settings-shell` | `dsh-client-ui-settings-shell` | 14 | `plugins.item` | Settings page of the shell executor on the dsh web client's Plugins page: the command timeout and the per-stre |
| `ui-settings-agent-loop` | `dsh-client-ui-settings-agent-loop` | 12 | `plugins.item` | Settings page of the agent loop on the dsh web client's Plugins page: the parallel tool-call cap of the agent- |
| `ui-settings-subagent` | `dsh-client-ui-settings-subagent` | 35 | `plugins.item` | Settings page of Subagent delegation on the dsh web client's Plugins page: recursion depth, parallel capacity, |
| `ui-settings-web-search` | `dsh-client-ui-settings-web-search` | 27 | `plugins.item` | Settings page of the DeepSeek web-search provider on the dsh web client's Plugins page: its API key, endpoint, |
| `ui-plan` | `dsh-client-ui-plan` | 17 | `conversation.chat.turnTail` `sidebar.right.pane.tab` `sidebar.right.pane.tab.title` `conversation.input.plan` | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `ui-user-questions` | `dsh-client-ui-user-questions` | 31 | `conversation.composer` `conversation.chat.node` | Web ask_user_question composer takeover and plan-review presentation UI |
| `ui-trajectory` | `dsh-client-ui-trajectory` | 192 | `dsh.trajectory.duration` `dsh.trajectory.jsonStringWrapping` `conversation.view` | Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the convers |
| `aris-ui-sidebar` | `@aris/ui-sidebar` |  | `sidebar` `shell.leading` | Thanh bên trái của aris thay cho @deepseek-ai/dsh-client-ui-sidebar: cùng hợp đồng slot, giao diện theo canvas |
| `aris-ui-chat-header` | `@aris/ui-chat-header` |  | `conversation.header.leading` `conversation.session.header.actions` `conversation.session.header.utilities` | Đầu khung chat của aris: "Bot / Phiên ▾", danh sách phiên và nút phiên mới, cắm vào các slot đầu khung của dsh |

## Chỗ cắm

`conversation.approval.detail (single)` · `conversation.chat.commandview (keyed)` · `conversation.chat.flow (single)` · `conversation.chat.message.images (single)` · `conversation.chat.node (keyed)` · `conversation.chat.reasoning.body (single)` · `conversation.chat.turnTail (list)` · `conversation.chat.user.images (single)` · `conversation.composer.bar (single)` · `conversation.composer.dock (list)` · `conversation.header (single)` · `conversation.header.leading (single)` · `conversation.hero.agentPreset (single)` · `conversation.hero.brand.mark (single)` · `conversation.hero.options (list)` · `conversation.hero.workspace (single)` · `conversation.hero.workspace.directoryFlow (single)` · `conversation.input.activity (single)` · `conversation.input.attachments (single)` · `conversation.input.dock (list)` · `conversation.input.left (list)` · `conversation.input.model (single)` · `conversation.input.model.label (single)` · `conversation.input.overlay (list)` · `conversation.input.permission (single)` · `conversation.input.plan (single)` · `conversation.input.right (list)` · `conversation.session (single)` · `conversation.session.header (single)` · `conversation.session.header.actions (list)` · `conversation.session.header.corner (single)` · `conversation.session.header.lineage (single)` · `conversation.session.header.utilities (list)` · `conversation.trajectory.images (single)` · `conversation.user.text.node (keyed)` · `conversation.view (list)` · `deliverables.file.actions (list)` · `deliverables.review.file.actions (list)` · `main.conversation (single)` · `plugins.add.actions (list)` · `plugins.bundle.activation (keyed)` · `plugins.bundle.config (keyed)` · `plugins.detail.actions (list)` · `plugins.detail.badge (list)` · `plugins.detail.section (list)` · `plugins.item (list)` · `plugins.row.config (keyed)` · `plugins.tab (list)` · `rightbar.session (single)` · `settings.action (list)` · `settings.close (single)` · `settings.general.item (list)` · `settings.header (single)` · `settings.launcher (single)` · `settings.models.footer (list)` · `settings.onboarding (list)` · `settings.plugins.tab (list)` · `settings.section (list)` · `settings.trigger (single)` · `shell.bottom (single)` · `shell.leading (single)` · `shell.overlay (list)` · `sidebar.brand.mark (single)` · `sidebar.brand.name (single)` · `sidebar.chat.conversation (single)` · `sidebar.footer.action (list)` · `sidebar.panellist (list)` · `sidebar.right.pane.tab (keyed)` · `sidebar.right.pane.tab.title (keyed)` · `sidebar.right.tab.document (keyed)` · `sidebar.right.tab.document.action (keyed)` · `sidebar.right.tab.document.actions (list)` · `sidebar.right.tab.document.office.pdf (keyed)` · `sidebar.right.tab.document.unpreviewable (list)` · `sidebar.right.tab.files.actions (list)` · `sidebar.right.tab.guide.entry (keyed)` · `sidebar.right.tab.menu.item (list)` · `sidebar.session.row.hover (list)` · `sidebar.session.row.leading (list)` · `sidebar.settings (single)` · `sidebar.toggle.badge (single)` · `sidebar.workspaces (single)` · `sidebar.workspaces.directoryFlow (single)` · `sidebar.workspaces.session.menu.item (list)` · `sidebar.workspaces.session.row.action (list)` · `tool.call.images (single)` · `tool.call.toolview (keyed)` · `tool.view.cordis (keyed)` · `workspace.toast (keyed)`

## Nhóm token theme

| Nhóm | Số token |
|---|---|
| `--dsw-font-markdown-*` | 102 |
| `--dsw-static-neutral-*` | 35 |
| `--dsw-alias-bg-*` | 15 |
| `--dsw-alias-button-*` | 15 |
| `--dsw-alias-label-*` | 13 |
| `--dsw-alias-state-*` | 12 |
| `--dsw-font-base-*` | 12 |
| `--dsw-font-s-*` | 12 |
| `--dsw-font-xs-*` | 12 |
| `--dsw-font-xxs-*` | 12 |
| `--dsw-font-xxxs-*` | 12 |
| `--dsw-static-blue-*` | 12 |
| `--dsw-static-deepseek-*` | 11 |
| `--dsw-alias-markdown-*` | 8 |
| `--dsw-static-red-*` | 8 |
| `--dsw-alias-border-*` | 7 |
| `--dsw-alias-file-*` | 6 |
| `--dsw-font-l-*` | 6 |
| `--dsw-font-m-*` | 6 |
| `--dsw-font-xl-*` | 6 |
| `--dsw-static-green-*` | 6 |
| `--dsw-alias-interactive-*` | 5 |
| `--dsw-static-amber-*` | 5 |
| `--dsw-alias-brand-*` | 4 |
| `--dsw-alias-onboarding-*` | 4 |
| `--dsw-alias-scrollbar-*` | 4 |
| `--dsw-specific-sidebar-*` | 4 |
| `--dsw-gradient-onboarding-*` | 3 |
| `--dsw-alias-code-*` | 2 |
| `--dsw-alias-menu-*` | 2 |
| `--dsw-alias-settings-*` | 2 |
| `--dsw-alias-toast-*` | 2 |
| `--dsw-alias-tooltip-*` | 2 |
| `--dsw-alias-turn-*` | 2 |
| `--dsw-elevation-stroke-*` | 2 |
| `--dsw-focus-ring-*` | 2 |
| `--dsw-font-family-*` | 2 |
| `--dsw-shadow-lv1-*` | 2 |
| `--dsw-specific-bubble-*` | 2 |
| `--dsw-alias-link-*` | 1 |
| `--dsw-alias-switch-*` | 1 |
| `--dsw-corner-shape-*` | 1 |
| `--dsw-elevation-panel-*` | 1 |
| `--dsw-elevation-prominent-*` | 1 |
| `--dsw-elevation-soft-*` | 1 |
| `--dsw-linear-gradient-*` | 1 |
| `--dsw-linear-think-*` | 1 |
| `--dsw-mask-blur-*` | 1 |
| `--dsw-menu-backdrop-*` | 1 |
| `--dsw-menu-surface-*` | 1 |
| `--dsw-radius-lg-*` | 1 |
| `--dsw-radius-md-*` | 1 |
| `--dsw-radius-panel-*` | 1 |
| `--dsw-radius-sm-*` | 1 |
| `--dsw-radius-xl-*` | 1 |
| `--dsw-radius-xs-*` | 1 |
| `--dsw-shadow-lv2-*` | 1 |
| `--dsw-shadow-lv3-*` | 1 |
| `--dsw-specific-input-*` | 1 |
| `--dsw-specific-login-*` | 1 |
| `--dsw-specific-menu-*` | 1 |
| `--dsw-specific-selector-*` | 1 |
| `--dsw-specific-tip-*` | 1 |
