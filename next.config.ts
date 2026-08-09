import type { NextConfig } from "next";
import createMDX from '@next/mdx';

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  experimental: {
    // Rust MDX compiler — required for `next dev --turbopack`.
    mdxRs: true,
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
