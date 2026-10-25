/**
 * Trích chữ từ tệp trên máy (giai đoạn 5, đợt 2b), chỉ dùng công cụ có sẵn của macOS:
 * - PDF: PDFKit; PDF scan (không có lớp chữ) thì dựng ảnh từng trang rồi nhận dạng chữ bằng Vision.
 * - Ảnh: Vision, nhận dạng tiếng Việt và tiếng Anh.
 * - Word, RTF, ODT, HTML: `textutil`.
 * PDF và ảnh đi qua một công cụ Swift nhỏ, biên dịch một lần bằng `swiftc` rồi để sẵn trong `~/.aris/brain/bin`.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'

export const PDF_EXT = new Set(['.pdf'])
export const DOC_EXT = new Set(['.doc', '.docx', '.rtf', '.odt', '.html', '.htm', '.webarchive'])
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.heic', '.gif', '.webp', '.tif', '.tiff', '.bmp'])
export const AUDIO_EXT = new Set(['.m4a', '.mp3', '.wav', '.ogg', '.oga', '.opus', '.aac', '.flac', '.webm'])

export type FileKind = 'pdf' | 'doc' | 'anh' | 'ghi-am' | 'chu' | 'khac'

/** Loại tệp theo đuôi. */
export function fileKind(path: string): FileKind {
  const e = extname(path).toLowerCase()
  if (e === '.md' || e === '.markdown' || e === '.txt') return 'chu'
  if (PDF_EXT.has(e)) return 'pdf'
  if (DOC_EXT.has(e)) return 'doc'
  if (IMAGE_EXT.has(e)) return 'anh'
  if (AUDIO_EXT.has(e)) return 'ghi-am'
  return 'khac'
}

/** Nhận dạng chữ trong ảnh (Vision) và đọc PDF (PDFKit). */
const SWIFT = `import Foundation
import PDFKit
import Vision
import AppKit

// Vẽ lên nền trắng (ảnh nền trong suốt làm chữ đen lẫn vào nền), ảnh nhỏ thì phóng to gấp đôi.
func flatten(_ src: CGImage) -> CGImage {
  let k = max(src.width, src.height) < 1600 ? 2 : 1
  let w = src.width * k, h = src.height * k
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return src }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.interpolationQuality = .high
  ctx.draw(src, in: CGRect(x: 0, y: 0, width: w, height: h))
  return ctx.makeImage() ?? src
}

func ocr(_ raw: CGImage) -> String {
  let cg = flatten(raw)
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["vi-VT", "en-US"]
  req.usesLanguageCorrection = true
  let h = VNImageRequestHandler(cgImage: cg, options: [:])
  try? h.perform([req])
  return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\\n")
}

let args = CommandLine.arguments
guard args.count >= 3 else { exit(2) }
let url = URL(fileURLWithPath: args[2])
if args[1] == "pdf" {
  guard let doc = PDFDocument(url: url) else {
    FileHandle.standardError.write("không mở được PDF\\n".data(using: .utf8)!)
    exit(1)
  }
  var out = doc.string ?? ""
  if out.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 {
    var parts: [String] = []
    for i in 0..<min(doc.pageCount, 30) {
      guard let page = doc.page(at: i) else { continue }
      let box = page.bounds(for: .mediaBox)
      let img = page.thumbnail(of: NSSize(width: box.width * 2, height: box.height * 2), for: .mediaBox)
      if let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) { parts.append(ocr(cg)) }
    }
    out = parts.joined(separator: "\\n\\n")
  }
  print(out)
} else {
  guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("không mở được ảnh\\n".data(using: .utf8)!)
    exit(1)
  }
  print(ocr(cg))
}
`

const run = (cmd: string, args: readonly string[], timeout: number) =>
  new Promise<string>((ok, fail) =>
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024, timeout }, (err, stdout, stderr) =>
      err ? fail(new Error((stderr || err.message).trim().split('\n')[0])) : ok(stdout),
    ),
  )

let built: Promise<string> | undefined

/** Công cụ Swift đã biên dịch (biên dịch lần đầu, theo mã băm của mã nguồn). */
function tool(): Promise<string> {
  built ??= (async () => {
    const dir = join(homedir(), '.aris', 'brain', 'bin')
    const hash = createHash('sha1').update(SWIFT).digest('hex').slice(0, 10)
    const bin = join(dir, `aris-extract-${hash}`)
    if (existsSync(bin)) return bin
    await mkdir(dir, { recursive: true })
    const src = join(dir, `aris-extract-${hash}.swift`)
    await writeFile(src, SWIFT)
    await run('/usr/bin/swiftc', ['-O', src, '-o', bin], 180_000)
    return bin
  })().catch((e: unknown) => {
    built = undefined
    throw e
  })
  return built
}

/** Chữ trong một tệp PDF, ảnh hay văn bản Word. Ghi âm không đi qua đây (cần dịch vụ chép lời). */
export async function extractNative(abs: string): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('đọc tệp này hiện chỉ chạy trên macOS')
  const kind = fileKind(abs)
  if (kind === 'doc')
    return (await run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', abs], 60_000))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  if (kind === 'pdf' || kind === 'anh')
    return (await run(await tool(), [kind === 'pdf' ? 'pdf' : 'ocr', abs], 300_000)).trim()
  throw new Error('chưa đọc được loại tệp này')
}
