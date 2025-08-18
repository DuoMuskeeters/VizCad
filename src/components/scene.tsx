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
import vtkAxesActor from "@kitware/vtk.js/Rendering/Core/AxesActor";
import vtkOrientationMarkerWidget from "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget";
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
  const gridActorRef = useRef<vtkProp | null>(null);
  const axesActorRef = useRef<vtkAxesActor | null>(null);
  const axesWidgetRef = useRef<any | null>(null);
  const viewLockedRef = useRef<boolean>(false);
  const gridPlaneSourcesRef = useRef<any[] | null>(null);
  const gridSubscriptionsRef = useRef<any[] | null>(null);

  useEffect(() => {
    if (vtkContainerRef.current && !genericRenderWindowRef.current) {
      const grw = vtkGenericRenderWindow.newInstance();
      grw.setContainer(vtkContainerRef.current);

      genericRenderWindowRef.current = grw;
      rendererRef.current = grw.getRenderer();
      renderWindowRef.current = grw.getRenderWindow();

      // View lock event (disable interactor to freeze camera)
      const handleViewLock = (e: CustomEvent) => {
        viewLockedRef.current = !!e.detail.enabled;
        try {
          const interactor = grw.getRenderWindow().getInteractor();
          if (viewLockedRef.current) interactor?.disable?.();
          else interactor?.enable?.();
        } catch {}
      };
      window.addEventListener(
        "toggleViewLock",
        handleViewLock as EventListener
      );

      // VTK sahnesinin başlatıldığını belirtmek için bir ilk render yapalım
      rendererRef.current.getRenderWindow()?.render();
      console.log("VTK scene initialized");

      // Cleanup function
      return () => {
        console.log("Cleaning up VTK scene...");
        window.removeEventListener(
          "toggleViewLock",
          handleViewLock as EventListener
        );
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
    const renderer = rendererRef.current;
    if (!renderer) return;

    // Helper for adding a light & tracking
    const addSceneLight = (config: {
      position?: [number, number, number];
      focalPoint?: [number, number, number];
      color?: [number, number, number];
      intensity?: number;
      type?: "scene" | "head" | "camera";
    }) => {
      const l = vtkLight.newInstance();
      switch (config.type) {
        case "head":
          l.setLightTypeToHeadLight();
          break;
        case "camera":
          l.setLightTypeToCameraLight();
          break;
        default:
          l.setLightTypeToSceneLight();
      }
      if (config.position) l.setPosition(...config.position);
      if (config.focalPoint) l.setFocalPoint(...config.focalPoint);
      if (config.color) l.setColor(...config.color);
      if (config.intensity !== undefined) l.setIntensity(config.intensity);
      renderer.addLight(l);
      lightsRef.current.push(l);
      return l;
    };

    // Not: Gradient destek metodu tip tanımında yok; sadece düz background kullanılıyor.

    switch (sceneId) {
      case "plain-white": {
        renderer.setBackground(1, 1, 1);
        // Yüksek ambient - karanlık bölge kalmasın
        addSceneLight({ color: [0.4, 0.4, 0.4], intensity: 0.4 });
        // Ana ışık - camera ile hareket eder (tutarlı aydınlatma)
        addSceneLight({
          position: [10, 10, 10],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.35,
          type: "camera"
        });
        // Karşı taraf fill ışığı - sabit pozisyon
        addSceneLight({
          position: [-8, -6, 6],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.4,
        });
        // Alttan ışık - bottom fill (artırıldı)
        addSceneLight({
          position: [0, 0, -8],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.4,
        });
        break;
      }
      case "3point-faded": {
        renderer.setBackground(0.96, 0.96, 0.975);
        // Yüksek ambient - gölgeler tamamen kararmayacak
        addSceneLight({ color: [0.35, 0.35, 0.35], intensity: 0.35 });
        // Ana key ışık - camera ile hareket eder
        addSceneLight({
          position: [10, 10, 10],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.4,
          type: "camera"
        });
        // Fill ışığı - güçlendirildi
        addSceneLight({
          position: [-10, -10, 5],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.35,
        });
        // Alttan soft ışık (artırıldı)
        addSceneLight({
          position: [0, 0, -6],
          focalPoint: [0, 0, 0],
          color: [0.95, 0.95, 1],
          intensity: 0.35,
        });
        break;
      }
      case "simple-office": {
        renderer.setBackground(0.9, 0.9, 0.9);
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
        floorActor.getProperty().setColor(0.8, 0.8, 0.8);
        renderer.addActor(floorActor);
        floorActorRef.current = floorActor;
        // Ofis ambient - yüksek taban ışığı
        addSceneLight({ color: [0.3, 0.3, 0.3], intensity: 0.3 });
        // Ana ofis ışığı - camera ile hareket eder
        addSceneLight({
          position: [-10, 5, 10],
          focalPoint: [0, 0, 0],
          color: [0.95, 0.95, 1],
          intensity: 0.35,
          type: "camera"
        });
        // Karşı taraf fill
        addSceneLight({
          position: [8, -6, 6],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.3,
        });
        // Zemin yansıması simülasyonu
        addSceneLight({
          position: [0, 0, -5],
          focalPoint: [0, 0, 0],
          color: [0.9, 0.9, 0.9],
          intensity: 0.2,
        });
        // Ek alttan ışık - ofis ortamı için (artırıldı)
        addSceneLight({
          position: [3, 3, -7],
          focalPoint: [0, 0, 0],
          color: [0.95, 0.95, 1],
          intensity: 0.3,
        });
        break;
      }
      case "warm-studio": {
        renderer.setBackground(0.98, 0.96, 0.9);
        // Yüksek sıcak ambient
        addSceneLight({ color: [0.4, 0.35, 0.3], intensity: 0.4 });
        // Ana sıcak ışık - camera ile hareket eder
        addSceneLight({
          position: [8, 8, 8],
          focalPoint: [0, 0, 0],
          color: [1, 0.95, 0.9],
          intensity: 0.35,
          type: "camera"
        });
        // Soğuk fill ışığı - kontrast için
        addSceneLight({
          position: [-6, -5, 5],
          focalPoint: [0, 0, 0],
          color: [0.9, 0.9, 1],
          intensity: 0.3,
        });
        // Alttan sıcak ışık - stüdyo tamamlayıcısı (artırıldı)
        addSceneLight({
          position: [0, 0, -6],
          focalPoint: [0, 0, 0],
          color: [1, 0.95, 0.9],
          intensity: 0.35,
        });
        break;
      }
      default: {
        renderer.setBackground(1, 1, 1);
        // Yüksek genel ambient - hiç karanlık kalmasın
        addSceneLight({ color: [0.3, 0.3, 0.3], intensity: 0.3 });
        // Ana ışık - camera ile hareket eder
        addSceneLight({
          position: [5, 5, 10],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.35,
          type: "camera"
        });
        // Karşı fill ışığı
        addSceneLight({
          position: [-6, -5, 6],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.3,
        });
        // Alttan genel ışık (artırıldı)
        addSceneLight({
          position: [0, 0, -7],
          focalPoint: [0, 0, 0],
          color: [1, 1, 1],
          intensity: 0.35,
        });
        break;
      }
    }

    // Camera clipping range & redraw
    if (rendererRef.current && renderWindowRef.current) {
      rendererRef.current.resetCameraClippingRange();
      renderWindowRef.current.render();
    }
  };

  // Display feature helpers
  const setWireframe = (enabled: boolean) => {
    if (!actorRef.current || !renderWindowRef.current) return;
    const prop: any = (actorRef.current as any).getProperty?.();
    if (!prop) return;
    if (enabled) prop.setRepresentationToWireframe();
    else prop.setRepresentationToSurface();
    renderWindowRef.current.render();
  };

  const setSmoothShading = (enabled: boolean) => {
    if (!actorRef.current || !renderWindowRef.current) return;
    const prop: any = (actorRef.current as any).getProperty?.();
    if (!prop) return;
    if (enabled) {
      // Recompute normals if possible for better smooth shading
      try {
        const mapper: any = (actorRef.current as any).getMapper?.();
        const data = mapper?.getInputData?.();
        if (data) {
          import("@kitware/vtk.js/Filters/Core/PolyDataNormals").then((mod) => {
            const normals = (mod as any).default.newInstance({
              splitting: false,
            });
            normals.setInputData(data);
            normals.update();
            mapper.setInputData(normals.getOutputData());
            prop.setInterpolationToPhong?.();
            renderWindowRef.current!.render();
          });
        } else {
          prop.setInterpolationToPhong?.();
        }
      } catch {
        prop.setInterpolationToPhong?.();
      }
    } else {
      prop.setInterpolationToFlat?.();
    }
    renderWindowRef.current.render();
  };

  const showGrid = (_enabled: boolean) => {
    if (!rendererRef.current || !renderWindowRef.current) return;
    if (gridActorRef.current) {
      if ((gridActorRef.current as any).actors) {
        (gridActorRef.current as any).actors.forEach((a: any) => {
          rendererRef.current!.removeActor(a);
          a.delete?.();
        });
      } else {
        rendererRef.current.removeActor(gridActorRef.current as any);
        (gridActorRef.current as any).delete?.();
      }
      gridActorRef.current = null;
    }
    gridPlaneSourcesRef.current = null;
    if (gridSubscriptionsRef.current) {
      gridSubscriptionsRef.current.forEach((s) => s?.unsubscribe?.());
      gridSubscriptionsRef.current = null;
    }
    rendererRef.current.resetCameraClippingRange();
    renderWindowRef.current.render();
  };

  const showAxes = (enabled: boolean) => {
    if (
      !rendererRef.current ||
      !renderWindowRef.current ||
      !genericRenderWindowRef.current
    )
      return;
    if (enabled) {
      if (axesWidgetRef.current) return; // already active
      const axes = vtkAxesActor.newInstance();
      (axes as any).setTotalLength?.(1.5, 1.5, 1.5);
      axesActorRef.current = axes;
      const widget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: genericRenderWindowRef.current
          .getRenderWindow()
          .getInteractor(),
      });
      widget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_LEFT);
      widget.setViewportSize(0.18);
      widget.setMinPixelSize(80);
      widget.setMaxPixelSize(150);
      widget.setEnabled(true);
      axesWidgetRef.current = widget;
    } else if (axesWidgetRef.current) {
      axesWidgetRef.current.setEnabled(false);
      axesWidgetRef.current.delete();
      axesWidgetRef.current = null;
      if (axesActorRef.current) {
        (axesActorRef.current as any).delete?.();
        axesActorRef.current = null;
      }
    }
    renderWindowRef.current.render();
  };

  // Capture current render as image (PNG/JPEG) using VTK captureImages if available
  const captureImage = async (options?: {
    scale?: number;
    format?: "png" | "jpeg";
    quality?: number; // 0-1 for jpeg
    filename?: string;
  }): Promise<boolean> => {
    const scale = options?.scale ?? 1;
    const format = options?.format ?? "png";
    const quality = options?.quality ?? 0.95;
    const filename =
      options?.filename ??
      `vizcad-render-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    if (!renderWindowRef.current || !vtkContainerRef.current) return false;
    try {
      const rw: any = renderWindowRef.current;
      // Preferred path
      if (rw.captureImages) {
        rw.render?.();
        const mime = format === "jpeg" ? "image/jpeg" : "image/png";
        const imgs: string[] = await rw.captureImages({
          scale,
          format: mime,
          mimeType: mime,
          quality,
        });
        const uri = imgs?.[0];
        if (uri) {
          const a = document.createElement("a");
          a.href = uri;
          a.download = `${filename}-scale${scale}.${format}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        }
      }
      // Fallback canvas
      const canvas: HTMLCanvasElement | null =
        vtkContainerRef.current.querySelector("canvas");
      if (!canvas) return false;
      const dataURL = canvas.toDataURL(
        format === "jpeg" ? "image/jpeg" : "image/png",
        quality
      );
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      return false;
    }
  };

  return {
    rendererRef: rendererRef,
    renderWindowRef: renderWindowRef,
    mapperRef,
    readerRef,
    lightsRef,
    floorActorRef,
    backgroundPlaneRef,
    gridActorRef,
    axesActorRef,
    axesWidgetRef,
    vtkContainerRef,
    actorRef,
    setBackground,
    addLight,
    resize,
    clearAllLights,
    clearFloor,
    clearBackgroundPlane,
    applyStudioScene,
    setWireframe,
    setSmoothShading,
    showGrid,
    showAxes,
    captureImage,
  };
}
