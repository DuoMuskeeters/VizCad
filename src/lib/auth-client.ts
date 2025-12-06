import { createAuthClient } from "better-auth/react";

// Client-side: use current origin as baseURL
const getBaseURL = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:5173";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

// Export commonly used methods for convenience
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  $Infer,
} = authClient;
