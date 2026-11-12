// This entry point enables the disk-backed development database only on loopback.
process.env.ANALYTICS_LOCAL='1';
process.env.PORT ||= '4174';
if(!process.argv.includes('--no-demo'))await (await import('./analytics/demo.mjs')).seedDemo();
await import('./serve.mjs');
