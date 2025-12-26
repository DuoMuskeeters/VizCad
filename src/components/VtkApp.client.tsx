'use client'

import React, { Suspense, lazy } from 'react';

// Lazy load the actual VtkApp component to avoid SSR issues with vtk.js
const VtkAppImpl = lazy(() => import('./vtk').then(m => ({ default: m.VtkApp })));

interface DisplayState {
  wireframe: boolean
  grid: boolean
  axes: boolean
  smooth: boolean
}

interface VtkAppProps {
  file: File | null
  viewMode?: string
  displayState?: DisplayState
  viewLocked?: boolean
  perspective?: boolean
  onCameraReady?: (cameraControls: {
    resetCamera: () => void
    zoomIn: () => void
    zoomOut: () => void
    setView: (view: string) => void
    applyStudioScene: (sceneId: string) => void
    setBackground: (color: [number, number, number]) => void
    captureScreenshot: () => void
  }) => void
}

const VtkApp: React.FC<VtkAppProps> = (props) => {
  // Only render on client side
  if (typeof window === 'undefined') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <span className="text-gray-500">Loading 3D viewer...</span>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-sm text-gray-500">Loading 3D viewer...</span>
        </div>
      </div>
    }>
      <VtkAppImpl {...props} />
    </Suspense>
  );
};

export { VtkApp };
