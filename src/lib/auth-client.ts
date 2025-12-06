import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// Client-side: use current origin as baseURL
const getBaseURL = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:5173";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    adminClient(), // Admin plugin for user management
  ],
});

// Export commonly used methods for convenience
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  $Infer,
} = authClient;
