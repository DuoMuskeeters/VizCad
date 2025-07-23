import { useRef, useEffect, useState, type RefObject } from "react";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import type { vtkObject } from "@kitware/vtk.js/interfaces";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import { useVtkScene, LightType } from "./scene";
import "@kitware/vtk.js/Rendering/Profiles/Geometry";

interface VtkAppProps {
  file: File | null;
}

export function VtkApp({ file }: VtkAppProps) {
  const vtkContainerRef = useRef<HTMLDivElement>(null);
  const { renderer, renderWindow, setBackground, addLight, resize } =
    useVtkScene(vtkContainerRef);

  const actorRef = useRef<vtkActor | null>(null);
  const mapperRef = useRef<vtkMapper | null>(null);
  const readerRef = useRef<vtkSTLReader | null>(null);

  const [statusMessage, setStatusMessage] = useState<string>(
    "Hazır. Lütfen bir STL dosyası seçin."
  );

  // Sahne başlangıç ayarları (Işıklar, Arka Plan)
  useEffect(() => {
    if (!renderer.current || !addLight || !setBackground) return;

    setBackground([0.2, 0.2, 0.4]);

    addLight(LightType.SCENE_LIGHT, { position: [1, 1, 1], intensity: 1.0 });
    addLight(LightType.SCENE_LIGHT, {
      position: [-1, -0.5, -0.5],
      color: [0.8, 0.8, 1.0],
      intensity: 0.6,
    });
  }, [renderer, addLight, setBackground]);

  // Pencere boyutlandırma yöneticisi
  useEffect(() => {
    if (!resize) return;
    const handleWindowResize = () => resize();
    window.addEventListener("resize", handleWindowResize);
    handleWindowResize(); // İlk boyutu ayarlamak için bir kere çağır

    return () => window.removeEventListener("resize", handleWindowResize);
  }, [resize]);

  // STL Dosyası yükleme mantığı
  useEffect(() => {
    if (!file || !renderer.current || !renderWindow.current) {
      return;
    }

    setStatusMessage("STL dosyası okunuyor...");
    const fileReader = new FileReader();
    const reader = vtkSTLReader.newInstance();
    readerRef.current = reader;

    fileReader.onload = (event) => {
      if (!renderer.current || !renderWindow.current || !event.target?.result) {
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
        renderer.current.removeActor(actorRef.current);
        actorRef.current.delete();
        actorRef.current = null;
      }
      if (mapperRef.current) {
        mapperRef.current.delete();
        mapperRef.current = null;
      }
      console.log("Önceki aktör ve mapper temizlendi.");

      const mapper = vtkMapper.newInstance({ scalarVisibility: false });
      mapper.setInputData(source);
      mapperRef.current = mapper;

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      actor.getProperty().setColor(0.75, 0.75, 0.75); // Gümüş rengi
      actorRef.current = actor;

      console.log("Yeni mapper ve aktör oluşturuldu.");

      // Aktörü sahneye ekle
      renderer.current.addActor(actor);
      console.log(
        "Aktör sahneye eklendi. Sahnedeki aktör sayısı:",
        renderer.current.getActors().length
      );

      // Kamerayı sıfırla
      renderer.current.resetCamera();
      renderer.current.resetCameraClippingRange();
      console.log(
        "Kamera sıfırlandı. Kamera pozisyonu:",
        renderer.current.getActiveCamera().getPosition()
      );

      // Son olarak, sahneyi render et
      renderWindow.current.render();
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
  }, [file, renderer, renderWindow]);

  return (
    <div className="w-full h-full flex flex-col relative bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      <div
        ref={vtkContainerRef}
        className="w-full h-full flex-grow"
        style={{ touchAction: "none" }}
      />
      <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
        {statusMessage}
      </div>
    </div>
  );
}
