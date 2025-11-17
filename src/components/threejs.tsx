import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

interface ThreeJSViewerProps {
  className?: string;
}

export default function ThreeJSViewer({ className = '' }: ThreeJSViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const loadedModelsRef = useRef<THREE.Object3D[]>([]);

  const [status, setStatus] = useState<string>('');
  const [showWireframe, setShowWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [fileName, setFileName] = useState<string>('');

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 500;
    controls.rotateSpeed = 1.5;
    controls.panSpeed = 1.5;
    controls.zoomSpeed = 1.5;
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Add grid
    const grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    grid.position.y = 0;
    scene.add(grid);
    gridRef.current = grid;

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // Handle grid visibility
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Handle wireframe toggle
  useEffect(() => {
    loadedModelsRef.current.forEach((model) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              mat.wireframe = showWireframe;
            });
          } else {
            child.material.wireframe = showWireframe;
          }
        }
      });
    });
  }, [showWireframe]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !sceneRef.current) return;

    setStatus('Loading file...');
    setFileName(file.name);

    try {
      // Remove previous models
      loadedModelsRef.current.forEach((model) => {
        sceneRef.current?.remove(model);
      });
      loadedModelsRef.current = [];

      // Get file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      const url = URL.createObjectURL(file);

      let object: THREE.Object3D | null = null;

      switch (extension) {
        case 'glb':
        case 'gltf': {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(url);
          object = gltf.scene;
          break;
        }
        case 'obj': {
          const loader = new OBJLoader();
          object = await loader.loadAsync(url);
          break;
        }
        case 'stl': {
          const loader = new STLLoader();
          const geometry = await loader.loadAsync(url);
          const material = new THREE.MeshPhongMaterial({
            color: 0x808080,
            specular: 0x111111,
            shininess: 200,
          });
          object = new THREE.Mesh(geometry, material);
          break;
        }
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }

      if (object && sceneRef.current) {
        sceneRef.current.add(object);
        loadedModelsRef.current.push(object);

        // Center camera on object
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = cameraRef.current!.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add some padding

        if (cameraRef.current && controlsRef.current) {
          cameraRef.current.position.set(center.x, center.y, center.z + cameraZ);
          controlsRef.current.target.copy(center);
          controlsRef.current.update();
        }
      }

      URL.revokeObjectURL(url);
      setStatus(`Loaded: ${file.name}`);
    } catch (error) {
      console.error('Error loading file:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Failed to load file'}`);
    }
  };

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current && loadedModelsRef.current.length > 0) {
      const firstModel = loadedModelsRef.current[0];
      const box = new THREE.Box3().setFromObject(firstModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;

      cameraRef.current.position.set(center.x, center.y, center.z + cameraZ);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
      setStatus('Camera reset');
    } else if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(5, 5, 5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      setStatus('Camera reset');
    }
  };

  return (
    <div className={`flex flex-col h-screen ${className}`}>
      {/* Header with controls */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* File picker */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="file-upload-three"
              className="px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors"
            >
              Select File
            </label>
            <input
              id="file-upload-three"
              type="file"
              accept=".glb,.gltf,.obj,.stl"
              onChange={handleFileUpload}
              className="hidden"
            />
            {fileName && (
              <span className="text-sm text-gray-600 font-medium">{fileName}</span>
            )}
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleResetCamera}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            >
              Reset Camera
            </button>
            <button
              onClick={() => setShowWireframe(!showWireframe)}
              className={`px-4 py-2 rounded-md transition-colors ${
                showWireframe
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Wireframe
            </button>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-4 py-2 rounded-md transition-colors ${
                showGrid
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        {/* Status message */}
        {status && (
          <div className="mt-3 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded">
            {status}
          </div>
        )}
      </div>

      {/* Three.js container */}
      <div ref={containerRef} className="flex-1 relative" />
    </div>
  );
}
