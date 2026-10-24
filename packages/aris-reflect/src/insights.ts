/**
 * Hồ sơ chủ nhân theo bot (giai đoạn 3, đợt 2; màn 2.3): nhận định về người dùng có độ tin cậy và
 * bằng chứng. Chỉ vòng học nền cập nhật; độ tin cậy do aris tính từ số lần thấy, không do model đặt.
 * Thuần: lưu qua một bảng khoá–giá trị (bảng của storage domain dsh, hoặc Map khi kiểm thử).
 */
import { fold } from './signals.js'

export const AREAS = ['communication', 'work'] as const
export type Area = (typeof AREAS)[number]

export interface Evidence {
  sessionId?: string | undefined
  at: string
  quote?: string | undefined
}

export interface InsightOption {
  /** Nhãn ngắn trên nút. */
  label: string
  /** Nhận định đầy đủ khi người dùng chọn. */
  text: string
}

export interface Insight {
  id: string
  bot: string
  area: Area
  text: string
  confidence: number
  /** 10 lần thấy gần nhất. */
  evidence: Evidence[]
  /** Tổng số lần thấy. */
  hits: number
  /** Người dùng bấm Đúng hoặc sửa. */
  confirmed?: boolean | undefined
  /** Có bằng chứng ngược: hỏi người dùng. */
  question?: { text: string; options: InsightOption[]; at: string } | undefined
  status: 'active' | 'rejected'
  createdAt: string
  updatedAt: string
}

/** Một quan sát vòng học trả về. */
export interface Observation {
  text: string
  area: Area
  quote?: string | undefined
  /** Mã nhận định có sẵn cùng ý. */
  supports?: string | undefined
  /** Mã nhận định có sẵn ngược ý. */
  contradicts?: string | undefined
  question?: string | undefined
  options?: InsightOption[] | undefined
}

export interface InsightTable {
  get(key: string): Insight | undefined
  entries(): IterableIterator<[string, Insight]>
  put(key: string, value: Insight): Promise<void>
}

/** Nhận định từ mức này trở lên (hoặc đã xác nhận) được nạp vào prompt. */
export const PROMPT_THRESHOLD = 0.8
export const START_CONFIDENCE = 0.4
/** Mỗi lần thấy thêm: c + (1 − c) × STEP. */
export const STEP = 0.35
/** Khối nhận định trong prompt tối đa ngần này ký tự. */
export const PROMPT_CHARS = 1500
const KEEP_EVIDENCE = 10

export class InsightError extends Error {}

const round = (n: number) => Math.round(n * 1000) / 1000
export const reinforce = (c: number) => round(c + (1 - c) * STEP)

const words = (s: string) =>
  new Set(
    fold(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  )
/** Mức trùng ý giữa hai câu (Jaccard theo từ đã bỏ dấu). */
export function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / (x.size + y.size - common)
}

const newId = (now: number) => `i-${now.toString(36)}-${Math.floor(Math.random() * 36 ** 5).toString(36)}`

export class InsightStore {
  constructor(
    private readonly table: InsightTable,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Nhận định của bot (mặc định chỉ đang có), độ tin cậy cao trước. */
  list(bot: string, all = false): Insight[] {
    return [...this.table.entries()]
      .map(([, i]) => i)
      .filter((i) => i.bot === bot && (all || i.status === 'active'))
      .sort((a, b) => effective(b) - effective(a) || b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): Insight | undefined {
    return this.table.get(id)
  }

  /**
   * Ghi một quan sát của vòng học vào hồ sơ bot. Trả nhận định đã đổi, hoặc undefined khi bỏ qua
   * (trùng nhận định người dùng đã bác, câu rỗng).
   */
  async observe(bot: string, o: Observation, sessionId?: string): Promise<Insight | undefined> {
    const text = o.text.trim()
    if (!text) return undefined
    const at = this.now().toISOString()
    const ev: Evidence = { at, ...(sessionId ? { sessionId } : {}), ...(o.quote ? { quote: o.quote } : {}) }
    const mine = this.list(bot, true)
    const byId = (id?: string) => (id ? mine.find((i) => i.id === id && i.status === 'active') : undefined)
    const against = byId(o.contradicts)
    if (against) {
      const options = (o.options ?? []).filter((x) => x.label.trim() && x.text.trim()).slice(0, 4)
      return this.put({
        ...against,
        confidence: against.confirmed ? against.confidence : round(against.confidence * 0.5),
        // Đã xác nhận thì vẫn hỏi lại khi thấy ngược, nhưng không tự hạ.
        ...(o.question && options.length >= 2 ? { question: { text: o.question, options, at } } : {}),
        evidence: [...against.evidence, ev].slice(-KEEP_EVIDENCE),
        updatedAt: at,
      })
    }
    const same =
      byId(o.supports) ??
      mine
        .map((i) => ({ i, s: similarity(i.text, text) }))
        .filter((x) => x.s >= 0.6)
        .sort((a, b) => b.s - a.s)[0]?.i
    if (same?.status === 'rejected') return undefined
    if (same)
      return this.put({
        ...same,
        confidence: same.confirmed ? same.confidence : reinforce(same.confidence),
        hits: same.hits + 1,
        evidence: [...same.evidence, ev].slice(-KEEP_EVIDENCE),
        updatedAt: at,
      })
    return this.put({
      id: newId(this.now().getTime()),
      bot,
      area: o.area,
      text,
      confidence: START_CONFIDENCE,
      evidence: [ev],
      hits: 1,
      status: 'active',
      createdAt: at,
      updatedAt: at,
    })
  }

  /** Người dùng bấm Đúng. */
  confirm(id: string): Promise<Insight> {
    return this.change(id, () => ({ confirmed: true, confidence: 1, question: undefined }))
  }

  /** Người dùng sửa câu: coi như đã xác nhận. */
  async edit(id: string, text: string): Promise<Insight> {
    const t = text.trim()
    if (!t) throw new InsightError('Nhận định rỗng.')
    return this.change(id, () => ({ text: t, confirmed: true, confidence: 1, question: undefined }))
  }

  /** Người dùng bấm Sai: giữ lại để vòng học khỏi đưa lại. */
  reject(id: string): Promise<Insight> {
    return this.change(id, () => ({ status: 'rejected', question: undefined }))
  }

  /** Người dùng chọn một lựa chọn của câu hỏi "chưa chắc". */
  async answer(id: string, option: number): Promise<Insight> {
    const q = this.get(id)?.question
    const pick = q?.options[option]
    if (!pick) throw new InsightError('Lựa chọn không hợp lệ.')
    return this.change(id, () => ({ text: pick.text, confirmed: true, confidence: 1, question: undefined }))
  }

  /** Chép các nhận định đang có sang bot khác; trùng ý thì gộp. Trả số nhận định đã chép. */
  async copy(from: string, to: string): Promise<number> {
    if (from === to) throw new InsightError('Chọn một bot khác để chép sang.')
    let n = 0
    for (const i of this.list(from)) {
      const twin = this.list(to, true).find((x) => similarity(x.text, i.text) >= 0.6)
      if (twin?.status === 'rejected') continue
      const at = this.now().toISOString()
      if (twin)
        await this.put({
          ...twin,
          confidence: Math.max(twin.confidence, i.confidence),
          confirmed: twin.confirmed || i.confirmed,
          hits: twin.hits + i.hits,
          evidence: [...twin.evidence, ...i.evidence]
            .sort((a, b) => a.at.localeCompare(b.at))
            .slice(-KEEP_EVIDENCE),
          updatedAt: at,
        })
      else
        await this.put({
          ...i,
          id: newId(this.now().getTime() + n),
          bot: to,
          question: undefined,
          createdAt: at,
          updatedAt: at,
        })
      n++
    }
    return n
  }

  private async change(id: string, patch: (i: Insight) => Partial<Insight>): Promise<Insight> {
    const item = this.get(id)
    if (!item) throw new InsightError('Không thấy nhận định này.')
    const next = { ...item, ...patch(item), updatedAt: this.now().toISOString() }
    if (next.question === undefined) delete next.question
    return this.put(next)
  }

  private async put(i: Insight): Promise<Insight> {
    if (i.question === undefined) delete i.question
    await this.table.put(i.id, i)
    return i
  }
}

const effective = (i: Insight) => (i.confirmed ? 1 : i.confidence)

/** Nhận định đủ tin để nạp vào prompt. */
export const trusted = (i: Insight) => i.status === 'active' && effective(i) >= PROMPT_THRESHOLD

const AREA_TITLE: Record<Area, string> = { communication: 'Cách giao tiếp', work: 'Công việc và mục tiêu' }

/** Khối nhận định đưa vào prompt; rỗng khi chưa có gì đủ tin. */
export function renderInsights(items: readonly Insight[], maxChars = PROMPT_CHARS): string {
  const picked: Insight[] = []
  let used = 0
  for (const i of [...items].filter(trusted).sort((a, b) => effective(b) - effective(a))) {
    if (used + i.text.length > maxChars) continue
    picked.push(i)
    used += i.text.length
  }
  if (!picked.length) return ''
  const parts = [
    '<aris-owner-insights>',
    'Điều bạn đã quan sát được về người dùng qua nhiều lần làm việc (đủ tin cậy; làm theo trừ khi người dùng nói khác):',
  ]
  for (const area of AREAS) {
    const rows = picked.filter((i) => i.area === area)
    if (rows.length) parts.push('', `## ${AREA_TITLE[area]}`, ...rows.map((i) => `- ${i.text}`))
  }
  parts.push('</aris-owner-insights>')
  return parts.join('\n')
}
