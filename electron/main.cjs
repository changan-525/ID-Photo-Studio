const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'idphoto',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const distributionRoot = path.resolve(__dirname, '..', 'dist');

function resolveAsset(requestUrl) {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(distributionRoot, `.${pathname}`);
  if (target !== distributionRoot && !target.startsWith(`${distributionRoot}${path.sep}`))
    return null;
  return target;
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 390,
    minHeight: 650,
    show: false,
    backgroundColor: '#f7f6f2',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://github.com/changan-525/ID-Photo-Studio'))
      void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('idphoto://app/')) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL('idphoto://app/index.html');
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.changan525.idphotostudio');
  Menu.setApplicationMenu(null);
  protocol.handle('idphoto', (request) => {
    const target = resolveAsset(request.url);
    return target
      ? net.fetch(pathToFileURL(target).toString())
      : new Response('Not found', { status: 404 });
  });
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
