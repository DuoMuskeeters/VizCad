// Type definitions for vtkLight
declare module '@kitware/vtk.js/Rendering/Core/Light' {
  const vtkLight: {
    newInstance: () => {
      setLightTypeToHeadLight: () => void;
      setLightTypeToCameraLight: () => void;
      setLightTypeToSceneLight: () => void;
      setPosition: (x: number, y: number, z: number) => void;
      setFocalPoint: (x: number, y: number, z: number) => void;
      setColor: (r: number, g: number, b: number) => void;
      setIntensity: (intensity: number) => void;
      setPositional: (positional: boolean) => void;
      setConeAngle: (angle: number) => void;
    };
  };
  
  export default vtkLight;
}
