import { useState } from 'react'
import type { EditorSession } from '../engine/session'
import { currentParagraph } from '../engine/commands'
import type { ParagraphProperties } from '../engine/properties'
import { Modal } from './Modal'

export function ParagraphDialog({ session, onApply, onClose }: { session: EditorSession; onApply: (properties: Partial<ParagraphProperties>) => boolean; onClose: () => void }) {
  const [values, setValues] = useState(() => {
    const attrs = currentParagraph(session.editor)
    return {
      spaceBefore: attrs.spaceBefore ?? 0, spaceAfter: attrs.spaceAfter ?? 12,
      indentLeft: attrs.indentLeft ?? 0, indentRight: attrs.indentRight ?? 0, firstLineIndent: attrs.firstLineIndent ?? 0,
      lineSpacing: attrs.lineSpacing ?? 1.5, lineRule: attrs.lineRule ?? 'multiple',
      direction: attrs.direction ?? 'ltr',
      keepNext: attrs.keepNext ?? false, keepLines: attrs.keepLines ?? false,
      pageBreakBefore: attrs.pageBreakBefore ?? false, widowControl: attrs.widowControl ?? true,
    }
  })
  const numberField = (key: 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent', label: string) => <label>{label}<input type="number" aria-label={label} min={key.startsWith('indent') || key === 'firstLineIndent' ? -1584 : 0} max={1584} step={0.5} required value={values[key]} onChange={event => setValues({ ...values, [key]: Number(event.target.value) })} /><small>points</small></label>
  return <Modal title="Paragraph settings" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (onApply(values)) onClose() }}>
      <p className="modal-description">Applies to selected paragraphs. Saved in Wordcraft, HTML and DOCX; print pagination remains browser-managed.</p>
      <div className="paragraph-fields">
        {numberField('indentLeft', 'Left indent')}{numberField('indentRight', 'Right indent')}{numberField('firstLineIndent', 'First line indent')}
        {numberField('spaceBefore', 'Space before')}{numberField('spaceAfter', 'Space after')}
        <label>Text direction<select aria-label="Paragraph direction" value={values.direction} onChange={event => setValues({ ...values, direction: event.target.value as 'ltr' | 'rtl' })}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
        <label>Line spacing<select aria-label="Line spacing rule" value={values.lineRule} onChange={event => setValues({ ...values, lineRule: event.target.value as typeof values.lineRule, lineSpacing: event.target.value === 'multiple' ? 1.5 : 18 })}><option value="multiple">Multiple</option><option value="exactly">Exactly (pt)</option><option value="atLeast">At least (pt)</option></select></label>
        <label>Spacing value<input aria-label="Line spacing value" type="number" min={0.5} max={values.lineRule === 'multiple' ? 10 : 1584} step={0.5} required value={values.lineSpacing} onChange={event => setValues({ ...values, lineSpacing: Number(event.target.value) })} /></label>
      </div>
      <div className="paragraph-checks">{([
        ['keepNext', 'Keep with next'], ['keepLines', 'Keep lines together'], ['pageBreakBefore', 'Page break before'], ['widowControl', 'Widow/orphan control'],
      ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={values[key]} onChange={event => setValues({ ...values, [key]: event.target.checked })} />{label}</label>)}</div>
      <p className="export-caution">Keep and widow/orphan rules affect print and DOCX. The canvas is not yet a deterministic paginated layout engine; “at least” spacing is approximated on screen.</p>
      <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Apply paragraph settings</button></div>
    </form>
  </Modal>
}
