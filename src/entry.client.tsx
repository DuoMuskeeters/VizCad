import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import './styles.css'
import reportWebVitals from './reportWebVitals.ts'
import "./i18n"

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    isSSR: false,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Detect if page was server-side rendered
function isSSRPage(): boolean {
  return (
    window.__VIZCAD_SSR__ === true || 
    (document.getElementById('app')?.hasAttribute('data-ssr') ?? false)
  )
}

// Detect if current route should be SPA
function isSPARoute(pathname: string): boolean {
  const spaRoutes = [
    '/app',        // 3D viewer - interactive
    '/ModelSnap',  // Model viewer - interactive  
    '/viewEmbed',  // Embedded viewer - interactive
  ]
  
  // Check if route starts with any SPA prefix
  return spaRoutes.some(route => pathname.startsWith(route))
}

// Main application initialization
function initializeApp() {
  const rootElement = document.getElementById('app')
  if (!rootElement) {
    console.error('Root element not found')
    return
  }

  const currentPath = window.location.pathname
  const shouldHydrate = isSSRPage() && !isSPARoute(currentPath)

  if (shouldHydrate) {
    // Hydrate SSR content
    console.log('Hydrating SSR content for:', currentPath)
    
    ReactDOM.hydrateRoot(
      rootElement,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )
  } else {
    // Normal SPA initialization
    console.log('Initializing SPA for:', currentPath)
    
    // Clear any existing content for clean SPA mount
    if (rootElement.innerHTML) {
      rootElement.innerHTML = ''
    }
    
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  // DOM is already ready
  initializeApp()
}

// Handle client-side navigation
router.subscribe('onBeforeLoad', (event) => {
  const pathname = event.toLocation.pathname
  
  // Update SSR flag based on route type
  if (isSPARoute(pathname)) {
    // Ensure we're in SPA mode for interactive routes
    delete window.__VIZCAD_SSR__
    document.getElementById('app')?.removeAttribute('data-ssr')
  }
})

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()

// Global type declarations for SSR detection
declare global {
  interface Window {
    __VIZCAD_SSR__?: boolean
  }
}

export { router }