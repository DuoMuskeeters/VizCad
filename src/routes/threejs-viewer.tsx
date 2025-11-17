import { createFileRoute } from '@tanstack/react-router';
import ThreeJSViewer from '@/components/threejs';

export const Route = createFileRoute('/threejs-viewer')({
  component: ThreeJSViewerComponent,
  head: () => ({
    meta: [
      {
        title: 'Three.js 3D Viewer | VizCad',
        description:
          'Interactive 3D model viewer powered by Three.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
      },
      {
        name: 'keywords',
        content:
          '3D viewer, Three.js, GLB viewer, GLTF viewer, OBJ viewer, STL viewer, 3D model viewer, online 3D viewer, web 3D viewer',
      },
      {
        property: 'og:title',
        content: 'Three.js 3D Viewer | VizCad',
      },
      {
        property: 'og:description',
        content:
          'Interactive 3D model viewer powered by Three.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
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
        content: 'Three.js 3D Viewer | VizCad',
      },
      {
        name: 'twitter:description',
        content:
          'Interactive 3D model viewer powered by Three.js. View GLB, GLTF, OBJ, STL, and other 3D formats directly in your browser.',
      },
    ],
  }),
});

function ThreeJSViewerComponent() {
  return <ThreeJSViewer />;
}
