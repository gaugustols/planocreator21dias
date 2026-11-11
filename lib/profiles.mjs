export const profiles = {
  it: {
    id: 'it', origin: 'https://piano-ugc.pages.dev/', aliases: ['piano-ugc.com'],
    sourceRoot: 'site', siteRoot: 'site', reportDir: 'reports', basePath: '/',
    capturePrefix: 'capture_', storagePrefix: 'ugc-', exclude: ['br'],
    closeLabel: 'Chiudi', backLabel: 'Indietro', heading: 'Piano UGC', lang: 'it',
    withdrawal: '/recesso/', nameTest: 'Recuperacao',
  },
  br: {
    id: 'br', origin: 'https://trilha-ugc.pages.dev/', aliases: [],
    sourceRoot: 'recovered/br', siteRoot: 'site/br', reportDir: 'reports/br', basePath: '/br/',
    capturePrefix: 'capture_br_', storagePrefix: 'ugc-br-', exclude: [],
    closeLabel: 'Fechar', backLabel: 'Voltar', heading: 'Trilha UGC', lang: 'pt-BR',
    withdrawal: '/arrependimento/', nameTest: 'Recuperacao',
  },
};

export function getProfile() {
  const id = process.argv.find(a => a.startsWith('--locale='))?.split('=')[1] || 'it';
  if (!Object.hasOwn(profiles, id)) throw new Error(`Unknown recovery locale: ${id}`);
  return profiles[id];
}
