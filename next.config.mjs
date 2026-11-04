/** @type {import('next').NextConfig} */
const nextConfig = {
  // WebLLM needs web workers and WebGPU access in browser
  webpack: (config) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    return config;
  },
};

export default nextConfig;