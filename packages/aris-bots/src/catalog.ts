/**
 * Danh mục connector (GĐ8.5): các dịch vụ bot dùng được qua MCP, mỗi mục nói cách chạy, cách đăng nhập, có ghi được
 * không. Thông tin kiểm trên tài liệu chính hãng ngày 27/10/2026 (`status: 'verified'`); mục chưa kiểm được thì
 * `status: 'unverified'` và vẫn hiện trong danh mục để người dùng tự điền địa chỉ.
 *
 * Bốn mẫu cũ của `MCP_PRESETS` (GitHub, Lark, Notion chạy trên máy, Trình duyệt) là các mục `preset`: kết nối đã lưu
 * vẫn đọc như trước. Gói chạy bằng `npx` luôn ghim đúng phiên bản.
 */
/** Mức hỏi (trùng `MCP_ASK` của `mcp.ts`; viết lại ở đây để hai tệp không nhập vòng của nhau). */
const ASKS = ['write', 'always', 'never'] as const
type McpAsk = (typeof ASKS)[number]
/** Mẫu cũ của `mcp.ts`. */
type McpPreset = 'github' | 'lark' | 'notion' | 'browser' | 'custom'

export const CATALOG_CATEGORIES = [
  'work',
  'sales',
  'content',
  'ads',
  'analytics',
  'commerce',
  'automation',
  'internal',
  'other',
] as const
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]

/** Cách đăng nhập: OAuth (mở cửa sổ đăng nhập của hãng), khoá dán vào, hay không cần gì. */
export type CatalogAuth = 'oauth' | 'token' | 'none'

export interface CatalogEntry {
  id: string
  name: string
  category: CatalogCategory
  vendor: string
  /** Máy chủ do chính hãng làm. */
  official: boolean
  /** Đã kiểm trên tài liệu chính hãng chưa. */
  status: 'verified' | 'unverified'
  /** Một dòng mô tả trên thẻ. */
  blurb: string
  transport: 'stdio' | 'streamable-http'
  /** Địa chỉ máy chủ HTTP; không có thì người dùng tự điền (`urlHint` gợi ý). */
  url?: string
  urlHint?: string
  command?: string
  args?: string[]
  auth: CatalogAuth
  /**
   * Khoá người dùng nhập. Với OAuth: `CLIENT_ID`, `CLIENT_SECRET` của ứng dụng người dùng tự tạo ở hãng (hãng không
   * cho đăng ký client tự động); không có khoá nào là aris tự đăng ký client.
   */
  keys: string[]
  /** OAuth bắt buộc có client ID riêng (hãng không cho đăng ký tự động với địa chỉ gọi về trên máy). */
  needsClient?: boolean
  /** Khoá thành header (máy chủ HTTP dùng token). Không có thì khoá gửi đúng tên làm header. */
  header?: (secrets: Record<string, string>) => Record<string, string>
  /** Tài liệu chính hãng. */
  docs: string
  writes: boolean
  defaultAsk: McpAsk
  /** Một câu lưu ý. */
  notes?: string
  /** Mẫu cũ tương ứng (kết nối đã lưu theo mẫu này hiện thành mục này). */
  preset?: Exclude<McpPreset, 'custom'>
}

const bearer = (k: string) => (s: Record<string, string>) => ({ Authorization: `Bearer ${s[k] ?? ''}` })

export const CATALOG: readonly CatalogEntry[] = [
  // --- Đợt 1 (đã kiểm) ------------------------------------------------------------------------------------
  {
    id: 'notion',
    name: 'Notion',
    category: 'work',
    vendor: 'Notion',
    official: true,
    status: 'verified',
    blurb: 'Trang, cơ sở dữ liệu, ghi chú',
    transport: 'streamable-http',
    url: 'https://mcp.notion.com/mcp',
    auth: 'oauth',
    keys: [],
    docs: 'https://developers.notion.com/docs/get-started-with-mcp',
    writes: true,
    defaultAsk: 'write',
    notes: 'Chưa tải ảnh hay tệp lên được qua MCP.',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'sales',
    vendor: 'HubSpot',
    official: true,
    status: 'verified',
    blurb: 'Liên hệ, công ty, deal, hoạt động',
    transport: 'streamable-http',
    url: 'https://mcp.hubspot.com',
    auth: 'oauth',
    keys: ['CLIENT_ID', 'CLIENT_SECRET'],
    needsClient: true,
    docs: 'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server',
    writes: true,
    defaultAsk: 'write',
    notes: 'Tạo "MCP auth app" trong HubSpot để có Client ID và Secret, thêm địa chỉ gọi về của aris.',
  },
  {
    id: 'canva',
    name: 'Canva',
    category: 'content',
    vendor: 'Canva',
    official: true,
    status: 'verified',
    blurb: 'Tạo, tìm và sửa thiết kế',
    transport: 'streamable-http',
    url: 'https://mcp.canva.com/mcp',
    auth: 'oauth',
    keys: ['CLIENT_ID', 'CLIENT_SECRET'],
    needsClient: true,
    docs: 'https://www.canva.dev/docs/apps/mcp/access/',
    writes: true,
    defaultAsk: 'write',
    notes: 'Tạo ứng dụng ở Canva Developer Portal, bật Canva MCP, thêm địa chỉ gọi về của aris.',
  },
  {
    id: 'meta-ads',
    name: 'Meta Ads',
    category: 'ads',
    vendor: 'Meta',
    official: true,
    status: 'verified',
    blurb: 'Chiến dịch, nhóm quảng cáo, báo cáo',
    transport: 'streamable-http',
    url: 'https://mcp.facebook.com/ads',
    auth: 'oauth',
    keys: ['CLIENT_ID', 'CLIENT_SECRET'],
    needsClient: true,
    docs: 'https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview',
    writes: true,
    defaultAsk: 'write',
    notes:
      'Bản beta. Tự tạo ứng dụng Meta có "Ads MCP"; Meta từ chối đăng ký tự động. Ghi xong để chiến dịch tạm dừng.',
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    category: 'work',
    vendor: 'Google',
    official: true,
    status: 'unverified',
    blurb: 'Gmail, Lịch, Drive, Chat',
    transport: 'streamable-http',
    urlHint: 'Địa chỉ máy chủ MCP của Gmail, Drive hay Lịch trong hướng dẫn của Google',
    auth: 'oauth',
    keys: ['CLIENT_ID', 'CLIENT_SECRET'],
    needsClient: true,
    docs: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
    writes: true,
    defaultAsk: 'write',
    notes:
      'Mỗi sản phẩm một máy chủ; bật API và "MCP API" trong dự án Google Cloud, tạo OAuth client. Chưa kiểm được địa chỉ.',
  },
  // --- Mẫu cũ ---------------------------------------------------------------------------------------------
  {
    id: 'github',
    name: 'GitHub',
    category: 'work',
    vendor: 'GitHub',
    official: true,
    status: 'verified',
    blurb: 'Kho mã, issue, pull request',
    transport: 'streamable-http',
    url: 'https://api.githubcopilot.com/mcp/',
    auth: 'token',
    keys: ['token'],
    header: bearer('token'),
    docs: 'https://github.com/github/github-mcp-server',
    writes: true,
    defaultAsk: 'write',
    preset: 'github',
  },
  {
    id: 'lark',
    name: 'Lark',
    category: 'work',
    vendor: 'Lark',
    official: true,
    status: 'verified',
    blurb: 'Docs, Base, tin nhắn',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@larksuiteoapi/lark-mcp@0.5.1', 'mcp'],
    auth: 'token',
    keys: ['APP_ID', 'APP_SECRET'],
    docs: 'https://github.com/larksuite/lark-openapi-mcp',
    writes: true,
    defaultAsk: 'write',
    preset: 'lark',
  },
  {
    id: 'notion-local',
    name: 'Notion (trên máy)',
    category: 'work',
    vendor: 'Notion',
    official: true,
    status: 'verified',
    blurb: 'Chạy trên máy bằng token tích hợp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server@2.5.2'],
    auth: 'token',
    keys: ['NOTION_TOKEN'],
    docs: 'https://github.com/makenotion/notion-mcp-server',
    writes: true,
    defaultAsk: 'write',
    preset: 'notion',
  },
  {
    id: 'browser',
    name: 'Trình duyệt',
    category: 'other',
    vendor: 'Microsoft',
    official: true,
    status: 'verified',
    blurb: 'Mở trang, đọc, bấm, điền (Playwright)',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@0.0.83', '--headless', '--isolated'],
    auth: 'none',
    keys: [],
    docs: 'https://github.com/microsoft/playwright-mcp',
    writes: true,
    defaultAsk: 'write',
    preset: 'browser',
  },
  // --- Chưa kiểm (để đợt sau) -----------------------------------------------------------------------------
  {
    id: 'slack',
    name: 'Slack',
    category: 'work',
    vendor: 'Slack',
    official: true,
    status: 'unverified',
    blurb: 'Đọc và gửi tin trong kênh',
    transport: 'streamable-http',
    url: 'https://mcp.slack.com/mcp',
    auth: 'oauth',
    keys: ['CLIENT_ID', 'CLIENT_SECRET'],
    needsClient: true,
    docs: 'https://docs.slack.dev/ai/slack-mcp-server/',
    writes: true,
    defaultAsk: 'write',
    notes: 'Tự tạo Slack app (nội bộ); Slack không cho đăng ký client tự động.',
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    category: 'work',
    vendor: 'Atlassian',
    official: true,
    status: 'unverified',
    blurb: 'Jira, Confluence',
    transport: 'streamable-http',
    url: 'https://mcp.atlassian.com/v1/mcp',
    auth: 'oauth',
    keys: [],
    docs: 'https://developer.atlassian.com/cloud/rovo-mcp/guides/authentication-and-authorization/',
    writes: true,
    defaultAsk: 'write',
    notes: 'Tài liệu ghi hai địa chỉ khác nhau (/v1/mcp và /v1/mcp/authv2).',
  },
  {
    id: 'figma',
    name: 'Figma',
    category: 'content',
    vendor: 'Figma',
    official: true,
    status: 'unverified',
    blurb: 'Đọc thiết kế, design-to-code',
    transport: 'streamable-http',
    urlHint: 'Địa chỉ máy chủ MCP của Figma',
    auth: 'oauth',
    keys: [],
    docs: 'https://help.figma.com/hc/en-us/articles/32132100833559',
    writes: false,
    defaultAsk: 'write',
  },
  {
    id: 'highlevel',
    name: 'HighLevel',
    category: 'sales',
    vendor: 'HighLevel',
    official: false,
    status: 'unverified',
    blurb: 'CRM, hội thoại, lịch hẹn',
    transport: 'streamable-http',
    urlHint: 'Địa chỉ máy chủ MCP của HighLevel',
    auth: 'token',
    keys: ['TOKEN', 'LOCATION_ID'],
    header: (s) => ({ Authorization: `Bearer ${s.TOKEN ?? ''}`, locationId: s.LOCATION_ID ?? '' }),
    docs: 'https://marketplace.gohighlevel.com/docs/',
    writes: true,
    defaultAsk: 'write',
    notes: 'Chưa thấy tài liệu chính hãng; token dạng pit-… tạo ở Settings › Private Integrations.',
  },
  {
    id: 'heygen',
    name: 'HeyGen',
    category: 'content',
    vendor: 'HeyGen',
    official: true,
    status: 'unverified',
    blurb: 'Video có người dẫn',
    transport: 'streamable-http',
    url: 'https://mcp.heygen.com/mcp/v1/',
    auth: 'oauth',
    keys: [],
    docs: 'https://docs.heygen.com/',
    writes: true,
    defaultAsk: 'write',
    notes: 'Chưa kiểm được tài liệu.',
  },
  {
    id: 'rainmaker',
    name: 'Rainmaker',
    category: 'internal',
    vendor: 'Rainmaker',
    official: false,
    status: 'unverified',
    blurb: 'MCP nội bộ của công ty',
    transport: 'streamable-http',
    urlHint: 'Địa chỉ MCP nội bộ',
    auth: 'token',
    keys: ['TOKEN'],
    header: bearer('TOKEN'),
    docs: '',
    writes: true,
    defaultAsk: 'write',
  },
]

const IDS = new Set(CATALOG.map((e) => e.id))

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id)
}

/** Mục của một mẫu cũ. */
export function presetEntry(preset: McpPreset): CatalogEntry | undefined {
  return CATALOG.find((e) => e.preset === preset)
}

/** Bản gửi giao diện: bỏ hàm `header`. */
export function catalogView() {
  return CATALOG.map((e) => {
    const { header: _h, ...rest } = e
    void _h
    return rest
  })
}

/** Kiểm danh mục (dùng trong test): mọi mục đủ trường, ghim phiên bản `npx`, mức hỏi hợp lệ, mã không trùng. */
export function catalogProblems(list: readonly CatalogEntry[] = CATALOG): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of list) {
    if (seen.has(e.id)) out.push(`${e.id}: trùng mã`)
    seen.add(e.id)
    if (!/^[a-z0-9-]+$/.test(e.id)) out.push(`${e.id}: mã sai dạng`)
    if (!(CATALOG_CATEGORIES as readonly string[]).includes(e.category)) out.push(`${e.id}: nhóm lạ`)
    if (!(ASKS as readonly string[]).includes(e.defaultAsk)) out.push(`${e.id}: mức hỏi lạ`)
    if (e.transport === 'streamable-http' && !e.url && !e.urlHint) out.push(`${e.id}: thiếu địa chỉ`)
    if (e.url && !/^https:\/\//.test(e.url)) out.push(`${e.id}: địa chỉ phải là https`)
    if (e.transport === 'stdio' && !e.command) out.push(`${e.id}: thiếu lệnh`)
    if (e.needsClient && !(e.keys.includes('CLIENT_ID') && e.auth === 'oauth'))
      out.push(`${e.id}: thiếu CLIENT_ID`)
    if (e.status === 'verified' && !e.docs) out.push(`${e.id}: thiếu tài liệu`)
  }
  return out
}

/** Gói chạy bằng `npx` (tham số đầu không phải cờ) chưa ghim phiên bản (`@scope/tên@1.2.3` hay `tên@1.2.3`). */
export function unpinned(e: CatalogEntry): string[] {
  if (e.command !== 'npx') return []
  const pkg = (e.args ?? []).find((a) => !a.startsWith('-'))
  return pkg && !/^(@[^/]+\/)?[^@]+@\d/.test(pkg) ? [pkg] : []
}

export const isCatalogId = (id: string) => IDS.has(id)
