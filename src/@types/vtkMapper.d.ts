// Type definitions for vtkMapper
declare module '@kitware/vtk.js/Rendering/Core/Mapper' {
  const vtkMapper: {
    newInstance: (options?: { scalarVisibility?: boolean }) => {
      setInputData: (data: any) => void;
      setInputConnection: (connection: any) => void;
      delete: () => void;
    };
  };
  
  export default vtkMapper;
}
