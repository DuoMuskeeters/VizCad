import { useRef, useEffect, useState } from "react";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";

import vtkPolyDataNormals from "@kitware/vtk.js/Filters/Core/PolyDataNormals";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";

import "@kitware/vtk.js/Rendering/Profiles/Geometry";

interface VtkAppProps {
  file: File | null;
}

export function VtkApp({ file }: VtkAppProps) {
  const vtkContainerRef = useRef<HTMLDivElement>(null);

  // VTK objelerini ref ile sakla
  const renderWindowRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const actorRef = useRef<any>(null);
  const mapperRef = useRef<any>(null);

  const [statusMessage, setStatusMessage] = useState<string>("Hazır");

  // Sadece bir kez sahne oluştur
  useEffect(() => {
    if (vtkContainerRef.current && !renderWindowRef.current) {
      const genericRenderWindow = vtkGenericRenderWindow.newInstance({
        //   background: [0.2, 0.2, 0.4],
      });
      genericRenderWindow.setContainer(vtkContainerRef.current);

      rendererRef.current = genericRenderWindow.getRenderer();
      renderWindowRef.current = genericRenderWindow.getRenderWindow();

      // --- Işık ekle ---
      const light = vtkLight.newInstance();
      light.setLightTypeToSceneLight();
      light.setPosition(1, 1, 1);
      light.setFocalPoint(0, 0, 0);
      light.setColor(1, 1, 1);
      light.setIntensity(1.0);
      rendererRef.current.addLight(light);
    }
  }, []);

  // Dosya değiştiğinde STL dosyasını oku ve sahneye ekle
  useEffect(() => {
    if (!file || !rendererRef.current || !renderWindowRef.current) return;

    setStatusMessage("STL dosyası yükleniyor...");
    const reader = vtkSTLReader.newInstance();
    const fileReader = new FileReader();

    fileReader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      reader.parseAsArrayBuffer(arrayBuffer);
      const source = reader.getOutputData(0);

      if (!source || source.getPoints().getNumberOfPoints() === 0) {
        setStatusMessage("STL dosyası geçerli değil.");
        return;
      }

      // Önceki aktör ve mapper varsa sil
      if (actorRef.current) {
        rendererRef.current.removeActor(actorRef.current);
        actorRef.current.delete();
        actorRef.current = null;
      }
      if (mapperRef.current) {
        mapperRef.current.delete();
        mapperRef.current = null;
      }

      // Normalleri hesapla
      const normals = vtkPolyDataNormals.newInstance();
      normals.setInputData(source);
      normals.update();
      const normalOutput = normals.getOutputData();

      // Yeni mapper ve aktör oluştur

      const mapper = vtkMapper.newInstance({ scalarVisibility: false });
      mapper.setInputData(normalOutput);

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      // Gümüş renk: RGB yaklaşık (0.75, 0.75, 0.75)
      actor.getProperty().setColor(0.75, 0.75, 0.75); // Gümüş
      actor.getProperty().setEdgeVisibility(false);

      rendererRef.current.removeAllViewProps();
      rendererRef.current.addActor(actor);
      rendererRef.current.resetCamera();
      rendererRef.current.resetCameraClippingRange();
      // Kamera biraz yakınlaştır
      if (rendererRef.current.getActiveCamera) {
        const camera = rendererRef.current.getActiveCamera();
        if (camera && camera.zoom) camera.zoom(1.2);
      }
      renderWindowRef.current.render();
      // STL yükleme ve render işlemlerinden hemen sonra ekle:
      if (renderWindowRef.current && vtkContainerRef.current) {
        renderWindowRef.current.resize();
      }
      // Yeni referansları kaydet
      actorRef.current = actor;
      mapperRef.current = mapper;

      setStatusMessage("STL dosyası başarıyla yüklendi.");
    };

    fileReader.readAsArrayBuffer(file);
  }, [file]);

  return (
    <div className="w-full h-full flex flex-col relative bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
      <div ref={vtkContainerRef} className="w-full h-full flex-grow" />
      <div className="absolute bottom-0 left-0 w-full bg-gray-50/80 backdrop-blur-sm text-gray-800 text-xs px-3 py-1 border-t border-gray-200">
        {statusMessage}
      </div>
    </div>
  );
}
