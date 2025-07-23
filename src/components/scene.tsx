// scene.tsx

import { useRef, useEffect } from "react";
import type { RefObject } from "react";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import type vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";

// Renk tipleri
type RED = number;
type GREEN = number;
type BLUE = number;
type RGB = [RED, GREEN, BLUE];

// Işık tipleri
export enum LightType {
  HEADLIGHT = "headlight",
  SCENE_LIGHT = "sceneLight",
  CAMERA_LIGHT = "cameraLight",
}

export interface LightOptions {
  position?: [number, number, number];
  focalPoint?: [number, number, number];
  color?: RGB;
  intensity?: number;
  positional?: boolean;
  coneAngle?: number;
}

export function useVtkScene(containerRef: RefObject<HTMLDivElement>) {
  // Ref'leri daha spesifik tiplerle ve null başlangıç değeriyle tanımlıyoruz
  const genericRenderWindowRef = useRef<vtkGenericRenderWindow | null>(null);
  const rendererRef = useRef<vtkRenderer | null>(null);
  const renderWindowRef = useRef<vtkRenderWindow | null>(null);

  useEffect(() => {
    if (containerRef.current && !genericRenderWindowRef.current) {
      const grw = vtkGenericRenderWindow.newInstance();
      grw.setContainer(containerRef.current);

      genericRenderWindowRef.current = grw;
      rendererRef.current = grw.getRenderer();
      renderWindowRef.current = grw.getRenderWindow();

      // VTK sahnesinin başlatıldığını belirtmek için bir ilk render yapalım
      rendererRef.current.getRenderWindow().render();
      console.log("VTK scene initialized");

      // Cleanup function
      return () => {
        console.log("Cleaning up VTK scene...");
        if (genericRenderWindowRef.current) {
          genericRenderWindowRef.current.delete();
          genericRenderWindowRef.current = null;
        }
        rendererRef.current = null;
        renderWindowRef.current = null;
        console.log("VTK scene cleaned up");
      };
    }
  }, [containerRef]);

  const setBackground = (color: RGB) => {
    if (rendererRef.current && renderWindowRef.current) {
      rendererRef.current.setBackground(color);
      renderWindowRef.current.render();
      console.log("Background color set to:", color);
    }
  };

  const addLight = (type: LightType, options: LightOptions = {}) => {
    if (!rendererRef.current || !renderWindowRef.current) {
      console.warn(
        "Cannot add light: renderer or renderWindow not initialized"
      );
      return null;
    }
    const {
      position = [1, 1, 1],
      focalPoint = [0, 0, 0],
      color = [1, 1, 1],
      intensity = 1.0,
      positional = false,
      coneAngle = 30,
    } = options;
    const light = vtkLight.newInstance();
    switch (type) {
      case LightType.HEADLIGHT:
        light.setLightTypeToHeadLight();
        break;
      case LightType.CAMERA_LIGHT:
        light.setLightTypeToCameraLight();
        break;
      case LightType.SCENE_LIGHT:
      default:
        light.setLightTypeToSceneLight();
        break;
    }
    light.setPosition(...position);
    light.setFocalPoint(...focalPoint);
    light.setColor(...color);
    light.setIntensity(intensity);
    if (positional) {
      light.setPositional(true);
      light.setConeAngle(coneAngle);
    }
    rendererRef.current.addLight(light);
    renderWindowRef.current.render();
    console.log(`Light of type ${type} added.`);
    return light;
  };

  const resize = () => {
    if (genericRenderWindowRef.current) {
      genericRenderWindowRef.current.resize();
      console.log("VTK window resized.");
    }
  };

  return {
    renderer: rendererRef,
    renderWindow: renderWindowRef,
    setBackground,
    addLight,
    resize, // Resize fonksiyonunu dışa aktar
  };
}
