import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent hashconnect / @hashgraph/sdk variable name collisions
      // during production minification
      config.optimization = {
        ...config.optimization,
        minimizer: config.optimization?.minimizer?.map((plugin: any) => {
          if (plugin.constructor.name === "TerserPlugin") {
            plugin.options.minimizer.options.mangle = {
              ...plugin.options.minimizer.options.mangle,
              reserved: ["n", "e", "t", "r", "o", "i"],
            };
          }
          return plugin;
        }),
      };

      // Put hashconnect in its own chunk to avoid variable collisions
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          hashconnect: {
            test: /[\\/]node_modules[\\/](hashconnect|@hashgraph)[\\/]/,
            name: "hashconnect-vendor",
            chunks: "all",
            priority: 20,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
