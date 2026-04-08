import path from 'node:path';
import { fileURLToPath } from 'node:url';
import withBundleAnalyzer from '@next/bundle-analyzer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env['NODE_ENV'] === 'development';
const appPlatform = process.env['NEXT_PUBLIC_APP_PLATFORM'];

if (isDev) {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev();
}

const exportOutput = appPlatform !== 'web' && !isDev;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Next.js uses SSG instead of SSR
  // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
  output: exportOutput ? 'export' : undefined,
  pageExtensions: exportOutput ? ['jsx', 'tsx'] : ['js', 'jsx', 'ts', 'tsx'],
  // Note: This feature is required to use the Next.js Image component in SSG mode.
  // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  // Configure assetPrefix or else the server won't properly resolve your assets.
  assetPrefix: '',
  reactStrictMode: true,
  serverExternalPackages: [
    'isows',
    '@supabase/supabase-js',
    '@supabase/auth-js',
    '@supabase/postgrest-js',
    '@supabase/realtime-js',
    '@supabase/storage-js',
    '@supabase/functions-js',
    '@tauri-apps/api',
    '@tauri-apps/plugin-cli',
    '@tauri-apps/plugin-deep-link',
    '@tauri-apps/plugin-dialog',
    '@tauri-apps/plugin-fs',
    '@tauri-apps/plugin-haptics',
    '@tauri-apps/plugin-http',
    '@tauri-apps/plugin-log',
    '@tauri-apps/plugin-opener',
    '@tauri-apps/plugin-os',
    '@tauri-apps/plugin-process',
    '@tauri-apps/plugin-shell',
    '@tauri-apps/plugin-updater',
    '@tauri-apps/plugin-websocket',
    'tauri-plugin-device-info-api',
    '@choochmeque/tauri-plugin-sharekit-api',
    '@fabianlars/tauri-plugin-oauth',
    'iso-639-3',
    'terser',
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      nunjucks: 'nunjucks/browser/nunjucks.js',
      '@pdfjs': path.resolve(__dirname, 'public/vendor/pdfjs'),
      '@simplecc': path.resolve(__dirname, 'public/vendor/simplecc'),
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      nunjucks: 'nunjucks/browser/nunjucks.js',
      '@pdfjs/*': './public/vendor/pdfjs/*',
      '@simplecc/*': './public/vendor/simplecc/*',
    },
  },
  transpilePackages: [
    ...(isDev
      ? []
      : [
          'i18next-browser-languagedetector',
          'react-i18next',
          'i18next',
          '@tauri-apps',
          'highlight.js',
          'foliate-js',
          'marked',
        ]),
  ],
  async rewrites() {
    return [
      {
        source: '/reader/:ids',
        destination: '/reader?ids=:ids',
      },
      // Proxy pdf2epub API requests in development to avoid CORS issues
      ...(isDev
        ? [
            {
              source: '/pdf2epub-api/:path*',
              destination: `${process.env['NEXT_PUBLIC_PDF2EPUB_API_URL'] || 'http://localhost:8000'}/api/:path*`,
            },
          ]
        : []),
    ];
  },
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: isDev
              ? 'public, max-age=0, must-revalidate'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withAnalyzer(nextConfig);
