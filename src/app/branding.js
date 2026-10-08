import { icon } from '../components/icon.js';
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

export function publisherIdentity(className = '') {
  const link = externalLink('', VIONIX_URL);
  link.className = `brand ${className}`.trim();
  link.setAttribute('aria-label', 'vxPods by Vionix Consulting (opens in a new tab)');
  const logo = document.createElement('img');
  logo.src = `${import.meta.env.BASE_URL}assets/img/logo.png`;
  logo.alt = '';
  logo.width = 36;
  logo.height = 36;
  logo.className = 'brand-logo';
  const text = document.createElement('span');
  text.className = 'brand-text';
  const product = document.createElement('strong');
  product.className = 'product-name';
  product.textContent = 'vxPods';
  const publisher = document.createElement('span');
  publisher.className = 'publisher-link';
  publisher.textContent = 'By Vionix Consulting';
  text.append(product, publisher);
  link.append(logo, text);
  return link;
}

export function projectLinks({ detailed = false } = {}) {
  const links = document.createElement('nav');
  links.className = 'project-links';
  links.setAttribute('aria-label', 'Project links');
  const resources = [
    ['Source code', REPOSITORY_URL, 'github'],
    ['Report an issue', `${REPOSITORY_URL}/issues`, 'message'],
    ['MIT license', `${REPOSITORY_URL}/blob/main/LICENSE`, 'license'],
  ];
  for (const [label, href, glyph] of resources) {
    const link = externalLink(label, href);
    if (detailed) {
      link.className = 'project-resource';
      const text = document.createElement('span');
      text.textContent = label;
      link.replaceChildren(icon(glyph, 20), text, icon('external', 14));
    }
    links.append(link);
  }
  return links;
}

export function aboutButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost';
  const label = document.createElement('span');
  label.textContent = 'About';
  button.append(icon('info'), label);
  button.addEventListener('click', () => {
    button.focus();
    const handle = openDialog({
      title: 'About vxPods',
      className: 'about-dialog',
      render(body, handle) {
        const description = document.createElement('p');
        description.className = 'about-description';
        description.textContent = 'Turn text into speech or a configurable podcast with free, open-source software.';
        const privacy = document.createElement('p');
        privacy.className = 'about-privacy';
        privacy.textContent = 'Settings and API keys stay in this browser. Generation requests go directly to your selected provider; provider charges may apply.';
        const version = document.createElement('p');
        version.className = 'about-version';
        version.textContent = `App v${packageMetadata.version}`;
        const support = supportButton(() => {
          handle.onClose(() => queueMicrotask(openSupportDialog));
          handle.close('support');
        });
        const footer = document.createElement('footer');
        footer.className = 'about-footer';
        footer.append(version, support);
        body.append(publisherIdentity('about-identity'), description, privacy, projectLinks({ detailed: true }), footer);
      },
    });
    handle.element.querySelector('.dialog-close').focus();
  });
  return button;
}
