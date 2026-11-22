import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { pages } from './data'
import { href } from './router'

export function ConsentField({ checked, onChange, error }) {
  const id = useId()
  return (
    <div className="space-y-1 text-xs leading-snug text-txt-2">
      <div className="flex items-start gap-2.5">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="mt-0.5 shrink-0 data-[state=checked]:border-ink data-[state=checked]:bg-ink" />
        <div className="min-w-0">
          <label htmlFor={id} className="cursor-pointer">Даю согласие на обработку персональных данных</label>{' · '}
          <a href={href(pages.consent.path)} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink" aria-label="Текст согласия (откроется в новой вкладке)">Текст согласия</a>
        </div>
      </div>
      <div className="pl-7"><a href={href(pages.privacy.path)} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Политика конфиденциальности</a></div>
      {error && <div id={`${id}-error`} role="alert" className="pl-7 font-semibold text-destructive">{error}</div>}
    </div>
  )
}
