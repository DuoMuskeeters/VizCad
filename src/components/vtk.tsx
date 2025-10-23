import { useRef, useEffect, useState } from "react";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import vtkOBJReader from "@kitware/vtk.js/IO/Misc/OBJReader";
import vtkPLYReader from "@kitware/vtk.js/IO/Geometry/PLYReader";
import { useVtkScene } from "./scene";
import "@kitware/vtk.js/Rendering/Profiles/Geometry";

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
  onCameraReady?: (cameraControls: {
    resetCamera: () => void
    zoomIn: () => void
    zoomOut: () => void
    setView: (view: string) => void
    applyStudioScene: (sceneId: string) => void
    setBackground: (color: [number, number, number]) => void
  }) => void
}

export function VtkApp({ file, viewMode = "orbit", displayState, viewLocked = false, perspective = false, onCameraReady }: VtkAppProps) {
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
  }, [displayState, setWireframe, showGrid, showAxes, setSmoothShading])

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

    // Dosya uzantısını al
    const extension = file.name.split('.').pop()?.toLowerCase()
    
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
        return;
      }

      console.log(`${fileType} dosyası başarıyla okundu. VTK pipeline başlatılıyor...`)

      const arrayBuffer = event.target.result as ArrayBuffer;
      
      // Reader tipine göre parse
      if (extension === 'obj') {
        // OBJ için text olarak oku
        const text = new TextDecoder().decode(arrayBuffer)
        reader.parseAsText(text)
      } else {
        // STL ve PLY için binary
        reader.parseAsArrayBuffer(arrayBuffer)
      }
      
      const source = reader.getOutputData(0);

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage(`Hata: ${fileType} dosyası geçersiz veya boş.`);
        console.error(`Geçersiz ${fileType} kaynağı.`);
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
      rendererRef.current.resetCameraClippingRange()
      console.log("Kamera sıfırlandı. Kamera pozisyonu:", rendererRef.current.getActiveCamera().getPosition())

      // Son olarak, sahneyi render et
      renderWindowRef.current.render()
      console.log("Final render çağrıldı. Modelin görünmesi gerekiyor.")

      setStatusMessage("STL dosyası başarıyla yüklendi.");
    };

    fileReader.onerror = () => {
      setStatusMessage("Dosya okunamadı.");
      console.error("FileReader error.");
    };

    fileReader.readAsArrayBuffer(file)
  }, [file]) 

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
