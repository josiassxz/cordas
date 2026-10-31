import { createApp } from './core/ctx.js';
import { startShell } from './shell.js';
import { loadViews } from './views/index.js';

const app = createApp();
window.corda = app; // depuração no console
startShell(app, await loadViews());
