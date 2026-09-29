import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  // The scorer reads the rubric from disk at runtime; ship it with the server functions.
  outputFileTracingIncludes: {
    "/api/candidates/[id]/score": ["./rubric/**/*"],
  },
};

export default nextConfig;
