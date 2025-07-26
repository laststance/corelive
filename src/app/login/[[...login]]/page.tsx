import { SignIn as Login } from '@clerk/nextjs'

export default function Page() {
  return (
    <div className="grid h-screen place-items-center">
      <Login path="/sign-in" forceRedirectUrl="/home" />
    </div>
  )
}
