import React, { Suspense, lazy } from 'react';

// Lazy load the actual ThumbnailGenerator component to avoid SSR issues with vtk.js
const ThumbnailGeneratorImpl = lazy(() => import('./ThumbnailGenerator'));

interface ThumbnailGeneratorProps {
  file: File;
  onThumbnailGenerated: (thumbnail: string) => void;
  onError?: (error: string) => void;
  width?: number;
  height?: number;
  background?: 'white' | 'black' | 'transparent';
  view?: 'isometric' | 'front' | 'side' | 'top';
  wireframe?: boolean;
  smooth?: boolean;
  backgroundHex?: string;
  modelColorHex?: string;
}

const ThumbnailGenerator: React.FC<ThumbnailGeneratorProps> = (props) => {
  // Only render on client side
  if (typeof window === 'undefined') {
    return <div style={{ width: props.width || 400, height: props.height || 400 }} />;
  }

  return (
    <Suspense fallback={
      <div style={{
        width: props.width || 400,
        height: props.height || 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e5e5e5',
        borderRadius: '8px'
      }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <ThumbnailGeneratorImpl {...props} />
    </Suspense>
  );
};

export default ThumbnailGenerator;
