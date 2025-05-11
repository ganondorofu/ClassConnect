
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Disable Image Optimization for static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    // Fix for "Module not found: Can't resolve 'fs'", 'tls', 'net' errors
    // These are Node.js built-in modules not available in the browser.
    // Genkit and its dependencies might try to import them.
    // We mark them as external for the client bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        tls: false,
        net: false,
        child_process: false, // Often a dependency of server-side packages
        module: false, // Sometimes needed for similar reasons
      };
    }

    // To silence Critical dependency warnings from OpenTelemetry.
    // These warnings are often related to dynamic requires in server-side code
    // that Webpack can't statically analyze for client bundles.
    // This assumes that OpenTelemetry is intended for server-side use and
    // won't be active on the client.
    config.plugins.push(
      new webpack.ContextReplacementPlugin(
        /@opentelemetry\/instrumentation/,
        (data: any) => {
          for (const dependency of data.dependencies) {
            if (dependency.request === './platform/node/instrumentation') {
              dependency.critical = false;
            }
          }
          return data;
        }
      )
    );
    
    // For @opentelemetry/exporter-jaeger
    // This is often a server-side only exporter.
    config.externals = config.externals || [];
    if (typeof config.externals[0] === 'function') {
        const originalExternal = config.externals[0];
        config.externals[0] = async (ctx: any) => {
            if (ctx.request === '@opentelemetry/exporter-jaeger') {
                return `module {}`; // or handle as commonjs external
            }
            return originalExternal(ctx);
        };
    } else {
        config.externals.push(async (ctx: any) => {
             if (ctx.request === '@opentelemetry/exporter-jaeger') {
                return `module {}`;
            }
            return undefined;
        });
    }


    // Handlebars require.extensions warning - typically for server-side.
    // This is less critical than module not found errors but good to address if possible.
    // No straightforward webpack config for this specific warning without loaders.
    // Ensuring Handlebars/dotprompt are only used server-side (via API routes) is key.

    return config;
  },
};

export default nextConfig;
