import { createFileRoute } from '@tanstack/react-router';
import BabylonViewer from '@/components/babylon';

export const Route = createFileRoute('/babylon-viewer')({
  component: BabylonViewerComponent,
  head: () => ({
    meta: [
      {
        title: 'Babylon.js 3D Viewer | VizCad',
        description:
          'Interactive 3D model viewer powered by Babylon.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
      },
      {
        name: 'keywords',
        content:
          '3D viewer, Babylon.js, GLB viewer, GLTF viewer, OBJ viewer, STL viewer, 3D model viewer, online 3D viewer, web 3D viewer',
      },
      {
        property: 'og:title',
        content: 'Babylon.js 3D Viewer | VizCad',
      },
      {
        property: 'og:description',
        content:
          'Interactive 3D model viewer powered by Babylon.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'Babylon.js 3D Viewer | VizCad',
      },
      {
        name: 'twitter:description',
        content:
          'Interactive 3D model viewer powered by Babylon.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
      },
    ],
  }),
});

function BabylonViewerComponent() {
  return <BabylonViewer />;
}
