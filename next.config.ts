
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // output: 'export', // Commented out or removed to enable server-side API routes
  images: {
    unoptimized: true, 
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
    // These are Node.js built-in modules not available in the browser for client-side bundles.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        tls: false,
        net: false,
        child_process: false, 
        module: false, 
        async_hooks: false, 
      };
    }

    // To silence Critical dependency warnings from OpenTelemetry.
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
    config.externals = config.externals || [];
    const handleExternals = async (ctx: any, originalExternal?: (ctx: any) => Promise<any>) => {
        if (ctx.request === '@opentelemetry/exporter-jaeger') {
            return `module {}`; 
        }
        if (originalExternal) {
            return originalExternal(ctx);
        }
        return undefined;
    };

    if (typeof config.externals[0] === 'function') {
        const originalExternal = config.externals[0];
        config.externals[0] = (ctx: any) => handleExternals(ctx, originalExternal);
    } else {
        config.externals.push((ctx: any) => handleExternals(ctx));
    }

    return config;
  },
};

export default nextConfig;
