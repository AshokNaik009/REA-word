import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => { element?.close(); previouslyFocused?.focus() }
  }, [])
  return <dialog ref={dialog} className="modal" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-heading"><h2>{title}</h2><IconButton icon={X} label="Close dialog" onClick={onClose} /></div>
    {children}
  </dialog>
}
