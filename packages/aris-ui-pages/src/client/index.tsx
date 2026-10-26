/**
 * Các trang và hộp thoại aris: mỗi trang là một panel `aris-*` trong vùng chính của
 * dsh (trang có mục thanh bên thì đăng ký thêm `sidebar.panellist`), hộp thoại cắm
 * vào lớp phủ `shell.overlay`. Gói nào cũng mở được trang qua `arisNavigate`.
 */
import {
  announceRoute,
  mountKitCss,
  onArisNavigate,
  PROJECTS_CHANGED,
  registerPersonal,
  useTeamData,
} from '@aris/ui-kit/react'
import { useMemo, type ComponentType, type ReactNode } from 'react'
import { EN, NS, VI } from './locale.js'
import type {
  ConfigFormLike,
  CredentialState,
  DiscoveredModel,
  ModelGroup,
  ModelSettings,
  BundleInfo,
  ChangeResult,
  MarketIndexSummary,
  MarketQuery,
  MarketSearch,
  PluginInfo,
  PluginSnapshot,
  PluginSource,
  ConfigLedger,
  ConfigTarget,
  ConfigView,
  PluginConfig,
  PresetRow,
  PresetSource,
  SpecInspection,
  Outcome,
  PageNav,
  PageProps,
  SystemSection,
  SystemSettings,
  Translate,
} from './page.js'
import {
  ROUTES,
  createNavStore,
  isRoute,
  navigate,
  panelId,
  resolveRoute,
  type NavState,
  type Params,
  type RouteId,
} from './routes.js'
import { Routine } from './auto/Routine.js'
import { RoutineNew } from './auto/RoutineNew.js'
import { Brain } from './brain/Brain.js'
import { Approvals } from './mind/Approvals.js'
import { LEARN_CSS, Learn } from './mind/Learn.js'
import { Memory } from './mind/Memory.js'
import { Runs } from './mind/Runs.js'
import { Skill } from './mind/Skill.js'
import { Skills } from './mind/Skills.js'
import { Office } from './office/Office.js'
import { OFFICE_CSS } from './office/styles.js'
import { SettingsPage } from './settings/SettingsPage.js'
import { joinProviders } from './settings/provider-data.js'
import { BotProfile } from './team/Bot.js'
import { CloneBot } from './team/CloneBot.js'
import { McpDialog } from './team/BotTools.js'
import { CreateBot } from './team/CreateBot.js'
import { CreateProject, type ProjectActions } from './team/CreateProject.js'
import { Department } from './team/Department.js'
import { OwnerProfile } from './team/Owner.js'
import { Search } from './team/Search.js'
import { NavIcon } from './icons.js'
import { CSS } from './styles.js'

// Bối cảnh client của dsh; chỉ khai báo phần các trang dùng.
interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
    entriesOfSlot(name: string): { options: { id?: string; key?: string; order?: number; label?: unknown } }[]
    subscribe(name: string, fn: () => void): () => void
  }
  locale: {
    register(ns: string, locale: string, dict: Record<string, string>): () => void
    subscribe(fn: () => void): () => void
    resolveText(text: unknown): string
  }
  get(name: string): unknown
  reflect: { provide(name: string, value: unknown): () => void }
}

/**
 * Dịch vụ của dsh mà các trang dùng lúc chạy, lấy bằng `ctx.get` thay vì khai trong
 * `inject`. Plugin chỉ chờ `slots` và `locale` nên kích hoạt sớm, trước plugin "Chung"
 * của dsh (chờ kết nối): trang Cài đặt của aris nhờ vậy luôn là chỗ khai báo
 * `settings.section` (hai bên không cùng khai báo được, ai sau sẽ bị từ chối).
 */
interface Services {
  layout: { selectPanel(id: string | null): void }
  uiWorkspace: {
    pickDirectory(): Promise<string | null>
    openWorkspace(workspaceId: string): Promise<void>
    openSession(sessionId: string): void
    startSession(
      workspaceId: string | undefined,
      options: { clearPreviousDraft?: boolean; agentPreset?: string },
    ): void
  }
  configForms: {
    get(namespace: string): ConfigFormLike
    developerTools?: { enabled: { getSnapshot(): boolean; subscribe(fn: () => void): () => void } }
  }
  'remote.session': { modelCatalog(): Promise<Remote<{ groups: readonly ModelGroup[] }>> }
  'remote.llm': {
    listProviders(): Promise<Remote<readonly { id: string; name: string }[]>>
    listConfigurableProviders(): Promise<
      Remote<
        readonly {
          provider: string
          displayName: string
          settingsNs: string
          settingsPath: readonly string[]
          declared?: boolean
          defaultBaseURL?: string
          nativeAuth?: { env: readonly string[] }
          error?: string
        }[]
      >
    >
    discoverModels(
      settingsNs: string,
      request: { provider?: string; baseURL?: string; api?: string; apiKey?: string },
    ): Promise<Remote<readonly DiscoveredModel[]>>
  }
  'remote.pluginInventory': { list(): Promise<Remote<PluginSnapshot>> }
  'remote.pluginManager': {
    listPlugins(): Promise<Remote<PluginInfo[]>>
    listBundles(): Promise<Remote<BundleInfo[]>>
    setBundleEnabled(name: string, enabled: boolean): Promise<Remote<ChangeResult>>
    setPluginEnabled(id: string, enabled: boolean): Promise<Remote<ChangeResult>>
    removeBundle(name: string): Promise<Remote<ChangeResult>>
    inspect(spec: string): Promise<Remote<SpecInspection>>
    installBundle(
      spec: string,
      options: { requestId: string; saveExact?: boolean; registry?: string },
    ): Promise<Remote<ChangeResult>>
    cancelInstall(requestId: string): Promise<Remote<{ status: string }>>
  }
  'remote.pluginMarket': {
    listIndexes(): Promise<Remote<MarketIndexSummary[]>>
    search(url: string, query: MarketQuery): Promise<Remote<MarketSearch>>
    setIndexes(urls: string[]): Promise<Remote<unknown>>
  }
  remote: { $on(event: string, fn: (payload: never) => void): () => void }
  'remote.agentPresets': {
    list(): Promise<Remote<{ presets: PresetRow[] }>>
    read(id: string): Promise<Remote<{ name?: string; content: string }>>
  }
  'remote.settings': {
    update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<Remote<unknown>>
  }
  'remote.credentials': {
    describe(refs: readonly string[]): Promise<Remote<Readonly<Record<string, CredentialState>>>>
    set(ref: string, value: string): Promise<Remote<unknown>>
  }
}

/** Kết quả một lời gọi remote của dsh. */
type Remote<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const outcome = <T,>(res: Remote<T>): Outcome<T> =>
  res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error.message }

export const inject = ['slots', 'locale']

/** Trang đã dựng; trang chưa có ở đây thì chưa đăng ký. */
const PAGES: Partial<Record<RouteId, ComponentType<PageProps>>> = {
  settings: SettingsPage,
  memory: Memory,
  skills: Skills,
  skill: Skill,
  approvals: Approvals,
  runs: Runs,
  office: Office,
  learn: Learn,
  bot: BotProfile,
  owner: OwnerProfile,
  department: Department,
  routine: Routine,
  'routine-new': RoutineNew,
  brain: Brain,
}

/** Hộp thoại đã dựng. */
const DIALOGS: Partial<Record<RouteId, ComponentType<PageProps & { projects: ProjectActions }>>> = {
  'create-bot': CreateBot,
  'clone-bot': CloneBot,
  'mcp-add': McpDialog,
  'create-project': CreateProject,
  search: Search,
}

const EMPTY: Params = {}

/** Namespace cấu hình khi dịch vụ cấu hình của dsh chưa sẵn sàng. */
const UNAVAILABLE_FORM: ConfigFormLike = {
  getSnapshot: () => UNAVAILABLE_SNAPSHOT,
  subscribe: () => () => {},
  mutate: async () => false,
}
const UNAVAILABLE_SNAPSHOT = { status: 'unavailable' as const, value: undefined, writable: false }

type Selector<T> = <R>(select: (value: T) => R) => R
type RenderSlot = (
  name: string,
  props: Record<string, unknown>,
  options?: { only?: string; entryKey?: string },
) => ReactNode

function injectStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = '@aris/ui-pages'
  style.textContent = CSS + OFFICE_CSS + LEARN_CSS
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => mountKitCss(), 'aris-ui-pages: kit styles')
  ctx.effect(injectStyle, 'aris-ui-pages: styles')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'aris-ui-pages: en')
  // Chữ tiếng Việt có `{you}`: điền cách gọi người dùng theo hồ sơ xưng hô.
  ctx.effect(() => registerPersonal(ctx.locale, NS, 'vi', VI), 'aris-ui-pages: vi')

  const service = <K extends keyof Services>(name: K): Services[K] => {
    const found = ctx.get(name) as Services[K] | undefined
    if (!found) throw new Error(`${name} chưa sẵn sàng`)
    return found
  }

  const store = createNavStore()
  const nav: PageNav = {
    go(to, params) {
      // Bản đồ đội và Kanban cũ nay là Văn phòng.
      const target = resolveRoute(to, params)
      if (!PAGES[target.to] && !DIALOGS[target.to]) return
      const panel = navigate(store, target.to, target.params)
      if (panel) {
        service('layout').selectPanel(panel)
        announceRoute(target.to, { ...target.params })
      }
    },
    openPanel: (id) => service('layout').selectPanel(id),
    openSession(sessionId) {
      store.set({ ...store.getSnapshot(), dialog: null })
      service('uiWorkspace').openSession(sessionId)
    },
    close: () => store.set({ ...store.getSnapshot(), dialog: null }),
  }
  ctx.effect(
    () =>
      onArisNavigate(({ to, params }) => {
        if (isRoute(to)) nav.go(to, params)
      }),
    'aris-ui-pages: navigation',
  )

  // Dự án = workspace của dsh kèm hồ sơ của aris (`@aris/projects`): tạo xong mở phiên chính.
  const projects: ProjectActions = {
    pickDirectory: () => service('uiWorkspace').pickDirectory(),
    async createProject(input) {
      const res = await fetch(new URL('api/aris/projects', document.baseURI), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'create', project: input }),
      })
      const out = (await res.json().catch(() => ({}))) as { sessionId?: string; error?: string }
      if (!res.ok || !out.sessionId) throw new Error(out.error ?? `HTTP ${res.status}`)
      window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED))
      return out.sessionId
    },
  }

  // Hộp thoại đang mở vẽ trên lớp phủ của app.
  function DialogHost({ t, useNav }: { t: Translate; useNav: Selector<NavState> }) {
    const dialog = useNav((s) => s.dialog)
    // Theo dõi đội để vẽ lại khi đội tải xong hoặc đổi (hàm tra tên bot đọc bản đội đang có).
    useTeamData()
    const Dialog = dialog && DIALOGS[dialog.id]
    if (!dialog || !Dialog) return null
    return (
      <div className="aris">
        <Dialog t={t} nav={nav} params={dialog.params} projects={projects} plugins={plugins} />
      </div>
    )
  }
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'aris-dialogs', locale: NS, inject: () => ({ hooks: { nav: store } }) },
      DialogHost,
    ),
  )

  // ⌘K vẫn là bộ tìm phiên của dsh (`session.search`, có dữ liệu thật); hộp "Tìm trong
  // mọi phiên" của aris mở từ nút tìm trên thanh bên, nhận ⌘K khi nối dữ liệu ở giai đoạn 1.

  // Các mục cài đặt dsh đăng ký vào `settings.section`; nhãn có thể là hàm theo ngôn ngữ.
  let sections: SystemSection[] = []
  const sectionListeners = new Set<() => void>()
  const syncSections = () => {
    sections = ctx.slots
      .entriesOfSlot('settings.section')
      .map(({ options }) => ({
        id: options.id ?? '',
        order: options.order ?? 0,
        label: String((typeof options.label === 'function' ? options.label() : options.label) ?? options.id),
      }))
      .filter((s) => s.id)
      .sort((a, b) => a.order - b.order)
      .map(({ id, label }) => ({ id, label }))
    for (const fn of sectionListeners) fn()
  }
  const systemSections = {
    getSnapshot: () => sections,
    subscribe(fn: () => void) {
      sectionListeners.add(fn)
      return () => void sectionListeners.delete(fn)
    },
  }
  ctx.effect(() => ctx.slots.subscribe('settings.section', syncSections), 'aris-ui-pages: settings sections')
  ctx.effect(() => ctx.locale.subscribe(syncSections), 'aris-ui-pages: settings labels')
  syncSections()

  // Trang cấu hình riêng của plugin (Shell, Bot con, Tìm kiếm web…): aris tắt trang Plugins của
  // dsh (@aris/web-bundle) nên trang Cài đặt của aris khai báo các khe đó và vẽ trong trang Plugin.
  const CONFIG_SLOTS = ['plugins.item', 'plugins.bundle.config', 'plugins.row.config'] as const
  const keysOf = (name: string) =>
    new Set(ctx.slots.entriesOfSlot(name).flatMap(({ options }) => (options.key ? [options.key] : [])))
  let ledger: ConfigLedger = { items: [], bundles: new Set(), rows: new Set() }
  const ledgerListeners = new Set<() => void>()
  const syncLedger = () => {
    ledger = {
      items: ctx.slots
        .entriesOfSlot('plugins.item')
        .map(({ options }) => ({
          id: options.id ?? '',
          label: String(
            (typeof options.label === 'function' ? options.label() : options.label) ?? options.id,
          ),
        }))
        .filter((i) => i.id),
      bundles: keysOf('plugins.bundle.config'),
      rows: keysOf('plugins.row.config'),
    }
    for (const fn of ledgerListeners) fn()
  }
  const configLedger = {
    getSnapshot: () => ledger,
    subscribe(fn: () => void) {
      ledgerListeners.add(fn)
      return () => void ledgerListeners.delete(fn)
    },
  }
  for (const name of CONFIG_SLOTS)
    ctx.effect(() => ctx.slots.subscribe(name, syncLedger), `aris-ui-pages: ${name}`)
  ctx.effect(() => ctx.locale.subscribe(syncLedger), 'aris-ui-pages: plugin config labels')
  syncLedger()
  const pluginConfigOf = (renderSlot: RenderSlot): PluginConfig => ({
    ledger: configLedger,
    render: (target: ConfigTarget, view: ConfigView) =>
      target.kind === 'item'
        ? renderSlot('plugins.item', { view }, { only: target.id })
        : renderSlot(
            target.kind === 'bundle' ? 'plugins.bundle.config' : 'plugins.row.config',
            { view },
            {
              entryKey: target.key,
            },
          ),
  })
  // Gói khác (ví dụ Giọng nói) mở trang cấu hình của mình qua `pluginNavigation`.
  ctx.effect(
    () =>
      ctx.reflect.provide('pluginNavigation', {
        openBundle: (packageName: string) => nav.go('settings', { section: 'plugin', bundle: packageName }),
      }),
    'aris-ui-pages: pluginNavigation',
  )

  // Mẫu bot: danh sách và mẫu mặc định của dsh, vẽ bằng trang Mẫu bot của aris.
  const NO_TOOLS = { getSnapshot: () => true, subscribe: () => () => {} }
  const presets: PresetSource = {
    list: async () => {
      const r = await call(() => service('remote.agentPresets').list())
      return r.ok ? { ok: true, value: r.value.presets } : r
    },
    read: (id) => call(() => service('remote.agentPresets').read(id)),
    setDefault: (id) =>
      call(() => service('remote.settings').update('agent-preset-registry', { selectedDefault: id })),
    startCreator: () =>
      service('uiWorkspace').startSession(undefined, { clearPreviousDraft: false, agentPreset: 'cordis' }),
    get codingTools() {
      return (
        (ctx.get('configForms') as Services['configForms'] | undefined)?.developerTools?.enabled ?? NO_TOOLS
      )
    },
  }

  // Model: danh mục dsh đang phục vụ và cấu hình model theo việc (trang 6.2).
  const failed = (err: unknown): { ok: false; error: string } => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  })
  // Plugin: danh sách thật của bản cài, vẽ bằng trang Plugin của aris (6.7).
  const call = async <T,>(fn: () => Promise<Remote<T>>): Promise<Outcome<T>> => {
    try {
      return outcome(await fn())
    } catch (err) {
      return failed(err)
    }
  }
  const manager = () => service('remote.pluginManager')
  const marketService = () => ctx.get('remote.pluginMarket') as Services['remote.pluginMarket'] | undefined
  const plugins: PluginSource = {
    list: () => call(() => service('remote.pluginInventory').list()),
    plugins: () => call(() => manager().listPlugins()),
    bundles: () => call(() => manager().listBundles()),
    setBundle: (name, enabled) => call(() => manager().setBundleEnabled(name, enabled)),
    setPlugin: (id, enabled) => call(() => manager().setPluginEnabled(id, enabled)),
    remove: (name) => call(() => manager().removeBundle(name)),
    inspect: (spec) => call(() => manager().inspect(spec)),
    install: (spec, requestId, registry) =>
      call(() =>
        manager().installBundle(spec, { requestId, saveExact: true, ...(registry ? { registry } : {}) }),
      ),
    cancel: (requestId) => call(() => manager().cancelInstall(requestId)),
    on(event: 'log' | 'state' | 'changed', fn: (payload: never) => void) {
      const remote = ctx.get('remote') as Services['remote'] | undefined
      const name = {
        log: 'plugin-manager/install-log',
        state: 'plugin-manager/install-state',
        changed: 'plugin-manager/changed',
      }[event]
      return remote ? remote.$on(name, fn) : () => {}
    },
    get market() {
      const m = marketService()
      if (!m) return undefined
      return {
        indexes: () => call(() => m.listIndexes()),
        search: (url: string, query: MarketQuery) => call(() => m.search(url, query)),
        setIndexes: (urls: readonly string[]) => call(() => m.setIndexes([...urls])),
      }
    },
    async restart() {
      try {
        const res = await fetch(new URL('api/aris/restart', document.baseURI), {
          method: 'POST',
          credentials: 'same-origin',
        })
        const body = (await res.json().catch(() => ({}))) as { restarting?: boolean }
        return { ok: true, value: { restarting: !!body.restarting } }
      } catch (err) {
        return failed(err)
      }
    },
    resolveText: (text) => ctx.locale.resolveText(text),
  }
  const models: ModelSettings = {
    async catalog() {
      const res = await service('remote.session').modelCatalog()
      if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`)
      return res.value.groups.map((g) => ({
        id: g.id,
        name: g.name,
        models: g.models.map((m) => ({ id: m.id, name: m.name, reasoning: !!m.reasoning })),
      }))
    },
    form: (namespace) => {
      const forms = ctx.get('configForms') as Services['configForms'] | undefined
      return forms ? forms.get(namespace) : UNAVAILABLE_FORM
    },
    async providers() {
      try {
        const llm = service('remote.llm')
        const [registered, declared] = await Promise.all([
          llm.listProviders(),
          llm.listConfigurableProviders(),
        ])
        if (!registered.ok) return outcome(registered)
        if (!declared.ok) return outcome(declared)
        return {
          ok: true,
          value: joinProviders(
            registered.value,
            declared.value.map((d) => ({
              id: d.provider,
              name: d.displayName,
              ns: d.settingsNs,
              path: d.settingsPath,
              declared: d.declared,
              defaultBaseURL: d.defaultBaseURL,
              nativeEnv: d.nativeAuth?.env ?? [],
              error: d.error,
            })),
          ),
        }
      } catch (err) {
        return failed(err)
      }
    },
    async credentials(refs) {
      try {
        // dsh nhận tối đa 64 tên khoá mỗi lần hỏi.
        const all: Record<string, CredentialState> = {}
        for (let i = 0; i < refs.length; i += 64) {
          const res = await service('remote.credentials').describe(refs.slice(i, i + 64))
          if (!res.ok) return outcome(res)
          Object.assign(all, res.value)
        }
        return { ok: true, value: all }
      } catch (err) {
        return failed(err)
      }
    },
    async setCredential(ref, value) {
      try {
        const res = await service('remote.credentials').set(ref, value)
        return res.ok ? { ok: true, value: undefined } : outcome(res)
      } catch (err) {
        return failed(err)
      }
    },
    async discover(namespace, request) {
      try {
        return outcome(await service('remote.llm').discoverModels(namespace, request))
      } catch (err) {
        return failed(err)
      }
    },
    async probe(provider, model) {
      try {
        const res = await fetch(new URL('api/aris/providers/probe', document.baseURI), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider, model }),
        })
        const body = (await res.json()) as { ok?: boolean; ms?: number; error?: string }
        return res.ok
          ? { ok: !!body.ok, ms: body.ms ?? 0, error: body.error }
          : { ok: false, ms: 0, error: body.error ?? `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, ms: 0, error: String(err) }
      }
    },
  }

  for (const [id, Page] of Object.entries(PAGES) as [RouteId, ComponentType<PageProps>][]) {
    if (ROUTES[id].kind !== 'page') continue
    function Host({
      t,
      useNav,
      useSystemSections,
      renderSlot,
    }: {
      t: Translate
      useNav: Selector<NavState>
      useSystemSections?: Selector<readonly SystemSection[]>
      renderSlot?: RenderSlot
    }) {
      const params = useNav((s) => s.params[id] ?? EMPTY)
      useTeamData()
      const list = useSystemSections?.((s) => s)
      const pluginConfig = useMemo(
        () => (id === 'settings' && renderSlot ? pluginConfigOf(renderSlot) : undefined),
        [renderSlot],
      )
      const system: SystemSettings | undefined =
        list && renderSlot
          ? {
              sections: list,
              render: (only) =>
                renderSlot('settings.section', { close: () => nav.openPanel(null) }, { only }),
            }
          : undefined
      return (
        <div className="aris ap-root">
          <Page
            t={t}
            nav={nav}
            params={params}
            system={system}
            models={id === 'settings' ? models : undefined}
            plugins={id === 'settings' || id === 'bot' ? plugins : undefined}
            pluginConfig={pluginConfig}
            presets={id === 'settings' ? presets : undefined}
          />
        </div>
      )
    }
    const route = ROUTES[id] as { nav?: boolean; order?: number }
    if (route.nav)
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: panelId(id), order: route.order, label: VI[`nav.${id}`] ?? id },
          ({ size, active }: { size: number; active: boolean }) => (
            <NavIcon id={id} size={size} active={active} />
          ),
        ),
      )
    // Trang Cài đặt vẽ luôn các mục cài đặt của dsh: một chỗ cài đặt duy nhất.
    const settings =
      id === 'settings'
        ? {
            children: {
              'settings.section': { kind: 'list', scope: 'root' },
              'plugins.item': { kind: 'list', scope: 'root' },
              'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
              'plugins.row.config': { kind: 'keyed', scope: 'root' },
            },
            inject: () => ({ hooks: { nav: store, systemSections } }),
          }
        : { inject: () => ({ hooks: { nav: store } }) }
    ctx.slots.inject('main', () =>
      ctx.slots.register({ name: 'main', key: panelId(id), locale: NS, ...settings }, Host),
    )
  }
}
