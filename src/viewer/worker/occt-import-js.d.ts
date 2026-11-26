/** occt-import-js ships no types; the shape we use is `Occt` in formats/step.ts. */
declare module 'occt-import-js' {
  const factory: (options?: { locateFile?: (path: string) => string }) => Promise<unknown>
  export default factory
}
