import { createFileRoute, redirect } from '@tanstack/react-router'

/** Links of the old app lived at `/shared/<token>` (docs/09 §1.5 step 7, D15); they keep working at `/s/<token>`. */
export const Route = createFileRoute('/shared/$token')({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/s/$token', params: { token: params.token }, replace: true })
  },
})
