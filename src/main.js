import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/app.css';
import { bootstrap } from './app/bootstrap.js';

const root = document.getElementById('app');
if (root) {
  bootstrap(root).catch((err) => {
    // Bootstrap failure: show a minimal, DOM-safe error.
    root.replaceChildren();
    const main = document.createElement('main');
    const message = document.createElement('p');
    message.className = 'error-text';
    message.textContent = 'vxPods failed to start. Reload the page to retry.';
    main.append(message);
    root.append(main);
    console.error(err);
  });
}
