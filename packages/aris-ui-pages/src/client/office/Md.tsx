/** Chữ Markdown gọn cho cột phải của Văn phòng: dùng bộ hiển thị của bộ não, chỉ dựng phần tử React, không chèn HTML thô. */
import { Fragment, useMemo } from 'react'
import { Inline, Markdown, parseMarkdown, type LinkTarget } from '../brain/markdown.js'

/** Chat của Văn phòng không có trang bộ não để mở: liên kết `[[trang]]` hiện mờ. */
const NO_LINKS: LinkTarget = { exists: () => false, open: () => {} }

/** Cả đoạn Markdown (đoạn, danh sách, bảng, khối mã) cho tin của bot. */
export function MdFull({ text }: { text: string }) {
  const doc = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="ap-of-md">
      <Markdown doc={doc} links={NO_LINKS} />
    </div>
  )
}

/** Vài dòng chữ: in đậm, mã, liên kết, mỗi dòng xuống hàng đúng như bot viết (đoạn đầu kết quả trong dòng nhật ký). */
export function MdShort({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Inline text={l.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '• ')} links={NO_LINKS} />
        </Fragment>
      ))}
    </>
  )
}
