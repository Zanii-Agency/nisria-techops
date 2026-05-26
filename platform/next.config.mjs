/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep the headless-Chrome PDF deps OUT of the webpack bundle. @sparticuz/chromium
    // ships a packed Brotli binary + puppeteer-core uses dynamic requires; bundling
    // them breaks the launch. Marking them external makes Next trace them as raw
    // node_modules on the serverless function (the supported pattern on Vercel).
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  },
};

export default nextConfig;
