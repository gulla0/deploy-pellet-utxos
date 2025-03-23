/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    }
    return config
  },
  // Add redirects for the root path
  async redirects() {
    return [
      {
        source: '/',
        destination: '/deploy-pellets',
        permanent: true,
      },
    ]
  }
}

module.exports = nextConfig 