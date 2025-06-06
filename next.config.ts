// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure the API routes are available in production
  experimental: {
    serverComponentsExternalPackages: []
  },
  // Add health check route for production monitoring
  async rewrites() {
    return [
      {
        source: '/health',
        destination: '/api/monitor'
      }
    ];
  }
}

module.exports = nextConfig