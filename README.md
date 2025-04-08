# chrome-extension-fetch

A lightweight, dependency-free utility that downloads Chrome extension CRX files from the Chrome Web Store, converts them into ZIP files, and saves them into an organized folder. This package was created specifically for [Peersky Browser](https://github.com/p2plabsxyz/peersky-browser) to allow users to directly input extension URLs instead of manually handling ZIP files or GitHub releases.

## Installation
```bash
npm install chrome-extension-fetch
```
Or
``` bash
npx chrome-extension-fetch 
```

## Usage
### As a Module (ES Modules)
```js
import { fetchExtensionZip } from 'chrome-extension-fetch';

(async () => {
  try {
    const { crxPath, zipPath } = await fetchExtensionZip(
      'https://chrome.google.com/webstore/detail/dscan-decentralized-qr-co/idpfgkgogjjgklefnkjdpghkifbjenap',
      {
        chromeVersion: '114.0.5735.133', // Optional: defaults to this version if not provided.
        outputDir: 'extensions' // Optional: defaults to "extensions"
      }
    );
    console.log('CRX saved at:', crxPath);
    console.log('ZIP saved at:', zipPath);
  } catch (error) {
    console.error('Failed to fetch extension:', error.message);
  }
})();
```

### From the Command Line

```bash
node index.js "https://chrome.google.com/webstore/detail/dscan-decentralized-qr-co/idpfgkgogjjgklefnkjdpghkifbjenap"
```

### Output
```bash
node index.js "https://chrome.google.com/webstore/detail/dscan-decentralized-qr-co/idpfgkgogjjgklefnkjdpghkifbjenap"

==> Downloading extension: dscan-decentralized-qr-co (ID: idpfgkgogjjgklefnkjdpghkifbjenap)
==> Using Chrome version: 114.0.5735.133
Attempting CRX download from: https://clients2.google.com/service/update2/crx?response=redirect&prodversion=114.0.5735.133&acceptformat=crx2,crx3&x=id%3Didpfgkgogjjgklefnkjdpghkifbjenap%26uc
CRX file saved to: extensions/dscan-decentralized-qr-co.crx
ZIP extracted and saved to: extensions/dscan-decentralized-qr-co.zip
```

## How It Works
- Fetch the CRX file:
Constructs an unofficial URL to download the extension using Chrome’s update service. It spoofs a Chrome User-Agent and follows redirects.

- Convert CRX to ZIP:
Reads the CRX header (supports both CRX v2 and v3) to determine where the ZIP data starts, then writes the ZIP archive into a separate file.

- Dynamic Naming & Organization:
The package extracts a friendly name from the extension URL and creates an extensions/ folder to store all downloads.

## Disclaimer
- Unofficial Method:
This tool utilizes an undocumented endpoint (`clients2.google.com/service/update2/crx`) to download CRX files. Its use might be against the Chrome Web Store’s Terms of Service if used for unauthorized distribution. Use responsibly and only with public/open-source extensions unless you have permission.

- No Redistribution:
The authors assume no liability for any misuse of this tool. Users are solely responsible for complying with legal and regulatory requirements when using the package.