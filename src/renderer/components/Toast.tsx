import { useEffect } from 'react'

interface Props {
  message: string
  onDismiss: () => void
  /** Auto-dismiss after this many ms. 0 keeps it until dismissed. */
  timeout?: number
  error?: boolean
}

/** A transient message at the bottom of the window. */
export function Toast({ message, onDismiss, timeout = 4000, error }: Props) {
  useEffect(() => {
    if (!timeout) return
    const timer = setTimeout(onDismiss, timeout)
    return () => clearTimeout(timer)
  }, [message, onDismiss, timeout])

  return (
    <div
      className={`toast ${error ? 'toast--error' : ''}`}
      onClick={onDismiss}
      role="status"
    >
      {message}
    </div>
  )
}
