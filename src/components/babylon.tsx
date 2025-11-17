import { useEffect, useRef, useState } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid';
import { SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/OBJ';
import '@babylonjs/loaders/STL';
import '@babylonjs/loaders/glTF';

interface BabylonViewerProps {
  className?: string;
}

export default function BabylonViewer({ className = '' }: BabylonViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const gridRef = useRef<ReturnType<typeof MeshBuilder.CreateGround> | null>(null);

  const [status, setStatus] = useState<string>('');
  const [showWireframe, setShowWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [fileName, setFileName] = useState<string>('');

  // Initialize Babylon.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    // Create engine
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    // Create scene
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.95, 0.95, 0.95, 1);
    sceneRef.current = scene;

    // Create camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      10,
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.wheelPrecision = 5;
    camera.minZ = 0.1;
    cameraRef.current = camera;

    // Create light
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // Create grid
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: 20, height: 20 },
      scene
    );
    const gridMaterial = new GridMaterial('gridMaterial', scene);
    gridMaterial.gridRatio = 1;
    gridMaterial.majorUnitFrequency = 5;
    gridMaterial.minorUnitVisibility = 0.45;
    gridMaterial.opacity = 0.8;
    gridMaterial.mainColor = new Color3(0.8, 0.8, 0.8);
    gridMaterial.lineColor = new Color3(0.6, 0.6, 0.6);
    ground.material = gridMaterial;
    ground.position.y = -0.01;
    gridRef.current = ground;

    // Render loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    // Handle window resize
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      scene.dispose();
      engine.dispose();
    };
  }, []);

  // Handle grid visibility
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.setEnabled(showGrid);
    }
  }, [showGrid]);

  // Handle wireframe toggle
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.meshes.forEach((mesh) => {
        if (mesh !== gridRef.current && mesh.material) {
          mesh.material.wireframe = showWireframe;
        }
      });
    }
  }, [showWireframe]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !sceneRef.current) return;

    setStatus('Loading file...');
    setFileName(file.name);

    try {
      // Remove previous meshes (except grid)
      sceneRef.current.meshes.forEach((mesh) => {
        if (mesh !== gridRef.current) {
          mesh.dispose();
        }
      });

      // Get file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      const objectURL = URL.createObjectURL(file);

      // Load file based on extension
      let pluginExtension = '';
      switch (extension) {
        case 'glb':
        case 'gltf':
          pluginExtension = '.glb';
          break;
        case 'obj':
          pluginExtension = '.obj';
          break;
        case 'stl':
          pluginExtension = '.stl';
          break;
        case 'babylon':
          pluginExtension = '.babylon';
          break;
        default:
          throw new Error(`Unsupported file format: ${extension}`);
      }

      // Load the model
      await SceneLoader.ImportMeshAsync(
        '',
        '',
        objectURL,
        sceneRef.current,
        undefined,
        pluginExtension
      );

      // Center camera on loaded mesh
      if (cameraRef.current && sceneRef.current) {
        sceneRef.current.createDefaultCamera(true, true, true);
        const newCamera = sceneRef.current.activeCamera as ArcRotateCamera;
        if (newCamera) {
          newCamera.attachControl(canvasRef.current, true);
          newCamera.wheelPrecision = 50;
          cameraRef.current = newCamera;
        }
      }

      URL.revokeObjectURL(objectURL);
      setStatus(`Loaded: ${file.name}`);
    } catch (error) {
      console.error('Error loading file:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Failed to load file'}`);
    }
  };

  const handleResetCamera = () => {
    if (cameraRef.current && sceneRef.current) {
      sceneRef.current.createDefaultCamera(true, true, true);
      const newCamera = sceneRef.current.activeCamera as ArcRotateCamera;
      if (newCamera) {
        newCamera.attachControl(canvasRef.current, true);
        newCamera.wheelPrecision = 50;
        cameraRef.current = newCamera;
      }
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
              htmlFor="file-upload"
              className="px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors"
            >
              Select File
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".glb,.gltf,.obj,.stl,.babylon"
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

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full outline-none"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
}
