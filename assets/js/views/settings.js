import { h } from '../components/h.js';
import { card, button, notice } from '../components/ui.js';
import { createGithub } from '../github.js';

export function render(root, _route, ctx, signal) {
  const input = h('input', { type: 'password', id: 'token', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', value: ctx.settings.getToken() });
  const status = h('div', { 'aria-live': 'polite' });
  const show = (msg, tone) => status.replaceChildren(notice(msg, tone));

  const save = button('Save', {
    primary: true,
    onClick: () => {
      if (!input.value.trim()) return show('Paste a token first.', 'warn');
      if (!ctx.settings.setToken(input.value)) return show('This browser blocks local storage, so the token cannot be saved.', 'error');
      show('Token saved on this device.', 'info');
    },
  });
  const test = button('Test token', {
    onClick: async () => {
      if (!ctx.repo) return show("Couldn't detect the GitHub repository from this address. Set REPO_OVERRIDE in assets/js/config.js.", 'error');
      if (!input.value.trim()) return show('Paste a token first.', 'warn');
      show('Testing…', 'info');
      try {
        const r = await createGithub({ ...ctx.repo, token: input.value.trim() }).testToken();
        if (signal?.aborted) return;
        show(r.message, r.ok ? 'info' : 'error');
      } catch {
        if (signal?.aborted) return;
        show("Couldn't reach GitHub. Check your connection and try again.", 'error');
      }
    },
  });
  const clear = button('Clear', {
    onClick: () => {
      ctx.settings.clearToken();
      input.value = '';
      show('Token removed from this device.', 'info');
    },
  });

  root.append(card({ title: 'Settings' },
    h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', { for: 'token', text: 'GitHub token' }), input),
      h('div', { class: 'row-actions' }, save, test, clear),
      status),
    h('h3', { text: 'What is this for?' }),
    h('p', { text: 'The token lets this page start the analysis workflow in your repository and read finished reports. It is stored only in this browser and is never uploaded anywhere except to GitHub’s API.' }),
    h('p', { text: 'Create a fine-grained token limited to this repository with permissions “Actions: read and write” and “Contents: read”.' }),
    h('p', {}, h('a', { href: 'https://github.com/settings/personal-access-tokens/new', text: 'Create a token on GitHub' })),
    h('p', { class: 'muted small', text: 'Without a token you can still open reports from their private links.' }),
    ctx.repo ? h('p', { class: 'muted small', text: `Repository: ${ctx.repo.owner}/${ctx.repo.repo}` }) : null));
}
