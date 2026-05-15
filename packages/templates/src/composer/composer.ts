// packages/templates/src/composer/composer.ts
// ─── Runtime Composition Engine — assembles final deployable app bundle ───

import { createHash } from 'crypto';
import type { AppSpec } from '../types/app-spec.js';
import type { RenderManifest, GeneratedFile } from '../types/render-manifest.js';

export interface BundleResult {
  appId: string;
  tenantId: string;
  files: { path: string; content: string }[];
  prismaSchema: string;
  packageJson: string;
  envVarKeys: string[];
  bundleHash: string;
  composedAt: string;
}

// ─── Main compose function ─────────────────────────────────────────────────────
export function composeBundle(
  spec: AppSpec,
  manifest: RenderManifest
): BundleResult {
  const files: { path: string; content: string }[] = [];

  // 1. All generated files from render manifest
  for (const file of manifest.files) {
    files.push({ path: file.relativePath, content: file.content });
  }

  // 2. Generate next.config.js
  files.push({ path: 'next.config.js', content: generateNextConfig(spec) });

  // 3. Generate package.json for the app
  const packageJson = generateAppPackageJson(spec);
  files.push({ path: 'package.json', content: packageJson });

  // 4. Generate .env.example
  files.push({
    path: '.env.example',
    content: manifest.envVarKeys.map((k) => `${k}=`).join('\n') + '\n',
  });

  // 5. Generate app layout
  files.push({ path: 'app/layout.tsx', content: generateAppLayout(spec) });

  // 6. Generate nav config from pages
  files.push({ path: 'lib/nav.ts', content: generateNavConfig(spec) });

  // 7. Generate Cloudflare Worker entry for edge runtime
  files.push({ path: 'worker/index.ts', content: generateCFWorker(spec) });

  // Compute bundle hash from all file contents
  const bundleHash = createHash('sha256')
    .update(files.map((f) => f.content).join(''))
    .digest('hex')
    .slice(0, 16);

  return {
    appId: spec.id,
    tenantId: spec.tenantId,
    files,
    prismaSchema: manifest.prismaSchema,
    packageJson,
    envVarKeys: manifest.envVarKeys,
    bundleHash,
    composedAt: new Date().toISOString(),
  };
}

// ─── next.config.js ───────────────────────────────────────────────────────────
function generateNextConfig(spec: AppSpec): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  env: {
    APP_NAME: '${spec.name}',
    APP_SLUG: '${spec.slug}',
    TENANT_ID: '${spec.tenantId}',
  },
};

module.exports = nextConfig;
`;
}

// ─── App package.json ─────────────────────────────────────────────────────────
function generateAppPackageJson(spec: AppSpec): string {
  const pkg = {
    name: spec.slug,
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'prisma generate && next build',
      start: 'next start',
      'db:push': 'prisma db push',
      'db:migrate': 'prisma migrate deploy',
    },
    dependencies: {
      next: '^14.2.0',
      react: '^18.3.0',
      'react-dom': '^18.3.0',
      '@prisma/client': '^5.14.0',
      '@clerk/nextjs': '^5.1.0',
      zod: '^3.23.0',
      'react-hook-form': '^7.51.0',
      '@hookform/resolvers': '^3.4.0',
    },
    devDependencies: {
      prisma: '^5.14.0',
      typescript: '^5.4.0',
      '@types/react': '^18.3.0',
      '@types/node': '^20.0.0',
    },
  };
  return JSON.stringify(pkg, null, 2);
}

// ─── App layout ───────────────────────────────────────────────────────────────
function generateAppLayout(spec: AppSpec): string {
  return `import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${spec.name}',
  description: '${spec.description ?? spec.name} — powered by OneAtlas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
`;
}

// ─── Nav config from pages ────────────────────────────────────────────────────
function generateNavConfig(spec: AppSpec): string {
  const navItems = spec.pages
    .filter((p) => p.pageType === 'list' || p.pageType === 'dashboard')
    .map((p) => `  { label: '${p.title}', href: '${p.path}', icon: '${p.icon ?? 'grid'}' }`)
    .join(',\n');

  return `export const NAV_ITEMS = [
${navItems}
] as const;

export type NavItem = typeof NAV_ITEMS[number];
`;
}

// ─── Cloudflare Worker entry ──────────────────────────────────────────────────
function generateCFWorker(spec: AppSpec): string {
  return `// Auto-generated Cloudflare Worker entry for ${spec.name}
// Handles edge routing, tenant resolution, and RBAC

export interface Env {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  UPSTASH_REDIS_URL?: string;
  UPSTASH_REDIS_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Extract tenant from subdomain: {slug}.oneatlas.app
    const subdomain = url.hostname.split('.')[0];
    const tenantSlug = subdomain ?? '${spec.slug}';

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, app: '${spec.name}', tenant: tenantSlug }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward to Next.js pages function (set by CF Pages)
    return new Response('Not Found', { status: 404 });
  },
};
`;
}

// ─── Serialize manifest to JSON (for storage) ─────────────────────────────────
export function serializeManifest(manifest: RenderManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function deserializeManifest(json: string): RenderManifest {
  return JSON.parse(json) as RenderManifest;
}
