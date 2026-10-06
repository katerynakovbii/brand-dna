import { h } from '../components/h.js';
import { card, linkButton } from '../components/ui.js';

export function render(root) {
  root.append(card({ title: 'Page not found' },
    h('p', { text: 'This address does not match any page.' }),
    h('div', { class: 'row-actions' }, linkButton('New analysis', '#/', { primary: true }), linkButton('My reports', '#/reports'))));
}
