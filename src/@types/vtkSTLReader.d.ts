// Type definitions for STL Reader
declare module '@kitware/vtk.js/IO/Geometry/STLReader' {
  const vtkSTLReader: {
    newInstance: () => {
      parseAsArrayBuffer: (arrayBuffer: ArrayBuffer) => void;
      getOutputData: (port: number) => any;
    };
  };
  
  export default vtkSTLReader;
}
