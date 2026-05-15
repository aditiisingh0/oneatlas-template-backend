// packages/templates/src/deployment/index.ts
// ─── Deployment Engine — bundles and deploys apps to Cloudflare Pages ───

import type { BundleResult } from '../composer/composer.js';

export type DeploymentStatus = 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'rolled_back';

export interface DeploymentRecord {
  deploymentId: string;
  appId: string;
  tenantId: string;
  slug: string;
  url: string;
  status: DeploymentStatus;
  bundleHash: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  cfDeploymentId?: string;
  cfProjectName?: string;
}

export interface DeployRequest {
  appId: string;
  tenantId: string;
  slug: string;
  bundle: BundleResult;
  cfAccountId: string;
  cfApiToken: string;
  baseDomain?: string;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  status: DeploymentStatus;
  cfDeploymentId?: string;
}

// ─── Deployment Engine ────────────────────────────────────────────────────────
export class DeploymentEngine {
  private deployments = new Map<string, DeploymentRecord>();
  private baseDomain: string;

  constructor(options?: { baseDomain?: string }) {
    this.baseDomain = options?.baseDomain ?? 'oneatlas.app';
  }

  async deploy(req: DeployRequest): Promise<DeployResult> {
    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://${req.slug}.${this.baseDomain}`;
    const version = this.getNextVersion(req.appId);

    const record: DeploymentRecord = {
      deploymentId,
      appId: req.appId,
      tenantId: req.tenantId,
      slug: req.slug,
      url,
      status: 'queued',
      bundleHash: req.bundle.bundleHash,
      version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.deployments.set(deploymentId, record);

    // Run async deployment pipeline
    this.runDeploymentPipeline(deploymentId, req).catch((err) => {
      this.updateStatus(deploymentId, 'failed', String(err));
    });

    return { deploymentId, url, status: 'queued' };
  }

  private async runDeploymentPipeline(deploymentId: string, req: DeployRequest): Promise<void> {
    try {
      this.updateStatus(deploymentId, 'building');

      // Step 1: Build the bundle using esbuild
      const buildOutput = await this.buildBundle(req.bundle);

      this.updateStatus(deploymentId, 'deploying');

      // Step 2: Deploy to Cloudflare Pages
      const cfResult = await this.deployToCloudflare({
        projectName: `oneatlas-${req.slug}`,
        accountId: req.cfAccountId,
        apiToken: req.cfApiToken,
        files: buildOutput.files,
      });

      // Step 3: Update record with CF deployment ID
      const record = this.deployments.get(deploymentId)!;
      this.deployments.set(deploymentId, {
        ...record,
        status: 'live',
        cfDeploymentId: cfResult.id,
        cfProjectName: cfResult.projectName,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.updateStatus(deploymentId, 'failed', String(err));
    }
  }

  private async buildBundle(
    bundle: BundleResult
  ): Promise<{ files: { path: string; content: string }[] }> {
    // In production: run esbuild here
    // For now, return the bundle files as-is
    return { files: bundle.files };
  }

  private async deployToCloudflare(params: {
    projectName: string;
    accountId: string;
    apiToken: string;
    files: { path: string; content: string }[];
  }): Promise<{ id: string; projectName: string; url: string }> {
    // Create FormData with all files for CF Pages Direct Upload
    const formData = new FormData();

    const manifest: Record<string, string> = {};
    for (const file of params.files) {
      const hash = await sha256Hex(file.content);
      manifest[`/${file.path}`] = hash;
      formData.append(hash, new Blob([file.content]), file.path);
    }
    formData.append('manifest', JSON.stringify(manifest));

    // Upload to CF Pages
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${params.accountId}/pages/projects/${params.projectName}/deployments`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.apiToken}` },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CF deployment failed: ${response.status} ${errorBody}`);
    }

    const result = await response.json() as { result: { id: string } };
    return {
      id: result.result.id,
      projectName: params.projectName,
      url: `https://${params.projectName}.pages.dev`,
    };
  }

  async getDeployment(deploymentId: string): Promise<DeploymentRecord | null> {
    return this.deployments.get(deploymentId) ?? null;
  }

  async listDeployments(appId: string): Promise<DeploymentRecord[]> {
    return [...this.deployments.values()]
      .filter((d) => d.appId === appId)
      .sort((a, b) => b.version - a.version);
  }

  async rollback(appId: string, targetVersion: number): Promise<DeployResult | null> {
    const deployments = await this.listDeployments(appId);
    const target = deployments.find((d) => d.version === targetVersion && d.status === 'live');
    if (!target) return null;

    // Mark current live as rolled_back
    const current = deployments.find((d) => d.status === 'live' && d.version > targetVersion);
    if (current) this.updateStatus(current.deploymentId, 'rolled_back');

    return { deploymentId: target.deploymentId, url: target.url, status: 'live' };
  }

  private updateStatus(deploymentId: string, status: DeploymentStatus, error?: string): void {
    const record = this.deployments.get(deploymentId);
    if (!record) return;
    const updated: DeploymentRecord = { ...record, status, updatedAt: new Date().toISOString() };
    if (error !== undefined) {
      updated.error = error;
    }
    this.deployments.set(deploymentId, updated);
  }

  private getNextVersion(appId: string): number {
    const existing = [...this.deployments.values()].filter((d) => d.appId === appId);
    return existing.length === 0 ? 1 : Math.max(...existing.map((d) => d.version)) + 1;
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────────
async function sha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const deploymentEngine = new DeploymentEngine();