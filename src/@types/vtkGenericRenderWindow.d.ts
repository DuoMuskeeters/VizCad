// Type definitions for vtkGenericRenderWindow
declare module '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow' {
  const vtkGenericRenderWindow: {
    newInstance: (options?: { background?: [number, number, number] }) => {
      setContainer: (container: HTMLElement) => void;
      getRenderer: () => any;
      getRenderWindow: () => any;
    };
  };
  
  export default vtkGenericRenderWindow;
}
