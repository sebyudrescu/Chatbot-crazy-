/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse embeds pdf.js and must run as a native Node dependency. Bundling
  // it into a serverless chunk corrupts PDF parsing in the production runtime.
  serverExternalPackages: ['pdf-parse'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
