import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve Firebase's auth handler from our own origin so the sign-in popup
  // shares sessionStorage with the app. With authDomain on firebaseapp.com,
  // browsers that partition storage (iOS in-app browsers, Safari) fail with
  // "missing initial state".
  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
