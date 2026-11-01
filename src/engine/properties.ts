import { z } from 'zod'

const points = z.number().finite().min(0).max(1584).nullish()
const indent = z.number().finite().min(-1584).max(1584).nullish()

export const paragraphProperties = z.object({
  spaceBefore: points,
  spaceAfter: points,
  indentLeft: indent,
  indentRight: indent,
  firstLineIndent: indent,
  lineSpacing: z.number().finite().min(0.5).max(1584).nullish(),
  lineRule: z.enum(['multiple', 'exactly', 'atLeast']).nullish(),
  direction: z.enum(['ltr', 'rtl']).nullish(),
  keepNext: z.boolean().nullish(),
  keepLines: z.boolean().nullish(),
  pageBreakBefore: z.boolean().nullish(),
  widowControl: z.boolean().nullish(),
}).passthrough().superRefine((attrs, ctx) => {
  if ((!attrs.lineRule || attrs.lineRule === 'multiple') && attrs.lineSpacing != null && attrs.lineSpacing > 10) {
    ctx.addIssue({ code: 'custom', path: ['lineSpacing'], message: 'Multiple line spacing must be between 0.5 and 10.' })
  }
})

export type ParagraphProperties = z.infer<typeof paragraphProperties>
