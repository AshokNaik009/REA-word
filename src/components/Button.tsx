import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
}

export function IconButton({ icon: Icon, label, active, className = '', ...props }: IconButtonProps) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active} {...props}><Icon size={17} strokeWidth={1.7} /></button>
}

export function ToolGroup({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`tool-group ${className}`}><div className="tool-group-content">{children}</div><span className="tool-group-label">{label}</span></div>
}
