"use client"

import { useRef, useEffect, useState } from "react"
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor"
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper"
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader"
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light"
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource"
import { useVtkScene } from "./scene"
import "@kitware/vtk.js/Rendering/Profiles/Geometry"

interface VtkAppProps {
  file: File | null
}

export function VtkApp({ file }: VtkAppProps) {
  const vtkContainerRef = useRef<HTMLDivElement>(null)
  const { renderer, renderWindow, setBackground, addLight, resize } = useVtkScene(vtkContainerRef)

  const actorRef = useRef<vtkActor | null>(null)
  const mapperRef = useRef<vtkMapper | null>(null)
  const readerRef = useRef<vtkSTLReader | null>(null)
  const lightsRef = useRef<any[]>([])
  const floorActorRef = useRef<vtkActor | null>(null)

  const [statusMessage, setStatusMessage] = useState<string>("Hazır. Lütfen bir STL dosyası seçin.")

  // Clear all lights function
  const clearAllLights = () => {
    if (!renderer.current) return

    lightsRef.current.forEach((light) => {
      renderer.current.removeLight(light)
    })
    lightsRef.current = []
  }

  // Clear floor function
  const clearFloor = () => {
    if (!renderer.current || !floorActorRef.current) return

    renderer.current.removeActor(floorActorRef.current)
    floorActorRef.current.delete()
    floorActorRef.current = null
  }

  // Apply studio scene function
  const applyStudioScene = (sceneId: string) => {
    if (!renderer.current || !renderWindow.current) return

    // Clear existing lights and floor
    clearAllLights()
    clearFloor()

    switch (sceneId) {
      case "plain-white":
        // Arka planı saf beyaza ayarla
        renderer.current.setBackground(1, 1, 1) // RGB(255, 255, 255)
        // Ortam ışığı ekle (çok hafif)
        const ambientLight1 = vtkLight.newInstance()
        ambientLight1.setLightTypeToSceneLight()
        ambientLight1.setColor(0.1, 0.1, 0.1) // Çok hafif gri
        ambientLight1.setIntensity(0.1)
        renderer.current.addLight(ambientLight1)
        lightsRef.current.push(ambientLight1)

        // Ana yönlü ışık ekle (sağ üstten, yumuşak)
        const directionalLight1 = vtkLight.newInstance()
        directionalLight1.setLightTypeToSceneLight()
        directionalLight1.setPosition(10, 10, 10) // Sağ üstten
        directionalLight1.setFocalPoint(0, 0, 0) // Merkeze doğru bakar
        directionalLight1.setColor(1, 1, 1) // Beyaz ışık
        directionalLight1.setIntensity(0.9) // Yeterli yoğunlukta
        renderer.current.addLight(directionalLight1)
        lightsRef.current.push(directionalLight1)
        break

      case "3point-faded":
        // Arka planı dikey degradeye ayarla
        // Üst için hafif mavimsi beyaz (RGB: 240, 240, 245)
        renderer.current.setBackground(0.941, 0.941, 0.961)
        // Alt için saf beyaz (RGB: 255, 255, 255)
        renderer.current.setBackground2(1, 1, 1)
        renderer.current.setGradientBackground(true)

        // Ortam ışığı ekle (yeterli miktarda)
        const ambientLight2 = vtkLight.newInstance()
        ambientLight2.setLightTypeToSceneLight()
        ambientLight2.setColor(0.3, 0.3, 0.3) // Orta gri
        ambientLight2.setIntensity(0.3)
        renderer.current.addLight(ambientLight2)
        lightsRef.current.push(ambientLight2)

        // Ana yönlü ışık ekle (sağ üstten)
        const mainDirectionalLight = vtkLight.newInstance()
        mainDirectionalLight.setLightTypeToSceneLight()
        mainDirectionalLight.setPosition(10, 10, 10)
        mainDirectionalLight.setFocalPoint(0, 0, 0)
        mainDirectionalLight.setColor(1, 1, 1)
        mainDirectionalLight.setIntensity(0.8)
        renderer.current.addLight(mainDirectionalLight)
        lightsRef.current.push(mainDirectionalLight)

        // Ek dolgu ışığı (sol alttan, çok hafif)
        const fillLight = vtkLight.newInstance()
        fillLight.setLightTypeToSceneLight()
        fillLight.setPosition(-10, -10, 5)
        fillLight.setFocalPoint(0, 0, 0)
        fillLight.setColor(1, 1, 1)
        fillLight.setIntensity(0.2)
        renderer.current.addLight(fillLight)
        lightsRef.current.push(fillLight)
        break

      case "simple-office":
        // Arka plan rengi (açık gri duvarlar için)
        renderer.current.setBackground(0.9, 0.9, 0.9)
        // Zemin oluştur ve rengini ayarla
        const floorSource = vtkPlaneSource.newInstance({
          xResolution: 10,
          yResolution: 10,
        })
        floorSource.setOrigin(-5, -5, -1)
        floorSource.setPoint1(5, -5, -1)
        floorSource.setPoint2(-5, 5, -1)

        const floorMapper = vtkMapper.newInstance()
        floorMapper.setInputConnection(floorSource.getOutputPort())

        const floorActor = vtkActor.newInstance()
        floorActor.setMapper(floorMapper)
        floorActor.getProperty().setColor(0.8, 0.8, 0.8) // Açık gri zemin
        renderer.current.addActor(floorActor)
        floorActorRef.current = floorActor

        // Ortam ışığı ekle (genel aydınlık)
        const ambientLight3 = vtkLight.newInstance()
        ambientLight3.setLightTypeToSceneLight()
        ambientLight3.setColor(0.2, 0.2, 0.2)
        ambientLight3.setIntensity(0.2)
        renderer.current.addLight(ambientLight3)
        lightsRef.current.push(ambientLight3)

        // Doğal pencere ışığı (geniş ve yumuşak, sol üstten)
        const windowLight = vtkLight.newInstance()
        windowLight.setLightTypeToSceneLight()
        windowLight.setPosition(-10, 5, 10) // Sol üstten gelen ışık
        windowLight.setFocalPoint(0, 0, 0)
        windowLight.setColor(0.95, 0.95, 1) // Hafif mavimsi beyaz (gün ışığı)
        windowLight.setIntensity(0.8)
        renderer.current.addLight(windowLight)
        lightsRef.current.push(windowLight)
        break

      case "warm-studio":
        // Arka planı sıcak bej tonuna ayarla
        renderer.current.setBackground(0.98, 0.96, 0.9) // RGB(250, 245, 230)
        const warmAmbientLight = vtkLight.newInstance()
        warmAmbientLight.setLightTypeToSceneLight()
        warmAmbientLight.setColor(0.8, 0.7, 0.6) // Sıcak, hafif turuncumsu
        warmAmbientLight.setIntensity(0.7) // Yüksek yoğunlukta ortam ışığı
        renderer.current.addLight(warmAmbientLight)
        lightsRef.current.push(warmAmbientLight)

        // Yumuşak ana ışık (düşük kontrast)
        const softMainLight = vtkLight.newInstance()
        softMainLight.setLightTypeToSceneLight()
        softMainLight.setPosition(8, 8, 8)
        softMainLight.setFocalPoint(0, 0, 0)
        softMainLight.setColor(1, 0.95, 0.9) // Hafif sarımsı beyaz
        softMainLight.setIntensity(0.5) // Orta yoğunluk
        renderer.current.addLight(softMainLight)
        lightsRef.current.push(softMainLight)
        break

      default:
        // Default to plain white
        renderer.current.setBackground(1, 1, 1)
        break
    }

    // Render the scene
    renderWindow.current.render()
    console.log(`Applied studio scene: ${sceneId}`)
  }

  // Listen for studio scene changes
  useEffect(() => {
    const handleStudioSceneChange = (event: CustomEvent) => {
      applyStudioScene(event.detail.sceneId)
    }

    window.addEventListener("applyStudioScene", handleStudioSceneChange as EventListener)

    return () => {
      window.removeEventListener("applyStudioScene", handleStudioSceneChange as EventListener)
    }
  }, [renderer, renderWindow])

  // Sahne başlangıç ayarları (Default Plain White)
  useEffect(() => {
    if (!renderer.current || !renderWindow.current) return

    // Apply default plain white scene
    applyStudioScene("plain-white")
  }, [renderer, renderWindow])

  // Pencere boyutlandırma yöneticisi
  useEffect(() => {
    if (!resize) return
    const handleWindowResize = () => resize()
    window.addEventListener("resize", handleWindowResize)
    handleWindowResize() // İlk boyutu ayarlamak için bir kere çağır

    return () => window.removeEventListener("resize", handleWindowResize)
  }, [resize])

  // STL Dosyası yükleme mantığı
  useEffect(() => {
    if (!file || !renderer.current || !renderWindow.current) {
      return
    }

    setStatusMessage("STL dosyası okunuyor...")
    const fileReader = new FileReader()
    const reader = vtkSTLReader.newInstance()
    readerRef.current = reader

    fileReader.onload = (event) => {
      if (!renderer.current || !renderWindow.current || !event.target?.result) {
        setStatusMessage("Dosya okunurken bir hata oluştu.")
        return
      }

      console.log("Dosya başarıyla okundu. VTK pipeline başlatılıyor...")

      const arrayBuffer = event.target.result as ArrayBuffer
      reader.parseAsArrayBuffer(arrayBuffer)
      const source = reader.getOutputData(0)

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage("Hata: STL dosyası geçersiz veya boş.")
        console.error("Geçersiz STL kaynağı.")
        return
      }
      console.log("STL dosyası başarıyla parse edildi.")

      // Önceki aktörü ve mapper'ı temizle
      if (actorRef.current) {
        renderer.current.removeActor(actorRef.current)
        actorRef.current.delete()
        actorRef.current = null
      }
      if (mapperRef.current) {
        mapperRef.current.delete()
        mapperRef.current = null
      }
      console.log("Önceki aktör ve mapper temizlendi.")

      const mapper = vtkMapper.newInstance({ scalarVisibility: false })
      mapper.setInputData(source)
      mapperRef.current = mapper

      const actor = vtkActor.newInstance()
      actor.setMapper(mapper)
      actor.getProperty().setColor(0.75, 0.75, 0.75) // Gümüş rengi
      actorRef.current = actor

      console.log("Yeni mapper ve aktör oluşturuldu.")

      // Aktörü sahneye ekle
      renderer.current.addActor(actor)
      console.log("Aktör sahneye eklendi. Sahnedeki aktör sayısı:", renderer.current.getActors().length)

      // Kamerayı sıfırla
      renderer.current.resetCamera()
      renderer.current.resetCameraClippingRange()
      console.log("Kamera sıfırlandı. Kamera pozisyonu:", renderer.current.getActiveCamera().getPosition())

      // Son olarak, sahneyi render et
      renderWindow.current.render()
      console.log("Final render çağrıldı. Modelin görünmesi gerekiyor.")

      setStatusMessage("STL dosyası başarıyla yüklendi.")
    }

    fileReader.onerror = () => {
      setStatusMessage("Dosya okunamadı.")
      console.error("FileReader error.")
    }

    fileReader.readAsArrayBuffer(file)

    return () => {
      if (readerRef.current) {
        readerRef.current.delete()
        readerRef.current = null
      }
    }
  }, [file, renderer, renderWindow])

  // Cleanup function
  useEffect(() => {
    return () => {
      clearAllLights()
      clearFloor()
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col relative bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      <div ref={vtkContainerRef} className="w-full h-full flex-grow" style={{ touchAction: "none" }} />
      <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
        {statusMessage}
      </div>
    </div>
  )
}
