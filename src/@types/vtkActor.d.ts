// Type definitions for vtkActor
declare module '@kitware/vtk.js/Rendering/Core/Actor' {
  const vtkActor: {
    newInstance: () => {
      setMapper: (mapper: any) => void;
      getProperty: () => {
        setColor: (r: number, g: number, b: number) => void;
        setEdgeVisibility: (visible: boolean) => void;
      };
      delete: () => void;
    };
  };
  
  export default vtkActor;
}
