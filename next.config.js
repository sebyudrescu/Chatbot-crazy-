/** @type {import('next').NextConfig} */
const { withWorkflow } = require('workflow/next')

const nextConfig = {
  // pdf-parse ships PDF.js as native Node-targeted ESM/CJS entry points.
  // Keeping the whole parser external avoids Webpack rewriting pdfjs-dist in
  // development and lets Vercel trace its canvas runtime dependencies.
  serverExternalPackages: ['@napi-rs/canvas', 'pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
}

module.exports = withWorkflow(nextConfig)
