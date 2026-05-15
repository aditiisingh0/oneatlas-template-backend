// packages/templates/src/preview/html-renderer.ts
// Renders HTML page shells for preview sessions.
// Pages are static shells that fetch data from the mock API at runtime.

import type { PreviewSession } from './index.js';

export interface RenderedPage {
  html: string;
  statusCode: number;
}

// Entry point — routes a URL path to the correct page renderer
export function renderPreviewPage(
  session: PreviewSession,
  urlPath: string,
  basePreviewUrl: string
): RenderedPage {
  // Strip query string
  const path = urlPath.split('?')[0] ?? '/';

  // Home / root → redirect to first entity list
  if (path === '/' || path === '') {
    const firstEntity = Object.keys(session.mockState)[0];
    if (firstEntity) {
      return redirect(`/${firstEntity}`);
    }
    return renderEmptyState(session);
  }

  // Detail page: /{entity}/{id}
  const detailMatch = path.match(/^\/([a-z_]+)\/([^/]+)$/);
  if (detailMatch) {
    const [, entityKey, id] = detailMatch;
    return renderDetailPage(session, entityKey!, id!, basePreviewUrl);
  }

  // List page: /{entity}
  const listMatch = path.match(/^\/([a-z_]+)$/);
  if (listMatch) {
    const [, entityKey] = listMatch;
    return renderListPage(session, entityKey!, basePreviewUrl);
  }

  return render404();
}

// List page — shows a table of all mock rows for an entity
function renderListPage(
  session: PreviewSession,
  entityKey: string,
  basePreviewUrl: string
): RenderedPage {
  const rows = session.mockState[entityKey];
  if (!rows) return render404();

  const entityLabel = toLabel(entityKey);
  const entityLinks = buildEntityNav(session, basePreviewUrl, entityKey);
  const columns = rows.length > 0 ? Object.keys(rows[0] as object) : ['id', 'name', 'createdAt'];

  const tableHeaders = columns
    .map((col) => `<th>${toLabel(col)}</th>`)
    .join('');

  const tableRows = (rows as Record<string, unknown>[])
    .map((row) => {
      const cells = columns
        .map((col) => {
          const val = row[col];
          const display = val instanceof Date ? val.toLocaleString() : String(val ?? '');
          if (col === 'id') {
            return `<td><a href="${basePreviewUrl}/${entityKey}/${display}" class="id-link">${display.slice(0, 8)}…</a></td>`;
          }
          return `<td>${display}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = pageShell({
    title: entityLabel,
    entityLinks,
    body: `
      <div class="page-header">
        <h1>${entityLabel}</h1>
        <span class="badge">${rows.length} records</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl,
  });

  return { html, statusCode: 200 };
}

// Detail page — shows all fields of a single mock row
function renderDetailPage(
  session: PreviewSession,
  entityKey: string,
  id: string,
  basePreviewUrl: string
): RenderedPage {
  const rows = session.mockState[entityKey] as Record<string, unknown>[] | undefined;
  if (!rows) return render404();

  const row = rows.find((r) => r['id'] === id);
  if (!row) return render404();

  const entityLabel = toLabel(entityKey);
  const entityLinks = buildEntityNav(session, basePreviewUrl, entityKey);

  const fields = Object.entries(row)
    .map(([key, val]) => {
      const display = val instanceof Date ? val.toLocaleString() : String(val ?? '');
      return `
        <div class="field-row">
          <label>${toLabel(key)}</label>
          <span>${display}</span>
        </div>`;
    })
    .join('');

  const html = pageShell({
    title: `${entityLabel} Detail`,
    entityLinks,
    body: `
      <div class="page-header">
        <a href="${basePreviewUrl}/${entityKey}" class="back-link">← Back to ${entityLabel}</a>
        <h1>${entityLabel} <span class="id-badge">${id.slice(0, 8)}…</span></h1>
      </div>
      <div class="detail-card">
        ${fields}
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl,
  });

  return { html, statusCode: 200 };
}

function renderEmptyState(session: PreviewSession): RenderedPage {
  const html = pageShell({
    title: 'Preview',
    entityLinks: '',
    body: `
      <div class="empty-state">
        <p>No entities found in this preview session.</p>
        <code>${session.previewId}</code>
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl: '',
  });
  return { html, statusCode: 200 };
}

function render404(): RenderedPage {
  return {
    html: `<!DOCTYPE html><html><body><h1>404 — Page not found</h1></body></html>`,
    statusCode: 404,
  };
}

function redirect(location: string): RenderedPage {
  return {
    html: `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${location}"></head><body>Redirecting…</body></html>`,
    statusCode: 302,
  };
}

// Shared HTML shell with inline CSS and nav
interface ShellOptions {
  title: string;
  entityLinks: string;
  body: string;
  previewId: string;
  basePreviewUrl: string;
}

function pageShell(opts: ShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title} — OneAtlas Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; display: flex; min-height: 100vh; }
    nav { width: 220px; background: #18181b; color: #fff; padding: 24px 16px; flex-shrink: 0; }
    nav .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #a1a1aa; text-transform: uppercase; margin-bottom: 24px; }
    nav a { display: block; padding: 8px 12px; border-radius: 6px; color: #e4e4e7; text-decoration: none; font-size: 14px; margin-bottom: 4px; }
    nav a:hover, nav a.active { background: #27272a; color: #fff; }
    main { flex: 1; padding: 32px; overflow: auto; }
    .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .page-header h1 { font-size: 22px; font-weight: 700; }
    .badge { background: #e4e4e7; border-radius: 999px; padding: 2px 10px; font-size: 12px; color: #52525b; }
    .table-wrap { background: #fff; border-radius: 10px; border: 1px solid #e4e4e7; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e4e4e7; background: #fafafa; }
    tbody tr:hover { background: #f9f9fb; }
    tbody td { padding: 12px 16px; border-bottom: 1px solid #f4f4f5; }
    tbody tr:last-child td { border-bottom: none; }
    a.id-link { color: #6366f1; text-decoration: none; font-family: monospace; font-size: 13px; }
    a.id-link:hover { text-decoration: underline; }
    .detail-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 24px; max-width: 640px; }
    .field-row { display: flex; gap: 16px; padding: 10px 0; border-bottom: 1px solid #f4f4f5; align-items: baseline; }
    .field-row:last-child { border-bottom: none; }
    .field-row label { width: 160px; flex-shrink: 0; font-size: 12px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .field-row span { font-size: 14px; color: #18181b; word-break: break-all; }
    .back-link { font-size: 13px; color: #6366f1; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .id-badge { font-family: monospace; font-size: 14px; color: #6366f1; }
    .empty-state { text-align: center; padding: 80px 24px; color: #71717a; }
    .empty-state code { display: block; margin-top: 12px; font-family: monospace; font-size: 12px; }
    .preview-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #6366f1; color: #fff; font-size: 12px; padding: 6px 16px; display: flex; align-items: center; gap: 8px; z-index: 999; }
    .preview-bar code { font-family: monospace; opacity: 0.85; }
  </style>
</head>
<body>
  <nav>
    <div class="logo">OneAtlas Preview</div>
    ${opts.entityLinks}
  </nav>
  <main>
    ${opts.body}
  </main>
  <div class="preview-bar">
    <span>Preview mode</span>
    <code>${opts.previewId}</code>
  </div>
</body>
</html>`;
}

// Build sidebar nav links for all entities in the session
function buildEntityNav(
  session: PreviewSession,
  basePreviewUrl: string,
  activeEntity: string
): string {
  return Object.keys(session.mockState)
    .map((key) => {
      const active = key === activeEntity ? ' class="active"' : '';
      return `<a href="${basePreviewUrl}/${key}"${active}>${toLabel(key)}</a>`;
    })
    .join('');
}

// Convert snake_case key to Title Case label
function toLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
