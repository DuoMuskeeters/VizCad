import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource";
import type vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import type vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import { useEffect, useRef, useState } from "react";

interface VTKContext {
  fullScreenRenderWindow: vtkFullScreenRenderWindow;
  renderer: vtkRenderer;
  renderWindow: vtkRenderWindow;
  coneSource: vtkConeSource;
  actor: vtkActor;
  mapper: vtkMapper;
}

export function VtkApp() {
  const vtkContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<VTKContext | null>(null);
  const [coneResolution, setConeResolution] = useState<number>(6);
  const [representation, setRepresentation] = useState<number>(2);

  useEffect(() => {
    if (!context.current && vtkContainerRef.current) {
      if (vtkContainerRef.current.innerHTML) {
        vtkContainerRef.current.innerHTML = "";
      }

      // Create full screen render window
      const fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance();

      // Add the container to our div
      const container = fullScreenRenderWindow.getContainer();
      vtkContainerRef.current.appendChild(container);

      const coneSource = vtkConeSource.newInstance({});

      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(coneSource.getOutputPort());

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      const renderer = fullScreenRenderWindow.getRenderer();
      const renderWindow = fullScreenRenderWindow.getRenderWindow();

      renderer.addActor(actor);
      renderer.resetCamera();
      renderWindow.render();

      context.current = {
        fullScreenRenderWindow,
        renderWindow,
        renderer,
        coneSource,
        actor,
        mapper,
      };
    }

    return () => {
      if (context.current) {
        const { fullScreenRenderWindow, coneSource, actor, mapper } =
          context.current;
        actor.delete();
        mapper.delete();
        coneSource.delete();
        fullScreenRenderWindow.delete();
        context.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (context.current) {
      const { coneSource, renderWindow } = context.current;
      coneSource.setResolution(coneResolution);
      renderWindow.render();
    }
  }, [coneResolution]);

  useEffect(() => {
    if (context.current) {
      const { actor, renderWindow } = context.current;
      actor.getProperty().setRepresentation(representation);
      renderWindow.render();
    }
  }, [representation]);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div ref={vtkContainerRef} style={{ width: "100%", height: "100%" }} />
      <table
        style={{
          position: "absolute",
          top: "25px",
          left: "25px",
          background: "white",
          padding: "12px",
          borderRadius: "4px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        }}
      >
        <tbody>
          <tr>
            <td>
              <label
                htmlFor="rendering-style"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: "bold",
                }}
              >
                Rendering Style:
              </label>
              <select
                id="rendering-style"
                value={representation}
                style={{ width: "100%", padding: "5px" }}
                onChange={(ev) => setRepresentation(Number(ev.target.value))}
              >
                <option value="0">Points</option>
                <option value="1">Wireframe</option>
                <option value="2">Surface</option>
              </select>
            </td>
          </tr>
          <tr>
            <td>
              <label
                htmlFor="cone-resolution"
                style={{
                  display: "block",
                  marginTop: "15px",
                  marginBottom: "6px",
                  fontWeight: "bold",
                }}
              >
                Resolution: {coneResolution}
              </label>
              <input
                id="cone-resolution"
                type="range"
                min="4"
                max="80"
                value={coneResolution}
                onChange={(ev) => setConeResolution(Number(ev.target.value))}
                style={{ width: "100%" }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
