import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Open sheets, innermost last: Escape and the focus trap only act on the top one.
const stack = []

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Every bottom sheet goes through here, so each one has a visible way out (an
 * X, Escape, the backdrop), is announced as a modal dialog, and keeps keyboard
 * focus inside itself until it closes — then hands focus back. */
export function Sheet({ onClose, label, className = '', children }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const me = {}
    stack.push(me)
    const opener = document.activeElement
    ref.current?.focus({ preventScroll: true })

    const onKey = e => {
      if (stack[stack.length - 1] !== me) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={ref} className={`sheet ${className}`.trim()}
        role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

/* A small in-app confirm, replacing window.confirm(): states what will happen
 * and offers the one action, styled for the stakes. */
export function ConfirmSheet({ title, body, confirmLabel, danger = false, onConfirm, onClose }) {
  return (
    <Sheet onClose={onClose} label={title}>
      <h2>{title}</h2>
      <div className="muted confirm-body">{body}</div>
      <div className="stack-actions">
        <button className={`btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel}
        </button>
        <button className="btn btn-secondary btn-block" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}
