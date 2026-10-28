import {chromium} from 'playwright';
import {existsSync} from 'node:fs';

// One place decides which Chromium the browser tests drive: WENZHOU_CHROME when set, otherwise an installed
// Google Chrome, otherwise Playwright's own build (needs `npx playwright install chromium`).
const installedChrome=[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(path=>existsSync(path));

export const chromeExecutable=process.env.WENZHOU_CHROME||installedChrome;

export function launchBrowser(options={}){
  return chromium.launch({headless:true,...(chromeExecutable?{executablePath:chromeExecutable}:{}),...options});
}
