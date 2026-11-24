import type { ReactNode } from 'react'
import { ToastProvider } from './Toast'

/** Mount once at the app root: toasts. (Tooltips and menus need no provider.) */
export const UiProvider = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
