import { useRef, useEffect, useState } from "react";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource";
import { useVtkScene } from "./scene";
import "@kitware/vtk.js/Rendering/Profiles/Geometry";
import vtkProp from "@kitware/vtk.js/Rendering/Core/Prop";

interface DisplayState {
  wireframe: boolean;
  grid: boolean;
  axes: boolean;
  smooth: boolean;
}

interface VtkAppProps {
  file: File | null;
  viewMode?: string;
  displayState?: DisplayState;
}

export function VtkApp({
  file,
  viewMode = "orbit",
  displayState,
}: VtkAppProps) {
  const {
    vtkContainerRef,
    rendererRef,
    renderWindowRef,
    actorRef,
    mapperRef,
    readerRef,
    lightsRef,
    floorActorRef,
    backgroundPlaneRef,
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
  } = useVtkScene();

  const [statusMessage, setStatusMessage] = useState<string>(
    "Hazır. Lütfen bir STL dosyası seçin."
  );

  // Apply incoming displayState when it changes (idempotent)
  useEffect(() => {
    if (!displayState) return;
    // Dispatch events so central listeners apply to current actor even if created after toggle.
    window.dispatchEvent(
      new CustomEvent("toggleWireframe", {
        detail: { enabled: displayState.wireframe },
      })
    );
    window.dispatchEvent(
      new CustomEvent("toggleGrid", { detail: { enabled: displayState.grid } })
    );
    window.dispatchEvent(
      new CustomEvent("toggleAxes", { detail: { enabled: displayState.axes } })
    );
    window.dispatchEvent(
      new CustomEvent("toggleSmoothShading", {
        detail: { enabled: displayState.smooth },
      })
    );
  }, [
    displayState?.wireframe,
    displayState?.grid,
    displayState?.axes,
    displayState?.smooth,
  ]);

  // Listen for studio scene changes
  // Display feature events
  useEffect(() => {
    const handleWireframe = (e: CustomEvent) =>
      setWireframe(!!e.detail.enabled);
    const handleSmooth = (e: CustomEvent) =>
      setSmoothShading(!!e.detail.enabled);
    const handleGrid = (e: CustomEvent) => showGrid(!!e.detail.enabled);
    const handleAxes = (e: CustomEvent) => showAxes(!!e.detail.enabled);
    window.addEventListener(
      "toggleWireframe",
      handleWireframe as EventListener
    );
    window.addEventListener(
      "toggleSmoothShading",
      handleSmooth as EventListener
    );
    window.addEventListener("toggleGrid", handleGrid as EventListener);
    window.addEventListener("toggleAxes", handleAxes as EventListener);
    return () => {
      window.removeEventListener(
        "toggleWireframe",
        handleWireframe as EventListener
      );
      window.removeEventListener(
        "toggleSmoothShading",
        handleSmooth as EventListener
      );
      window.removeEventListener("toggleGrid", handleGrid as EventListener);
      window.removeEventListener("toggleAxes", handleAxes as EventListener);
    };
  }, [setWireframe, setSmoothShading, showGrid, showAxes]);

  useEffect(() => {
    const handleStudioSceneChange = (event: CustomEvent) => {
      applyStudioScene(event.detail.sceneId);
    };

    window.addEventListener(
      "applyStudioScene",
      handleStudioSceneChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "applyStudioScene",
        handleStudioSceneChange as EventListener
      );
    };
  }, [rendererRef, renderWindowRef]);

  // Listen for custom background changes
  useEffect(() => {
    const handleCustomBackgroundChange = (event: CustomEvent) => {
      if (!rendererRef.current || !renderWindowRef.current) return;

      // Clear background plane when applying custom color
      clearBackgroundPlane();

      const color = event.detail.color;
      // Hex color'u RGB'ye çevir
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: Number.parseInt(result[1], 16) / 255,
              g: Number.parseInt(result[2], 16) / 255,
              b: Number.parseInt(result[3], 16) / 255,
            }
          : { r: 1, g: 1, b: 1 };
      };

      const rgb = hexToRgb(color);

      // Sadece background rengini değiştir, ışıkları koruma
      rendererRef.current.setBackground(rgb.r, rgb.g, rgb.b);

      // Render the scene
      renderWindowRef.current.render();
      console.log(`Applied custom background color: ${color}`);
    };

    window.addEventListener(
      "applyCustomBackground",
      handleCustomBackgroundChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "applyCustomBackground",
        handleCustomBackgroundChange as EventListener
      );
    };
  }, [rendererRef, renderWindowRef]);

  // Listen for background image changes
  useEffect(() => {
    const handleBackgroundImageChange = (event: CustomEvent) => {
      if (!rendererRef.current || !renderWindowRef.current) return;

      const { imageFile } = event.detail;

      if (imageFile) {
        // Create image element
        const backgroundImage = new Image();
        backgroundImage.crossOrigin = "anonymous";

        backgroundImage.onload = () => {
          try {
            // Clear any existing background plane (if any)
            clearBackgroundPlane();

            // VTK renderWindowRef'da native background image API yok; container div'e CSS background uygula
            if (vtkContainerRef.current) {
              vtkContainerRef.current.style.backgroundImage = `url('${backgroundImage.src}')`;
              vtkContainerRef.current.style.backgroundSize = "cover";
              vtkContainerRef.current.style.backgroundPosition = "center";
            }
            // Şeffaf arka plan için rendererRef clear color alpha'yı ayarlamak mümkün değil burada; sadece render et
            if (renderWindowRef.current) {
              renderWindowRef.current.render();
            }

            console.log(
              "Background image applied successfully:",
              imageFile.name
            );
          } catch (error) {
            console.error("Error applying background image:", error);
            // Fallback to white background
            rendererRef.current?.setBackground(1, 1, 1);
            renderWindowRef.current!.render();
          }
        };

        backgroundImage.onerror = () => {
          console.error("Failed to load background image");
          // Fallback to white background
          rendererRef.current?.setBackground(1, 1, 1);
          renderWindowRef.current!.render();
        };

        // Load image from file
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            backgroundImage.src = e.target.result as string;
          }
        };
        reader.readAsDataURL(imageFile);
      } else {
        // Clear background image - revert to solid color background
        if (vtkContainerRef.current) {
          vtkContainerRef.current.style.backgroundImage = "none";
        }
        rendererRef.current.setBackground(1, 1, 1);
        renderWindowRef.current.render();
      }

      console.log("Background image change processed");
    };

    window.addEventListener(
      "applyBackgroundImage",
      handleBackgroundImageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "applyBackgroundImage",
        handleBackgroundImageChange as EventListener
      );
    };
  }, [rendererRef, renderWindowRef]);

  // Listen for camera view change events
  useEffect(() => {
    const handleSetView = (event: CustomEvent) => {
      if (!rendererRef.current || !renderWindowRef.current) return;
      const cam = rendererRef.current.getActiveCamera();
      const view: string = event.detail.view;

      // Önce mevcut sahneye göre zoom-to-fit yap (VTK'nin kendi algoritması)
      rendererRef.current.resetCamera();
      rendererRef.current.resetCameraClippingRange();

      const center = cam.getFocalPoint() as [number, number, number];
      const currentPos = cam.getPosition() as [number, number, number];
      // Reset sonrası mesafeyi koru
      const dx = currentPos[0] - center[0];
      const dy = currentPos[1] - center[1];
      const dz = currentPos[2] - center[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      // Yön vektörleri (CAD benzeri eksenler: +Z = Top, -Y = Front varsayımı)
      let dir: [number, number, number] = [0, -1, 0]; // Front default
      let up: [number, number, number] = [0, 0, 1];

      switch (view.toLowerCase()) {
        case "front":
          // Front: view direction -Y (camera at +Y looking toward origin)
          dir = [0, -1, 0];
          up = [0, 0, 1];
          break;
        case "back":
          // Back: view direction +Y (camera at -Y)
          dir = [0, 1, 0];
          up = [0, 0, 1];
          break;
        case "left":
          // Left: view direction +X (camera at -X)
          dir = [1, 0, 0];
          up = [0, 0, 1];
          break;
        case "right":
          // Right: view direction -X (camera at +X)
          dir = [-1, 0, 0];
          up = [0, 0, 1];
          break;
        case "top":
          // Top: view direction -Z (camera at +Z)
          dir = [0, 0, -1];
          up = [0, 1, 0];
          break;
        case "bottom":
          // Bottom: view direction +Z (camera at -Z)
          dir = [0, 0, 1];
          up = [0, -1, 0];
          break;
        case "iso":
        case "isometric": {
          // Isometric NE: yaw +45°, pitch 35.264° (equal foreshortening)
          // Front direction is -Y. After yaw+pitch, view direction components: X+, Y-, Z-.
          // Use normalized [1, -1, -1].
          const inv = 1 / Math.sqrt(3);
          dir = [1 * inv, -1 * inv, -1 * inv];
          up = [0, 0, 1];
          break;
        }
        default:
          break;
      }

      // Yeni pozisyon = center - dir * dist
      const newPos: [number, number, number] = [
        center[0] - dir[0] * dist,
        center[1] - dir[1] * dist,
        center[2] - dir[2] * dist,
      ];

      cam.setPosition(...newPos);
      cam.setFocalPoint(...center);
      cam.setViewUp(...up);
      // Parallel projection for orthographic & isometric
      const v = view.toLowerCase();
      if (
        [
          "front",
          "back",
          "left",
          "right",
          "top",
          "bottom",
          "iso",
          "isometric",
        ].includes(v)
      ) {
        cam.setParallelProjection(true);
      } else {
        cam.setParallelProjection(false);
      }
      rendererRef.current.resetCameraClippingRange();
      renderWindowRef.current.render();
    };

    window.addEventListener("setView", handleSetView as EventListener);
    return () =>
      window.removeEventListener("setView", handleSetView as EventListener);
  }, [rendererRef, renderWindowRef]);

  // Projection toggle listener (external UI)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (!rendererRef.current || !renderWindowRef.current) return;
      const cam = rendererRef.current.getActiveCamera();
      const perspective = !!e.detail.perspective;
      // Korunacak: ekrandaki modelin görünen ölçeği.
      // Dönüşüm formülleri:
      // Parallel -> Perspective: distance = parallelScale / tan(fov/2)
      // Perspective -> Parallel: parallelScale = distance * tan(fov/2)
      const focal = cam.getFocalPoint();
      const pos = cam.getPosition();
      const dx = pos[0] - focal[0];
      const dy = pos[1] - focal[1];
      const dz = pos[2] - focal[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const fovDeg = cam.getViewAngle?.() ?? 30; // default VTK 30
      const fovRad2 = (fovDeg * Math.PI) / 180 / 2;
      if (perspective) {
        // geçiş: parallel -> perspective
        if (cam.getParallelProjection()) {
          const pScale = cam.getParallelScale?.() ?? dist * Math.tan(fovRad2);
          const newDist = pScale / Math.tan(fovRad2);
          // yön vektörü
          const invDist = 1 / dist;
          const dir = [dx * invDist, dy * invDist, dz * invDist];
          const newPos: [number, number, number] = [
            focal[0] + dir[0] * newDist,
            focal[1] + dir[1] * newDist,
            focal[2] + dir[2] * newDist,
          ];
          cam.setPosition(newPos[0], newPos[1], newPos[2]);
        }
        cam.setParallelProjection(false);
      } else {
        // geçiş: perspective -> parallel
        if (!cam.getParallelProjection()) {
          const newScale = dist * Math.tan(fovRad2);
          cam.setParallelScale?.(newScale);
        }
        cam.setParallelProjection(true);
      }
      rendererRef.current.resetCameraClippingRange();
      renderWindowRef.current.render();
    };
    window.addEventListener("toggleProjection", handler as EventListener);
    return () =>
      window.removeEventListener("toggleProjection", handler as EventListener);
  }, [rendererRef, renderWindowRef]);

  // Listen for zoom events
  useEffect(() => {
    const handleZoomIn = () => {
      if (!rendererRef.current || !renderWindowRef.current) return;
      const camera = rendererRef.current.getActiveCamera();
      camera.zoom(1.2);
      renderWindowRef.current.render();
    };

    const handleZoomOut = () => {
      if (!rendererRef.current || !renderWindowRef.current) return;
      const camera = rendererRef.current.getActiveCamera();
      camera.zoom(0.8);
      renderWindowRef.current.render();
    };

    const handleZoomToFit = () => {
      if (!rendererRef.current || !renderWindowRef.current) return;
      rendererRef.current.resetCamera();
      rendererRef.current.resetCameraClippingRange();
      renderWindowRef.current.render();
    };

    const handleBoxZoom = () => {
      // Box zoom implementation would require more complex interaction handling
      console.log("Box zoom activated - drag to select area");
    };

    window.addEventListener("zoomIn", handleZoomIn);
    window.addEventListener("zoomOut", handleZoomOut);
    window.addEventListener("zoomToFit", handleZoomToFit);
    window.addEventListener("boxZoom", handleBoxZoom);

    return () => {
      window.removeEventListener("zoomIn", handleZoomIn);
      window.removeEventListener("zoomOut", handleZoomOut);
      window.removeEventListener("zoomToFit", handleZoomToFit);
      window.removeEventListener("boxZoom", handleBoxZoom);
    };
  }, [rendererRef, renderWindowRef]);

  // Listen for camera reset events
  useEffect(() => {
    const handleResetCamera = () => {
      if (!rendererRef.current || !renderWindowRef.current) return;

      // Reset camera to fit the scene
      rendererRef.current.resetCamera();
      rendererRef.current.resetCameraClippingRange();

      // Set a nice isometric view as default
      const camera = rendererRef.current.getActiveCamera();
      const center = camera.getFocalPoint();
      const currentPos = camera.getPosition();

      // Calculate distance to maintain
      const dx = currentPos[0] - center[0];
      const dy = currentPos[1] - center[1];
      const dz = currentPos[2] - center[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      // Default reset -> isometric NE (X+, Y-, Z-) with parallel projection
      const inv = 1 / Math.sqrt(3);
      const dir = [1 * inv, -1 * inv, -1 * inv];
      const up = [0, 0, 1];

      const newPos = [
        center[0] - dir[0] * dist,
        center[1] - dir[1] * dist,
        center[2] - dir[2] * dist,
      ];

      camera.setPosition(newPos[0], newPos[1], newPos[2]);
      camera.setFocalPoint(center[0], center[1], center[2]);
      camera.setViewUp(up[0], up[1], up[2]);
      camera.setParallelProjection(true);
      rendererRef.current.resetCameraClippingRange();
      renderWindowRef.current.render();
    };

    window.addEventListener("resetCamera", handleResetCamera);
    return () => window.removeEventListener("resetCamera", handleResetCamera);
  }, [rendererRef, renderWindowRef]);

  // Sahne başlangıç ayarları (Default Plain White)
  useEffect(() => {
    if (!rendererRef.current || !renderWindowRef.current) return;

    // Apply default plain white scene
    applyStudioScene("plain-white");
  }, [rendererRef, renderWindowRef]);

  // Pencere boyutlandırma yöneticisi
  useEffect(() => {
    if (!resize) return;
    const handleWindowResize = () => resize();
    window.addEventListener("resize", handleWindowResize);
    handleWindowResize(); // İlk boyutu ayarlamak için bir kere çağır

    return () => window.removeEventListener("resize", handleWindowResize);
  }, [resize]);

  // Enhanced zoom kontrolü için useEffect ekle
  useEffect(() => {
    if (!rendererRef.current || !renderWindowRef.current) return;

    const handleWheel = (event: WheelEvent) => {
      // Only handle wheel events in zoom mode or default orbit mode
      if (viewMode !== "zoom" && viewMode !== "orbit") return;

      event.preventDefault();

      const camera = rendererRef.current?.getActiveCamera();
      const position = camera?.getPosition();
      const focalPoint = camera?.getFocalPoint();

      // Mevcut mesafeyi hesapla
      if (!position || !focalPoint) return;
      const dx = position[0] - focalPoint[0];
      const dy = position[1] - focalPoint[1];
      const dz = position[2] - focalPoint[2];
      const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Zoom faktörü (wheel delta'ya göre)
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
      const newDistance = currentDistance * zoomFactor;

      // Zoom sınırları (minimum ve maksimum mesafe)
      const minDistance = 0.1;
      const maxDistance = 100;

      // Sınırları kontrol et
      if (newDistance < minDistance || newDistance > maxDistance) {
        return; // Sınır dışındaysa zoom yapma
      }

      // Yeni pozisyonu hesapla
      const direction = [
        dx / currentDistance,
        dy / currentDistance,
        dz / currentDistance,
      ];
      const newPosition = [
        focalPoint[0] + direction[0] * newDistance,
        focalPoint[1] + direction[1] * newDistance,
        focalPoint[2] + direction[2] * newDistance,
      ];

      camera?.setPosition(newPosition[0], newPosition[1], newPosition[2]);
      rendererRef.current?.resetCameraClippingRange();

      renderWindowRef.current?.render();
    };

    const container = vtkContainerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });

      return () => {
        container.removeEventListener("wheel", handleWheel);
      };
    }
  }, [rendererRef, renderWindowRef, viewMode]);

  // Container boyut değişikliklerini izle
  useEffect(() => {
    if (!resize || !vtkContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // Kısa bir gecikme ile resize çağır (DOM güncellemelerini bekle)
      setTimeout(() => {
        resize();
      }, 100);
    });

    resizeObserver.observe(vtkContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [resize]);

  // STL Dosyası yükleme mantığı
  useEffect(() => {
    if (!file || !rendererRef.current || !renderWindowRef.current) {
      return;
    }

    setStatusMessage("STL dosyası okunuyor...");
    const fileReader = new FileReader();
    const reader = vtkSTLReader.newInstance();
    readerRef.current = reader;

    fileReader.onload = async (event) => {
      if (
        !rendererRef.current ||
        !renderWindowRef.current ||
        !event.target?.result
      ) {
        setStatusMessage("Dosya okunurken bir hata oluştu.");
        return;
      }

      console.log("Dosya başarıyla okundu. VTK pipeline başlatılıyor...");

      const arrayBuffer = event.target.result as ArrayBuffer;
      reader.parseAsArrayBuffer(arrayBuffer);
      const source = reader.getOutputData(0);

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage("Hata: STL dosyası geçersiz veya boş.");
        console.error("Geçersiz STL kaynağı.");
        return;
      }
      console.log("STL dosyası başarıyla parse edildi.");

      // Önceki aktörü ve mapper'ı temizle
      if (actorRef.current) {
        rendererRef.current.removeActor(actorRef.current);
        actorRef.current.delete();
        actorRef.current = null;
      }
      if (mapperRef.current) {
        mapperRef.current.delete();
        mapperRef.current = null;
      }
      console.log("Önceki aktör ve mapper temizlendi.");

      // Ensure normals for smooth shading
      let polyData = source;
      if (displayState?.smooth) {
        try {
          const normalsMod: any = await import(
            "@kitware/vtk.js/Filters/Core/PolyDataNormals"
          );
          const normalsFilter = normalsMod.default.newInstance({
            splitting: false,
          });
          normalsFilter.setInputData(source);
          normalsFilter.update();
          polyData = normalsFilter.getOutputData();
        } catch (e) {
          console.warn("Normals generation failed or module missing", e);
        }
      }

      const mapper = vtkMapper.newInstance({ scalarVisibility: false });
      mapper.setInputData(polyData);
      mapperRef.current = mapper;

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      // Default material properties
      const property = actor.getProperty();
      property.setColor(0.75, 0.75, 0.75); // Gümüş rengi
      if (displayState?.smooth) property.setInterpolationToPhong?.();
      else property.setInterpolationToFlat?.();
      actorRef.current = actor;

      console.log("Yeni mapper ve aktör oluşturuldu.");

      // Aktörü sahneye ekle
      rendererRef.current.addActor(actor);
      console.log(
        "Aktör sahneye eklendi. Sahnedeki aktör sayısı:",
        rendererRef.current.getActors().length
      );

      // Kamerayı sıfırla
      rendererRef.current.resetCamera();
      rendererRef.current.resetCameraClippingRange();
      console.log(
        "Kamera sıfırlandı. Kamera pozisyonu:",
        rendererRef.current.getActiveCamera().getPosition()
      );

      // Reapply display state (wireframe / grid / axes) after actor creation
      if (displayState) {
        window.dispatchEvent(
          new CustomEvent("toggleWireframe", {
            detail: { enabled: displayState.wireframe },
          })
        );
        window.dispatchEvent(
          new CustomEvent("toggleGrid", {
            detail: { enabled: displayState.grid },
          })
        );
        window.dispatchEvent(
          new CustomEvent("toggleAxes", {
            detail: { enabled: displayState.axes },
          })
        );
        window.dispatchEvent(
          new CustomEvent("toggleSmoothShading", {
            detail: { enabled: displayState.smooth },
          })
        );
      }

      // Son olarak, sahneyi render et
      renderWindowRef.current.render();
      console.log("Final render çağrıldı. Modelin görünmesi gerekiyor.");

      setStatusMessage("STL dosyası başarıyla yüklendi.");
    };

    fileReader.onerror = () => {
      setStatusMessage("Dosya okunamadı.");
      console.error("FileReader error.");
    };

    fileReader.readAsArrayBuffer(file);

    return () => {
      if (readerRef.current) {
        readerRef.current.delete();
        readerRef.current = null;
      }
    };
  }, [file, rendererRef, renderWindowRef]);

  // Cleanup function
  useEffect(() => {
    return () => {
      clearAllLights();
      clearFloor();
      clearBackgroundPlane();
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col relative bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      <div
        ref={vtkContainerRef}
        className={`w-full h-full flex-grow min-h-[400px]`}
        style={{
          touchAction: "none",
          minWidth: "300px",
          maxWidth: "100%",
          maxHeight: "100vh",
          cursor:
            viewMode === "pan"
              ? "grab"
              : viewMode === "zoom"
              ? "zoom-in"
              : viewMode === "select"
              ? "pointer"
              : "default",
        }}
      />
      <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span>{statusMessage}</span>
          <span className="text-gray-500">
            Mode: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
