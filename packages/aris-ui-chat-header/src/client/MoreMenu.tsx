/**
 * Nút "…" ở đầu phiên: thay menu của `dsh-session-log-export` (cùng `id`, `priority` thấp hơn che
 * mục của dsh). Chỉ còn "Mở hồ sơ" (bot của phiên) và "Tải nhật ký phiên"; bỏ "Góp ý". Tải nhật ký
 * vẫn qua bộ tải của dsh nên tệp ZIP như cũ; hộp "Đang xuất phiên" vẽ lại ở đây vì hộp của dsh nằm
 * trong menu bị che (cả lệnh `/export` cũng mở hộp này).
 */
import {
  Button,
  IconDownloadOutlineRegular,
  IconEllipsisOutlineRegular,
  IconUserOutlineRegular,
  Menu,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { arisNavigate, useSessionBot } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { Translate } from './locale.js'

type Selector<T> = <R>(select: (value: T) => R) => R

export interface LogDownloadEntry {
  open: boolean
  status: 'downloading' | 'success' | 'error'
  error: string | null
}
export interface LogDownloadState {
  bySession: Record<string, LogDownloadEntry | undefined>
}

export interface MoreMenuProps {
  sessionId: string
  t: Translate
  useLogDownload: Selector<LogDownloadState>
  download(sessionId: string): void
  dismiss(sessionId: string): void
}

export function MoreMenu({ sessionId, t, useLogDownload, download, dismiss }: MoreMenuProps) {
  const bot = useSessionBot(sessionId)
  const entry = useLogDownload((s) => s.bySession[String(sessionId)])
  const busy = entry?.status === 'downloading'
  const [open, setOpen] = useState(false)
  const status = entry?.status
  return (
    <>
      <Menu
        open={open}
        align="end"
        dense
        onClose={() => setOpen(false)}
        items={[
          { id: 'profile', label: t('more.profile'), icon: <IconUserOutlineRegular /> },
          { id: 'download', label: t('more.download'), icon: <IconDownloadOutlineRegular />, disabled: busy },
        ]}
        onSelect={(id) => {
          setOpen(false)
          if (id === 'profile') arisNavigate('bot', { id: bot?.id ?? 'aris' })
          else download(sessionId)
        }}
        anchor={
          <Button
            size="sm"
            className="aris-more"
            aria-label={t('more.label')}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-busy={busy}
            onClick={() => setOpen((v) => !v)}
          >
            <IconEllipsisOutlineRegular />
          </Button>
        }
      />
      <Modal
        open={entry?.open === true}
        onClose={() => dismiss(sessionId)}
        title={t(
          status === 'downloading'
            ? 'export.preparing'
            : status === 'success'
              ? 'export.started'
              : 'export.failed',
        )}
        description={
          status === 'downloading'
            ? t('export.preparingHint')
            : status === 'success'
              ? t('export.startedHint')
              : entry?.error || t('export.failedHint')
        }
        closeLabel={t('export.close')}
        footer={
          <Button variant="primary" onClick={() => dismiss(sessionId)}>
            {t('export.close')}
          </Button>
        }
      />
    </>
  )
}
