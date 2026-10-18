import { startRender } from '../staging-deploy/render-server.mjs';
try { startRender(); } catch { console.error('Staging configuration rejected.'); process.exitCode=1; }
