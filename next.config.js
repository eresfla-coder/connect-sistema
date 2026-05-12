/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Connect-Version', value: 'v96-estabilidade' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
