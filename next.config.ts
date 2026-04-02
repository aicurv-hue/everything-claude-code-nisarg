/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dramatically reduces bundle size — lucide-react ships ~500 icons, only import what's used
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.licdn.com" },          // LinkedIn profile photos
      { protocol: "https", hostname: "*.licdn.com" },              // LinkedIn CDN variants
      { protocol: "https", hostname: "storage.googleapis.com" },   // Firebase Storage
      { protocol: "https", hostname: "fal.media" },                // Fal.ai generated images
      { protocol: "https", hostname: "*.fal.media" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Strip X-Powered-By header
  poweredByHeader: false,

  // Enable compression
  compress: true,
};

export default nextConfig;
