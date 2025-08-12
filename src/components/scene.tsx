// scene.tsx

import { useRef, useEffect } from "react";
import type { RefObject } from "react";
import vtkGenericRenderWindow, {
  IGenericRenderWindowInitialValues,
} from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import type vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource";
import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkProp from "@kitware/vtk.js/Rendering/Core/Prop";

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

export function useVtkScene() {
  // Ref'leri daha spesifik tiplerle ve null başlangıç değeriyle tanımlıyoruz
  const vtkContainerRef = useRef<HTMLDivElement>(null!);
  const genericRenderWindowRef = useRef<vtkGenericRenderWindow | null>(null);
  const rendererRef = useRef<vtkRenderer | null>(null);
  const renderWindowRef = useRef<vtkRenderWindow | null>(null);
  const actorRef = useRef<vtkProp | null>(null);
  const mapperRef = useRef<vtkMapper | null>(null);
  const readerRef = useRef<vtkSTLReader | null>(null);
  const lightsRef = useRef<vtkLight[]>([]);
  const floorActorRef = useRef<vtkProp | null>(null);
  const backgroundPlaneRef = useRef<vtkProp | null>(null);

  useEffect(() => {
    if (vtkContainerRef.current && !genericRenderWindowRef.current) {
      const grw = vtkGenericRenderWindow.newInstance();
      grw.setContainer(vtkContainerRef.current);

      genericRenderWindowRef.current = grw;
      rendererRef.current = grw.getRenderer();
      renderWindowRef.current = grw.getRenderWindow();

      // VTK sahnesinin başlatıldığını belirtmek için bir ilk render yapalım
      rendererRef.current.getRenderWindow()?.render();
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
  }, [vtkContainerRef]);

  const setBackground = (color: RGB) => {
    if (rendererRef.current && renderWindowRef.current) {
      rendererRef.current.setBackground(color);
      renderWindowRef.current.render();
      console.log("Background color set to:", color);
    }
  };

  const clearAllLights = () => {
    if (!rendererRef.current) return;

    lightsRef.current.forEach((light) => {
      rendererRef.current?.removeLight(light);
    });
    lightsRef.current = [];
  };

  const clearFloor = () => {
    if (!rendererRef.current || !floorActorRef.current) return;

    rendererRef.current.removeActor(floorActorRef.current);
    floorActorRef.current.delete();
    floorActorRef.current = null;
  };

  const clearBackgroundPlane = () => {
    if (!rendererRef.current || !backgroundPlaneRef.current) return;

    rendererRef.current.removeActor(backgroundPlaneRef.current);
    backgroundPlaneRef.current.delete();
    backgroundPlaneRef.current = null;
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
  const applyStudioScene = (sceneId: string) => {
    // Clear existing lights, floor, and background plane
    clearAllLights();
    clearFloor();
    clearBackgroundPlane();

    switch (sceneId) {
      case "plain-white":
        // Arka planı saf beyaza ayarla
        rendererRef.current?.setBackground(1, 1, 1); // RGB(255, 255, 255)

        // Ortam ışığı ekle (çok hafif)
        const ambientLight1 = vtkLight.newInstance();
        ambientLight1.setLightTypeToSceneLight();
        ambientLight1.setColor(0.1, 0.1, 0.1); // Çok hafif gri
        ambientLight1.setIntensity(0.1);
        rendererRef.current?.addLight(ambientLight1);
        lightsRef.current.push(ambientLight1);

        // Ana yönlü ışık ekle (sağ üstten, yumuşak)
        const directionalLight1 = vtkLight.newInstance();
        directionalLight1.setLightTypeToSceneLight();
        directionalLight1.setPosition(10, 10, 10); // Sağ üstten
        directionalLight1.setFocalPoint(0, 0, 0); // Merkeze doğru bakar
        directionalLight1.setColor(1, 1, 1); // Beyaz ışık
        directionalLight1.setIntensity(0.9); // Yeterli yoğunlukta
        rendererRef.current?.addLight(directionalLight1);
        lightsRef.current.push(directionalLight1);
        break;

      case "3point-faded":
        // Arka planı dikey degradeye ayarla
        rendererRef.current?.setBackground(0.941, 0.941, 0.961);
        rendererRef.current?.setBackground2(1, 1, 1);

        // Ortam ışığı ekle (yeterli miktarda)
        const ambientLight2 = vtkLight.newInstance();
        ambientLight2.setLightTypeToSceneLight();
        ambientLight2.setColor(0.3, 0.3, 0.3); // Orta gri
        ambientLight2.setIntensity(0.3);
        rendererRef.current?.addLight(ambientLight2);
        lightsRef.current.push(ambientLight2);

        // Ana yönlü ışık ekle (sağ üstten)
        const mainDirectionalLight = vtkLight.newInstance();
        mainDirectionalLight.setLightTypeToSceneLight();
        mainDirectionalLight.setPosition(10, 10, 10);
        mainDirectionalLight.setFocalPoint(0, 0, 0);
        mainDirectionalLight.setColor(1, 1, 1);
        mainDirectionalLight.setIntensity(0.8);
        rendererRef.current?.addLight(mainDirectionalLight);
        lightsRef.current.push(mainDirectionalLight);

        // Ek dolgu ışığı (sol alttan, çok hafif)
        const fillLight = vtkLight.newInstance();
        fillLight.setLightTypeToSceneLight();
        fillLight.setPosition(-10, -10, 5);
        fillLight.setFocalPoint(0, 0, 0);
        fillLight.setColor(1, 1, 1);
        fillLight.setIntensity(0.2);
        rendererRef.current?.addLight(fillLight);
        lightsRef.current.push(fillLight);
        break;

      case "simple-office":
        // Arka plan rengi (açık gri duvarlar için)
        rendererRef.current?.setBackground(0.9, 0.9, 0.9);

        // Zemin oluştur ve rengini ayarla
        const floorSource = vtkPlaneSource.newInstance({
          xResolution: 10,
          yResolution: 10,
        });
        floorSource.setOrigin(-5, -5, -1);
        floorSource.setPoint1(5, -5, -1);
        floorSource.setPoint2(-5, 5, -1);

        const floorMapper = vtkMapper.newInstance();
        floorMapper.setInputConnection(floorSource.getOutputPort());

        const floorActor = vtkActor.newInstance();
        floorActor.setMapper(floorMapper);
        floorActor.getProperty().setColor(0.8, 0.8, 0.8); // Açık gri zemin
        rendererRef.current?.addActor(floorActor);
        floorActorRef.current = floorActor;

        // Ortam ışığı ekle (genel aydınlık)
        const ambientLight3 = vtkLight.newInstance();
        ambientLight3.setLightTypeToSceneLight();
        ambientLight3.setColor(0.2, 0.2, 0.2);
        ambientLight3.setIntensity(0.2);
        rendererRef.current?.addLight(ambientLight3);
        lightsRef.current.push(ambientLight3);

        // Doğal pencere ışığı (geniş ve yumuşak, sol üstten)
        const windowLight = vtkLight.newInstance();
        windowLight.setLightTypeToSceneLight();
        windowLight.setPosition(-10, 5, 10); // Sol üstten gelen ışık
        windowLight.setFocalPoint(0, 0, 0);
        windowLight.setColor(0.95, 0.95, 1); // Hafif mavimsi beyaz (gün ışığı)
        windowLight.setIntensity(0.8);
        rendererRef.current?.addLight(windowLight);
        lightsRef.current.push(windowLight);
        break;

      case "warm-studio":
        // Arka planı sıcak bej tonuna ayarla
        rendererRef.current?.setBackground(0.98, 0.96, 0.9); // RGB(250, 245, 230)

        const warmAmbientLight = vtkLight.newInstance();
        warmAmbientLight.setLightTypeToSceneLight();
        warmAmbientLight.setColor(0.8, 0.7, 0.6); // Sıcak, hafif turuncumsu
        warmAmbientLight.setIntensity(0.7); // Yüksek yoğunlukta ortam ışığı
        rendererRef.current?.addLight(warmAmbientLight);
        lightsRef.current.push(warmAmbientLight);

        // Yumuşak ana ışık (düşük kontrast)
        const softMainLight = vtkLight.newInstance();
        softMainLight.setLightTypeToSceneLight();
        softMainLight.setPosition(8, 8, 8);
        softMainLight.setFocalPoint(0, 0, 0);
        softMainLight.setColor(1, 0.95, 0.9); // Hafif sarımsı beyaz
        softMainLight.setIntensity(0.5); // Orta yoğunluk
        rendererRef.current?.addLight(softMainLight);
        lightsRef.current.push(softMainLight);
        break;

      default:
        // Default to plain white
        rendererRef.current?.setBackground(1, 1, 1);
        break;
    }
    // Render the scene
  };

  return {
    rendererRef: rendererRef,
    renderWindowRef: renderWindowRef,
    mapperRef,
    readerRef,
    lightsRef,
    floorActorRef,
    backgroundPlaneRef,
    vtkContainerRef,
    actorRef,
    setBackground,
    addLight,
    resize, 
    clearAllLights,
    clearFloor,
    clearBackgroundPlane,
    applyStudioScene
  };
}
