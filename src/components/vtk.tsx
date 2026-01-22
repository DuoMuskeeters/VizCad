import { useRef, useEffect, useState } from "react";
import { useVtkScene } from "./scene";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import vtkOBJReader from "@kitware/vtk.js/IO/Misc/OBJReader";
import vtkPLYReader from "@kitware/vtk.js/IO/Geometry/PLYReader";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import { BrepToStlConverter } from "./BrepToStlConverter";
import { LoadingSpinner } from "./LoadingSpinner";


interface DisplayState {
  wireframe: boolean
  grid: boolean
  axes: boolean
  smooth: boolean
}

interface VtkAppProps {
  file: File | null
  viewMode?: string
  displayState?: DisplayState
  viewLocked?: boolean
  perspective?: boolean
  minimal?: boolean
  autoRotate?: boolean
  rotationSpeed?: number
  backgroundColor?: [number, number, number]
  initialZoom?: number
  initialView?: string
  cameraAngles?: { azimuth: number; elevation: number } // Custom camera angles
  onCameraReady?: (cameraControls: {
    resetCamera: () => void
    zoomIn: () => void
    zoomOut: () => void
    setView: (view: string) => void
    applyStudioScene: (sceneId: string) => void
    setBackground: (color: [number, number, number]) => void
    captureScreenshot: () => void
    captureAsBlob: () => Promise<Blob | null>
  }) => void
}

export function VtkApp({ file, viewMode = "orbit", displayState, viewLocked = false, perspective = false, minimal = false, autoRotate = false, rotationSpeed = 0.3, backgroundColor, initialZoom = 1, initialView = "iso", cameraAngles, onCameraReady }: VtkAppProps) {
  const {
    vtkContainerRef,
    rendererRef,
    renderWindowRef,
    actorRef,
    mapperRef,
    resize,
    setWireframe,
    setSmoothShading,
    showGrid,
    showAxes,
    setProjection,
    resetCamera,
    zoomIn,
    zoomOut,
    setView,
    applyStudioScene,
    setBackground,
  } = useVtkScene(viewLocked)

  const [statusMessage, setStatusMessage] = useState<string>(
    "Ready. Please select a file."
  );
  const [isConverting, setIsConverting] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Add general loading state
  const [conversionProgress, setConversionProgress] = useState(0);

  // Screenshot capture function
  const captureScreenshot = () => {
    if (!vtkContainerRef.current || !renderWindowRef.current) return;

    // Get the canvas element from VTK container
    const canvas = vtkContainerRef.current.querySelector('canvas');
    if (!canvas) return;

    // Force a render before capturing
    renderWindowRef.current.render();

    // Use toBlob for better quality
    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vizcad-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0);
  };

  // Capture canvas as blob for thumbnail generation
  const captureAsBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!vtkContainerRef.current || !renderWindowRef.current) {
        resolve(null);
        return;
      }

      const canvas = vtkContainerRef.current.querySelector('canvas');
      if (!canvas) {
        resolve(null);
        return;
      }

      // Force a render before capturing
      renderWindowRef.current.render();

      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png', 1.0);
    });
  };

  // Expose camera controls to parent component
  useEffect(() => {
    if (onCameraReady) {
      onCameraReady({
        resetCamera,
        zoomIn,
        zoomOut,
        setView,
        applyStudioScene,
        setBackground,
        captureScreenshot,
        captureAsBlob,
      })
    }
  }, [onCameraReady, resetCamera, zoomIn, zoomOut, setView, applyStudioScene, setBackground])

  // Apply incoming displayState when it changes (idempotent)
  useEffect(() => {
    if (!displayState) return
    setWireframe(displayState.wireframe)
    showGrid(displayState.grid)
    showAxes(displayState.axes)
    setSmoothShading(displayState.smooth)
  }, [
    displayState?.wireframe,
    displayState?.grid,
    displayState?.axes,
    displayState?.smooth,
    setWireframe,
    showGrid,
    showAxes,
    setSmoothShading
  ])

  // Apply perspective when it changes
  useEffect(() => {
    setProjection(perspective)
  }, [perspective, setProjection])

  // Pencere boyutlandırma yöneticisi
  useEffect(() => {
    if (!resize) return
    const handleWindowResize = () => resize()
    window.addEventListener("resize", handleWindowResize)
    handleWindowResize() // İlk boyutu ayarlamak için bir kere çağır

    return () => window.removeEventListener("resize", handleWindowResize)
  }, [resize])

  // Enhanced zoom kontrolü için useEffect ekle
  useEffect(() => {
    if (!rendererRef.current || !renderWindowRef.current) return

    const handleWheel = (event: WheelEvent) => {
      // Only handle wheel events in zoom mode or default orbit mode
      if (viewMode !== "zoom" && viewMode !== "orbit") return

      event.preventDefault()

      const camera = rendererRef.current?.getActiveCamera()
      const position = camera?.getPosition()
      const focalPoint = camera?.getFocalPoint()

      // Mevcut mesafeyi hesapla
      if (!position || !focalPoint) return
      const dx = position[0] - focalPoint[0]
      const dy = position[1] - focalPoint[1]
      const dz = position[2] - focalPoint[2]
      const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // Zoom faktörü (wheel delta'ya göre)
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9
      const newDistance = currentDistance * zoomFactor

      // Zoom sınırları (minimum ve maksimum mesafe)
      const minDistance = 0.1
      const maxDistance = 100

      // Sınırları kontrol et
      if (newDistance < minDistance || newDistance > maxDistance) {
        return // Sınır dışındaysa zoom yapma
      }

      // Yeni pozisyonu hesapla
      const direction = [dx / currentDistance, dy / currentDistance, dz / currentDistance]
      const newPosition = [
        focalPoint[0] + direction[0] * newDistance,
        focalPoint[1] + direction[1] * newDistance,
        focalPoint[2] + direction[2] * newDistance,
      ]

      camera?.setPosition(newPosition[0], newPosition[1], newPosition[2])
      rendererRef.current?.resetCameraClippingRange()

      renderWindowRef.current?.render()
    }

    const container = vtkContainerRef.current
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false })

      return () => {
        container.removeEventListener("wheel", handleWheel)
      }
    }
  }, [rendererRef, renderWindowRef, viewMode])

  // Container boyut değişikliklerini izle
  useEffect(() => {
    if (!resize || !vtkContainerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      // Kısa bir gecikme ile resize çağır (DOM güncellemelerini bekle)
      setTimeout(() => {
        resize()
      }, 100)
    })

    resizeObserver.observe(vtkContainerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [resize])

  // 3D Dosyası yükleme mantığı
  useEffect(() => {
    if (!file || !rendererRef.current || !renderWindowRef.current) {
      return
    }

    setIsLoading(true); // Start loading

    // Dosya uzantısını al
    const extension = file.name.split('.').pop()?.toLowerCase()

    // BREP format kontrolü (STEP, IGES, BREP)
    const isBrepFormat = ['step', 'stp', 'iges', 'igs', 'brep'].includes(extension || '')

    if (isBrepFormat) {
      // Show loading screen
      setIsConverting(true)
      setConversionProgress(0)

      BrepToStlConverter.convertToPolyData(file, (progress) => {
        setConversionProgress(progress)
      })
        .then((polyData) => {
          if (!rendererRef.current || !renderWindowRef.current) {
            setIsConverting(false)
            setIsLoading(false)
            return
          }

          if (!polyData || polyData.getPoints().getNumberOfPoints() === 0) {
            console.error(`Invalid BREP source.`)
            setIsConverting(false)
            setIsLoading(false)
            return
          }

          // Mapper oluştur
          const mapper = vtkMapper.newInstance()
          mapper.setInputData(polyData)

          // Actor oluştur
          const actor = vtkActor.newInstance()
          actor.setMapper(mapper)

          // Mevcut aktörü kaldır
          if (actorRef.current) {
            rendererRef.current.removeActor(actorRef.current)
          }

          // Yeni aktörü ekle
          rendererRef.current.addActor(actor)
          actorRef.current = actor
          mapperRef.current = mapper

          // Kamerayı sıfırla ve render et
          rendererRef.current.resetCamera()
          setView("iso") // Set default view to Isometric
          renderWindowRef.current.render()

          setIsConverting(false)
          setIsLoading(false) // Finish loading
        })
        .catch((error) => {
          console.error(`BREP conversion error:`, error)
          setIsConverting(false)
          setIsLoading(false)
        })

      return // BREP işlemi tamamlandı, normal flow'a gerek yok
    }

    // Reader seçimi - daha güçlü tipler
    interface VtkGenericReader {
      parseAsArrayBuffer?(buffer: ArrayBuffer): void
      parseAsText?(text: string): void
      getOutputData(index?: number): any
    }

    let reader: VtkGenericReader | null = null
    let fileType: 'STL' | 'OBJ' | 'PLY' | null = null

    switch (extension) {
      case 'stl':
        reader = vtkSTLReader.newInstance()
        fileType = 'STL'
        break
      case 'obj':
        reader = vtkOBJReader.newInstance()
        fileType = 'OBJ'
        break
      case 'ply':
        reader = vtkPLYReader.newInstance()
        fileType = 'PLY'
        break
      default:
        setStatusMessage(`Unsupported file format: .${extension}`);
        console.error(`Unsupported file extension: ${extension}`)
        setIsLoading(false);
        return
    }

    setStatusMessage(`${fileType} dosyası okunuyor...`);
    const fileReader = new FileReader();

    fileReader.onload = async (event) => {
      if (
        !rendererRef.current ||
        !renderWindowRef.current ||
        !event.target?.result
      ) {
        setStatusMessage("Dosya okunurken bir hata oluştu.");
        setIsLoading(false);
        return;
      }

      console.log(`${fileType} dosyası başarıyla okundu. VTK pipeline başlatılıyor...`)

      const arrayBuffer = event.target.result as ArrayBuffer;

      // Reader tipine göre parse
      if (extension === 'obj') {
        // OBJ için text olarak oku
        const text = new TextDecoder().decode(arrayBuffer)
        if (reader.parseAsText) {
          reader.parseAsText(text)
        }
      } else {
        // STL ve PLY için binary
        if (reader.parseAsArrayBuffer) {
          reader.parseAsArrayBuffer(arrayBuffer)
        }
      }

      const source = reader.getOutputData(0);

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage(`Hata: ${fileType} dosyası geçersiz veya boş.`);
        console.error(`Geçersiz ${fileType} kaynağı.`);
        setIsLoading(false);
        return;
      }
      console.log(`${fileType} dosyası başarıyla parse edildi.`)

      // Önceki aktörü ve mapper'ı temizle
      if (actorRef.current) {
        rendererRef.current.removeActor(actorRef.current)
        actorRef.current.delete()
        actorRef.current = null
      }
      if (mapperRef.current) {
        mapperRef.current.delete()
        mapperRef.current = null
      }
      console.log("Önceki aktör ve mapper temizlendi.")

      // Ensure normals for smooth shading
      let polyData = source
      if (displayState?.smooth) {
        try {
          const normalsMod: any = await import("@kitware/vtk.js/Filters/Core/PolyDataNormals")
          const normalsFilter = normalsMod.default.newInstance({
            splitting: false,
          })
          normalsFilter.setInputData(source)
          normalsFilter.update()
          polyData = normalsFilter.getOutputData()
        } catch (e) {
          console.warn("Normals generation failed or module missing", e)
        }
      }

      const mapper = vtkMapper.newInstance({ scalarVisibility: false })
      mapper.setInputData(polyData)
      mapperRef.current = mapper

      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)

      // Default material properties
      const property = actor.getProperty()
      property.setColor(0.75, 0.75, 0.75) // Gümüş rengi
      if (displayState?.smooth) property.setInterpolationToPhong?.()
      else property.setInterpolationToFlat?.()
      actorRef.current = actor

      console.log("Yeni mapper ve aktör oluşturuldu.")

      // Aktörü sahneye ekle
      rendererRef.current.addActor(actor)
      console.log("Aktör sahneye eklendi. Sahnedeki aktör sayısı:", rendererRef.current.getActors().length)

      // Kamerayı sıfırla
      rendererRef.current.resetCamera()
      setView(initialView) // Use initialView prop
      rendererRef.current.resetCameraClippingRange()
      console.log("Kamera sıfırlandı. Kamera pozisyonu:", rendererRef.current.getActiveCamera().getPosition())

      // Son olarak, sahneyi render et
      renderWindowRef.current.render()
      console.log("Final render çağrıldı. Modelin görünmesi gerekiyor.")

      setStatusMessage("STL dosyası başarıyla yüklendi.");
      setIsLoading(false); // Stop loading
    };

    fileReader.onerror = () => {
      setStatusMessage("Dosya okunamadı.");
      console.error("FileReader error.");
      setIsLoading(false);
    };

    fileReader.readAsArrayBuffer(file)
  }, [file])

  // Initial zoom effect
  useEffect(() => {
    if (!rendererRef.current || !actorRef.current || initialZoom === 1 || isLoading) return

    const camera = rendererRef.current.getActiveCamera()
    if (camera) {
      camera.dolly(initialZoom)
      rendererRef.current.resetCameraClippingRange()
      renderWindowRef.current?.render()
    }
  }, [initialZoom, isLoading])

  // Background color effect
  useEffect(() => {
    if (!rendererRef.current || !backgroundColor) return
    rendererRef.current.setBackground(backgroundColor[0], backgroundColor[1], backgroundColor[2])
    renderWindowRef.current?.render()
  }, [backgroundColor])

  // Custom camera angles effect
  useEffect(() => {
    if (!rendererRef.current || !cameraAngles || isLoading) return

    const camera = rendererRef.current.getActiveCamera()
    if (camera && !initialView) {
      // Reset to front view first, then apply custom angles
      rendererRef.current.resetCamera()
      camera.azimuth(cameraAngles.azimuth)    // Horizontal rotation (-180 to 180)
      camera.elevation(cameraAngles.elevation) // Vertical rotation (-90 to 90)
      rendererRef.current.resetCameraClippingRange()
      renderWindowRef.current?.render()
    }
  }, [cameraAngles, isLoading])

  // Auto-rotate effect
  useEffect(() => {
    if (!autoRotate || !rendererRef.current || isLoading) return

    let animationFrameId: number

    const rotate = () => {
      if (!rendererRef.current) return

      const camera = rendererRef.current.getActiveCamera()
      if (camera) {
        camera.azimuth(rotationSpeed) // Use rotationSpeed prop
        rendererRef.current.resetCameraClippingRange()
        renderWindowRef.current?.render()
      }

      animationFrameId = requestAnimationFrame(rotate)
    }

    animationFrameId = requestAnimationFrame(rotate)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [autoRotate, isLoading])

  return (
    <div className={`w-full h-full flex flex-col relative overflow-hidden ${minimal ? '' : 'bg-white rounded-lg border border-gray-200 shadow-lg'}`}>
      <div
        ref={vtkContainerRef}
        className={`w-full h-full flex-grow ${minimal ? '' : 'min-h-[400px]'}`}
        style={{
          touchAction: "none",
          minWidth: minimal ? undefined : "300px",
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

      {/* Loading Overlay */}
      {(isConverting || isLoading) && <LoadingSpinner />}

      {!minimal && (
        <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span>{statusMessage}</span>
            <span className="text-gray-500">
              Mode: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
