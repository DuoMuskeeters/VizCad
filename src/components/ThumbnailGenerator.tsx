import React, { useRef, useEffect, useState } from 'react';
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPLYReader from '@kitware/vtk.js/IO/Geometry/PLYReader';
import vtkOBJReader from '@kitware/vtk.js/IO/Misc/OBJReader';
import "@kitware/vtk.js/Rendering/Profiles/Geometry";

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
  backgroundHex?: string; // overrides background when provided, hex like #ffffff
  modelColorHex?: string; // actor color hex
}

const ThumbnailGenerator: React.FC<ThumbnailGeneratorProps> = ({
  file,
  onThumbnailGenerated,
  onError,
  width = 400,
  height = 400,
  background = 'white',
  view = 'isometric',
  wireframe = false,
  smooth = true,
  backgroundHex,
  modelColorHex
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [renderWindow, setRenderWindow] = useState<any>(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    generateThumbnail();

    return () => {
      // Cleanup
      if (renderWindow) {
        renderWindow.delete();
      }
    };
  }, [file]);

  const generateThumbnail = async () => {
    if (!containerRef.current) return;

    setIsGenerating(true);

    try {
      // Create render window using GenericRenderWindow (same as scene.tsx)
      const grw = vtkGenericRenderWindow.newInstance();
      grw.setContainer(containerRef.current);
      
      const renderer = grw.getRenderer();
      const renderWindow = grw.getRenderWindow();
      setRenderWindow(grw);

      // Set background based on props
      if (backgroundHex) {
        const r = Number.parseInt(backgroundHex.slice(1, 3), 16) / 255;
        const g = Number.parseInt(backgroundHex.slice(3, 5), 16) / 255;
        const b = Number.parseInt(backgroundHex.slice(5, 7), 16) / 255;
        renderer.setBackground(r, g, b);
      } else {
        switch (background) {
          case 'white':
            renderer.setBackground(1, 1, 1);
            break;
          case 'black':
            renderer.setBackground(0, 0, 0);
            break;
          case 'transparent':
            renderer.setBackground(0, 0, 0);
            break;
          default:
            renderer.setBackground(0.95, 0.95, 0.95);
        }
      }

      // Set size
      renderWindow.getViews()[0].setSize(width, height);

      // Read file
      const fileData = await file.arrayBuffer();
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      let reader: any;
      let polyData: any;

      switch (fileExtension) {
        case 'stl':
          reader = vtkSTLReader.newInstance();
          reader.parseAsArrayBuffer(fileData);
          polyData = reader.getOutputData(0);
          break;
        
        case 'ply':
          reader = vtkPLYReader.newInstance();
          reader.parseAsArrayBuffer(fileData);
          polyData = reader.getOutputData(0);
          break;
        
        case 'obj':
          reader = vtkOBJReader.newInstance();
          const textDecoder = new TextDecoder();
          const objText = textDecoder.decode(fileData);
          reader.parseAsText(objText);
          polyData = reader.getOutputData(0);
          break;
        
        case '3mf':
          onError?.('3MF format is not supported. Please convert to STL, OBJ, or PLY format.');
          return;
        
        default:
          onError?.('Unsupported file format. Supported: STL, PLY, OBJ');
          return;
      }

      if (!polyData || !polyData.getPoints || polyData.getPoints().getNumberOfPoints() === 0) {
        onError?.('Failed to parse 3D model or model is empty');
        setIsGenerating(false);
        return;
      }

      console.log('PolyData loaded with', polyData.getPoints().getNumberOfPoints(), 'points');

      // Create mapper and actor
      let finalPolyData = polyData;
      if (smooth) {
        try {
          const normalsMod: any = await import('@kitware/vtk.js/Filters/Core/PolyDataNormals');
          const normals = normalsMod.default.newInstance({ 
            splitting: false,
            featureAngle: 30,
            computePointNormals: true,
            computeCellNormals: false
          });
          normals.setInputData(polyData);
          normals.update();
          finalPolyData = normals.getOutputData();
        } catch {}
      }
      const mapper = vtkMapper.newInstance({ 
        scalarVisibility: false,
        interpolateScalarsBeforeMapping: smooth
      });
      mapper.setInputData(finalPolyData);

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      // Set material properties for better thumbnail (silver/metallic look)
      if (modelColorHex) {
        const r = Number.parseInt(modelColorHex.slice(1, 3), 16) / 255;
        const g = Number.parseInt(modelColorHex.slice(3, 5), 16) / 255;
        const b = Number.parseInt(modelColorHex.slice(5, 7), 16) / 255;
        actor.getProperty().setColor(r, g, b);
      } else {
        actor.getProperty().setColor(0.75, 0.75, 0.75); // Silver
      }
      actor.getProperty().setSpecular(0.5);
      actor.getProperty().setSpecularPower(50);
      actor.getProperty().setAmbient(0.3);
      actor.getProperty().setDiffuse(0.7);
      
      // Apply wireframe and smooth shading settings
      if (wireframe) {
        actor.getProperty().setRepresentationToWireframe();
        actor.getProperty().setLineWidth(1);
      } else {
        actor.getProperty().setRepresentationToSurface();
      }
      
      if (smooth) {
        actor.getProperty().setInterpolationToPhong();
      } else {
        actor.getProperty().setInterpolationToFlat();
      }

      // Add to scene
      renderer.addActor(actor);
      
      // First reset camera to properly fit the object
      renderer.resetCamera();
      
      // Set up camera based on view prop
      const camera = renderer.getActiveCamera();
      
      // Get the bounds of the object for proper positioning
      const bounds = polyData.getBounds();
      const center = [
        (bounds[0] + bounds[1]) / 2,
        (bounds[2] + bounds[3]) / 2,
        (bounds[4] + bounds[5]) / 2
      ];
      
      // Calculate distance based on object size (closer zoom)
      const maxDimension = Math.max(
        bounds[1] - bounds[0],
        bounds[3] - bounds[2],
        bounds[5] - bounds[4]
      );
      const distance = maxDimension * 1.5; // Reduced from 2 to 1.5 for closer view
      
      // Set camera position based on view
      switch (view) {
        case 'isometric':
          // Isometric view (45° angles)
          const isoX = center[0] + distance * 0.7071; // cos(45°)
          const isoY = center[1] + distance * 0.7071; // cos(45°)
          const isoZ = center[2] + distance * 0.7071; // cos(45°)
          camera.setPosition(isoX, isoY, isoZ);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setViewUp(0, 0, 1);
          break;
        case 'front':
          camera.setPosition(center[0], center[1] + distance, center[2]);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setViewUp(0, 0, 1);
          break;
        case 'side':
          camera.setPosition(center[0] + distance, center[1], center[2]);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setViewUp(0, 0, 1);
          break;
        case 'top':
          camera.setPosition(center[0], center[1], center[2] + distance);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setViewUp(0, 1, 0);
          break;
        default:
          // Default isometric
          const defaultX = center[0] + distance * 0.7071;
          const defaultY = center[1] + distance * 0.7071;
          const defaultZ = center[2] + distance * 0.7071;
          camera.setPosition(defaultX, defaultY, defaultZ);
          camera.setFocalPoint(center[0], center[1], center[2]);
          camera.setViewUp(0, 0, 1);
      }
      
      // Set parallel projection for orthographic views
      camera.setParallelProjection(true);
      
      // Reset camera to fit the object properly
      renderer.resetCamera();
      
      // Zoom in for better framing (closer view)
      camera.zoom(1.1); // Changed from 0.8 to 1.1 for closer view

      // Render
      renderWindow.render();

      // Wait a bit for rendering to complete
      setTimeout(() => {
        try {
          // Generate thumbnail
          const images = renderWindow.captureImages();
          if (images && images.length > 0) {
            const thumbnailPromise = images[0];
            if (thumbnailPromise instanceof Promise) {
              thumbnailPromise.then((thumbnail: string) => {
                onThumbnailGenerated(thumbnail);
              }).catch((error: any) => {
                console.error('Error capturing thumbnail:', error);
                onError?.('Failed to capture thumbnail');
              });
            } else {
              onThumbnailGenerated(thumbnailPromise);
            }
          } else {
            // Fallback method - get canvas directly
            const canvas = renderWindow.getViews()[0].getCanvas();
            const thumbnail = canvas.toDataURL('image/png');
            onThumbnailGenerated(thumbnail);
          }
        } catch (error) {
          console.error('Error capturing thumbnail:', error);
          onError?.('Failed to capture thumbnail');
        } finally {
          setIsGenerating(false);
        }
      }, 1000);

    } catch (error) {
      console.error('Error generating thumbnail:', error);
      onError?.('Failed to generate thumbnail');
      setIsGenerating(false);
    }
  };

  return (
    <div className="thumbnail-generator">
      {isGenerating && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-white rounded-lg p-4 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-sm">Generating thumbnail...</span>
          </div>
        </div>
      )}
      
      <div 
        ref={containerRef}
        style={{ 
          width: `${width}px`, 
          height: `${height}px`,
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative'
        }}
      />
    </div>
  );
};

export default ThumbnailGenerator;
