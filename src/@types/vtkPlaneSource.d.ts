// Type definitions for vtkPlaneSource
declare module "@kitware/vtk.js/Filters/Sources/PlaneSource" {
  const vtkPlaneSource: {
    newInstance: (options?: {
      xResolution?: number
      yResolution?: number
    }) => {
      setOrigin: (x: number, y: number, z: number) => void
      setPoint1: (x: number, y: number, z: number) => void
      setPoint2: (x: number, y: number, z: number) => void
      getOutputPort: () => any
      delete: () => void
    }
  }

  export default vtkPlaneSource
}
