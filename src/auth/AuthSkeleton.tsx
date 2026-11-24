/**
 * What the server sends for the auth pages (they render in the browser): the same column as AuthLayout (header height,
 * 400px form column) with quiet placeholder bars, so the first paint is not blank on a phone. Static: no i18n, no state.
 */
const Bar = ({ className }: { className: string }) => <div className={`rounded-md bg-surface ${className}`} />

export const AuthSkeleton = () => (
  <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-bg min-[960px]:grid-cols-2" aria-busy="true">
    <div className="hidden border-r border-line bg-surface min-[960px]:block" />
    <div className="flex min-w-0 flex-col">
      <div className="h-15" />
      <div className="mx-auto grid w-full max-w-100 gap-4 px-4 pb-10 pt-5 min-[960px]:m-auto min-[960px]:px-6 min-[960px]:pt-6">
        <Bar className="h-8 w-2/3" />
        <Bar className="h-5 w-full" />
        <Bar className="h-12 w-full" />
        <Bar className="h-12 w-full" />
        <Bar className="h-12 w-full" />
      </div>
    </div>
  </div>
)
