import { useEffect, useRef } from 'react'
import { useMenuStore, type MenuRequest } from '@renderer/store/menuStore'

/**
 * Run `handler` when the menu requests `command`, including a request made
 * before this component mounted. The handler is read at run time, so it sees
 * the component's current state. Call it above any early `return` in the
 * component (rules of hooks).
 */
export function useMenuRequest(command: MenuRequest, handler: () => void): void {
  const pending = useMenuStore((s) => s.pending[command])
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (pending === undefined) return
    if (useMenuStore.getState().take(command)) ref.current()
  }, [pending, command])
}
