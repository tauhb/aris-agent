/**
 * Kho khoá của aris trong Keychain của macOS (giai đoạn 7, đợt 7a; bản vẽ 6.4): thay kho khoá dạng tệp của dsh
 * (`@deepseek-ai/dsh-credentials-local`) mà vẫn giữ nó làm lớp dưới. Khoá API đọc Keychain trước, rồi tệp, môi
 * trường, `.env` như cũ; khoá mới lưu vào Keychain; "Chuyển cả vào Keychain" chép từng khoá trong tệp sang, đọc lại
 * khớp rồi mới xoá khỏi tệp. Bản ghi (đăng nhập tài khoản) vẫn ở tệp. Tên khoá ở Keychain lưu trong
 * `aris-keychain.json` cạnh tệp khoá (chỉ tên, không giá trị).
 * @module @aris/keychain
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialInfo, CredentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider, {
  parseCredentialsDocument,
  resolveSpec,
} from '@deepseek-ai/dsh-credentials-local'
import type { Config } from '@deepseek-ai/dsh-credentials-local'
import { Keychain, isRefName } from './keychain.js'

export { Keychain, SERVICE, isRefName, securityRunner, type KeychainRunner } from './keychain.js'

export interface KeyListing {
  name: string
  where: 'keychain' | 'file'
}

export class KeychainCredentialProvider extends LocalCredentialProvider {
  readonly keychain = new Keychain()
  private readonly file: string
  private readonly index: string
  private names: Set<string> | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.file = resolveSpec(config).filename
    this.index = join(dirname(this.file), 'aris-keychain.json')
  }

  private async keychainNames(): Promise<Set<string>> {
    if (this.names) return this.names
    try {
      const v = JSON.parse(await readFile(this.index, 'utf8')) as { refs?: unknown }
      this.names = new Set(
        Array.isArray(v.refs) ? v.refs.filter((x): x is string => typeof x === 'string') : [],
      )
    } catch {
      this.names = new Set()
    }
    return this.names
  }
  private async saveNames() {
    await writeFile(this.index, `${JSON.stringify({ refs: [...(this.names ?? [])].sort() }, null, 2)}\n`, {
      mode: 0o600,
    })
  }

  override async resolve(ref: CredentialRef) {
    if ((await this.keychainNames()).has(ref)) {
      const value = await this.keychain.get(ref)
      if (value !== undefined) return { value, source: 'keychain' }
    }
    return super.resolve(ref)
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    if ((await this.keychainNames()).has(ref) && (await this.keychain.get(ref)) !== undefined)
      return { configured: true, source: 'keychain', writable: true }
    return super.describe(ref)
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (!isRefName(ref)) return super.set(ref, value)
    await this.keychain.set(ref, value)
    const names = await this.keychainNames()
    names.add(ref)
    await this.saveNames()
    // Bản cũ trong tệp (nếu có) bỏ đi; xoá tệp cũng báo thay đổi cho nơi dùng khoá.
    if ((await super.describe(ref)).source === 'file') await super.unset(ref)
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    const names = await this.keychainNames()
    if (names.has(ref)) {
      await this.keychain.delete(ref)
      names.delete(ref)
      await this.saveNames()
    }
    await super.unset(ref)
    this.notifyUpdated(ref)
  }

  /** Tên các khoá API và nơi đang giữ (không có giá trị). */
  async listKeys(): Promise<KeyListing[]> {
    const out = new Map<string, KeyListing['where']>()
    for (const n of await this.keychainNames()) out.set(n, 'keychain')
    for (const n of await this.fileRefs()) if (!out.has(n)) out.set(n, 'file')
    return [...out].map(([name, where]) => ({ name, where })).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Chuyển mọi khoá trong tệp sang Keychain; trả số khoá đã chuyển. */
  async moveAllToKeychain(): Promise<number> {
    let n = 0
    for (const name of await this.fileRefs()) {
      if (!isRefName(name)) continue
      const ref = name as CredentialRef
      const cur = await super.resolve(ref)
      if (!cur || cur.source !== 'file') continue
      await this.set(ref, cur.value)
      n++
    }
    return n
  }

  private async fileRefs(): Promise<string[]> {
    if (!existsSync(this.file)) return []
    try {
      return [...parseCredentialsDocument(await readFile(this.file, 'utf8'), this.file).refs.keys()]
    } catch {
      return []
    }
  }
}

export default KeychainCredentialProvider
