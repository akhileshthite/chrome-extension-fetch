#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");

/**
 * Makes an HTTPS GET request with redirect following.
 * No external dependencies are used.
 *
 * @param {string} url - The initial URL to fetch.
 * @param {object} [options] - Optional request headers and settings.
 * @param {number} [maxRedirects=5] - The maximum number of redirects to follow.
 * @returns {Promise<{ statusCode: number, headers: object, bodyStream: NodeJS.ReadableStream }>}
 */
function fetchWithRedirect(url, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, options, (res) => {
        const { statusCode, headers } = res;

        // If 3xx, we follow the redirect if Location header is present
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          if (maxRedirects === 0) {
            reject(new Error("Too many redirects"));
            res.resume(); // consume response data to free up memory
            return;
          }
          // Follow the redirect
          const redirectUrl = headers.location;
          res.resume(); // discard the body
          return resolve(
            fetchWithRedirect(redirectUrl, options, maxRedirects - 1)
          );
        }

        // Otherwise, return this response
        resolve({
          statusCode,
          headers,
          bodyStream: res,
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

/**
 * Downloads a CRX file from the Chrome Web Store using an unofficial URL pattern.
 *
 * @param {string} extensionId - Chrome extension ID (e.g. "iofjnhbihgjfhdldcnlmjbfmighljfob").
 * @param {string} chromeVersion - Chrome version to spoof (e.g. "114.0.5735.133").
 * @param {string} outputFilename - Where to save the CRX file (absolute or relative path).
 * @returns {Promise<void>}
 */
async function downloadCRX(extensionId, chromeVersion, outputFilename) {
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chromeVersion}&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
  console.log(`Attempting CRX download from: ${url}`);

  // Spoof a Chrome-like user agent
  const options = {
    headers: {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      Accept: "*/*",
    },
  };

  // Follow redirects manually
  const { statusCode, bodyStream } = await fetchWithRedirect(url, options);

  if (statusCode !== 200) {
    bodyStream.resume(); // discard
    throw new Error(`Download failed, final status code: ${statusCode}`);
  }

  // Pipe the response to a file
  const fileStream = fs.createWriteStream(outputFilename);
  await new Promise((resolve, reject) => {
    bodyStream.pipe(fileStream);
    bodyStream.on("error", reject);
    fileStream.on("finish", resolve);
  });

  console.log(`CRX file saved to: ${outputFilename}`);
}

/**
 * Detects whether the CRX is v2 or v3 and returns the offset to ZIP data.
 *
 * CRX2 structure:
 *  0-3:  "Cr24"
 *  4-7:  Version (LE) => 2
 *  8-11: Public key length (LE)
 * 12-15: Signature length (LE)
 * [public key] [signature] [ZIP data]
 *
 * CRX3 structure:
 *  0-3:  "Cr24"
 *  4-7:  Version (LE) => 3
 *  8-11: Header size
 * [serialized protobuf headers] [ZIP data]
 *
 * @param {Buffer} buffer
 * @returns {number} - Offset where ZIP data starts.
 */
function getZipStartOffset(buffer) {
  // Must start with "Cr24"
  if (buffer.toString("ascii", 0, 4) !== "Cr24") {
    throw new Error('Not a valid CRX file (missing "Cr24").');
  }

  const version = buffer.readUInt32LE(4);
  if (version === 2) {
    const pubKeyLen = buffer.readUInt32LE(8);
    const sigLen = buffer.readUInt32LE(12);
    return 16 + pubKeyLen + sigLen;
  } else if (version === 3) {
    const headerSize = buffer.readUInt32LE(8);
    return 12 + headerSize;
  } else {
    throw new Error(`Unsupported CRX version: ${version}`);
  }
}

/**
 * Converts a CRX (v2 or v3) to a ZIP by stripping off the CRX header.
 *
 * @param {string} crxPath - Path to the CRX file.
 * @param {string} zipPath - Path to save the resulting ZIP.
 */
function convertCRXtoZIP(crxPath, zipPath) {
  const buffer = fs.readFileSync(crxPath);
  const zipOffset = getZipStartOffset(buffer);
  const zipData = buffer.slice(zipOffset);

  fs.writeFileSync(zipPath, zipData);
  console.log(`ZIP extracted and saved to: ${zipPath}`);
}

/**
 * Main function to download & convert an extension from its URL.
 *
 * @param {string} extensionUrl - Full Chrome Web Store extension URL
 *    (e.g. "https://chrome.google.com/webstore/detail/extension-name/abc123...")
 * @param {object} [options]
 * @param {string} [options.chromeVersion="114.0.5735.133"] - Spoofed Chrome version
 * @param {string} [options.outputDir="extensions"] - Directory to store CRX & ZIP
 */
async function fetchExtensionZip(extensionUrl, options = {}) {
  const {
    chromeVersion = "114.0.5735.133", // default fallback
    outputDir = "extensions",
  } = options;

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Example: https://chromewebstore.google.com/detail/twitterx-feed-blocker/iofjnhbihgjfhdldcnlmjbfmighljfob
  const parts = extensionUrl.split("/").filter(Boolean);

  // We expect something like: ["https:", "chromewebstore.google.com", "detail", "twitterx-feed-blocker", "iofjnhbihgjfhdldcnlmjbfmighljfob"]
  // The last item is always the extensionId
  const extensionId = parts[parts.length - 1];

  // We'll guess the second-last item is the friendly name
  // It's not guaranteed to match the actual extension name, but it usually does
  let guessedName = "extension";
  if (parts.length >= 2) {
    guessedName = parts[parts.length - 2];
  }

  // We might sanitize `guessedName` to remove weird chars
  guessedName = guessedName.replace(/[^a-zA-Z0-9_\-]/g, "");

  // Build output file paths
  const crxFilename = path.join(outputDir, `${guessedName}.crx`);
  const zipFilename = path.join(outputDir, `${guessedName}.zip`);

  console.log(
    `\n==> Downloading extension: ${guessedName} (ID: ${extensionId})`
  );
  console.log(`==> Using Chrome version: ${chromeVersion}`);

  // 1) Download CRX
  await downloadCRX(extensionId, chromeVersion, crxFilename);

  // 2) Convert CRX -> ZIP
  convertCRXtoZIP(crxFilename, zipFilename);

  // Return the paths for convenience
  return { crxPath: crxFilename, zipPath: zipFilename };
}

// If the script is invoked from the command line directly:
//   node index.js <extension_url> <optional_chrome_version>
if (require.main === module) {
  (async () => {
    const extensionUrl = process.argv[2];
    const maybeChromeVersion = process.argv[3];

    if (!extensionUrl) {
      console.error("Usage: node index.js <extension_url> [<chromeVersion>]");
      process.exit(1);
    }

    try {
      await fetchExtensionZip(extensionUrl, {
        chromeVersion: maybeChromeVersion || "114.0.5735.133",
      });
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  })();
}

// Export the main function to be used as a library
module.exports = { fetchExtensionZip };
