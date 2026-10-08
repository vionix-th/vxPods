import packageMetadata from '../../package.json';
import { openDialog } from '../components/dialog.js';
import { openSupportDialog, supportButton } from './support.js';

export const VIONIX_URL = 'https://vionix.cloud';
export const REPOSITORY_URL = 'https://github.com/vionix-th/vxPods';

export function externalLink(label, href) {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export function publisherLink() {
  const link = externalLink('By Vionix Consulting', VIONIX_URL);
  link.className = 'publisher-link';
  link.setAttribute('aria-label', 'By Vionix Consulting (opens in a new tab)');
  return link;
}

export function projectLinks() {
  const links = document.createElement('nav');
  links.className = 'project-links';
  links.setAttribute('aria-label', 'Project links');
  links.append(
    externalLink('Source code', REPOSITORY_URL),
    externalLink('Report an issue', `${REPOSITORY_URL}/issues`),
    externalLink('MIT license', `${REPOSITORY_URL}/blob/main/LICENSE`),
  );
  return links;
}

export function aboutButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost';
  button.textContent = 'About';
  button.addEventListener('click', () => openDialog({
    title: 'About vxPods',
    render(body, handle) {
      const description = document.createElement('p');
      description.textContent = 'Turn text into speech or a configurable podcast. vxPods is free, open-source software by Vionix Consulting.';
      const privacy = document.createElement('p');
      privacy.textContent = 'Settings and API keys stay in this browser. Generation requests go directly to your selected provider; provider charges may apply.';
      const version = document.createElement('p');
      version.textContent = `App v${packageMetadata.version}`;
      const support = supportButton(() => {
        handle.onClose(() => queueMicrotask(openSupportDialog));
        handle.close('support');
      });
      body.append(description, publisherLink(), privacy, projectLinks(), version, support);
    },
  }));
  return button;
}
