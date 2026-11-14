
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const currentPage = location.pathname.split('/').pop() || 'index.html';

const header = document.querySelector('.site-header');

const navItems = [
  ['Home', 'index.html#home', 'index.html'],
  ['Discover', 'index.html#gallery', 'discover.html'],
  ['Chat', 'chat.html', 'chat.html'],
  ['Inbox', 'dm.html', 'dm.html']
];

const sharedHeader = document.createElement('header');
sharedHeader.className = 'site-header';

sharedHeader.innerHTML = `
  <a class="brand" href="index.html#home" aria-label="GameVault home">
    <span class="brand-mark" aria-hidden="true">G</span>
    <span class="brand-word">GAME<span>VAULT</span><small>YOUR GAMING COMMUNITY</small></span>
  </a>

  <nav class="top-nav" aria-label="Main navigation">
    ${navItems.map(([label, href, page]) => `
      <a href="${href}" ${currentPage === page ? 'class="active"' : ''}>${label}</a>
    `).join('')}
  </nav>

  <div class="header-actions">
    <a class="icon-action" href="index.html#gallery"
       aria-label="Explore posts" title="Explore posts">⌕</a>

    <button id="upload-open" class="upload-open-button"
      type="button" aria-label="Create a post" title="Create a post"
      hidden>＋</button>

    <button id="auth-open" class="sign-in-button"
      type="button" hidden>Sign in</button>

    <span id="account"></span>
  </div>
`;

if (header) {
  header.replaceWith(sharedHeader);
} else {
  document.body.prepend(sharedHeader);
}

// Use one identical login popup on every page.
document.getElementById('auth-dialog')?.remove();

const authDialog = document.createElement('dialog');
authDialog.id = 'auth-dialog';
authDialog.className = 'auth-dialog';

authDialog.innerHTML = `
  <form method="dialog" class="close">
    <button aria-label="Close" type="submit">×</button>
  </form>

  <div class="auth-brand">
    <span class="brand-mark">G</span>
    <span>
      <strong>Welcome to GameVault</strong>
      <small>Your community starts here.</small>
    </span>
  </div>

  <h2 id="auth-heading">Enter the vault</h2>

  <form id="auth-form" class="auth-form">
    <label>
      Username
      <input id="username" required minlength="3" maxlength="24"
        autocomplete="username" pattern="[A-Za-z0-9_]+"
        title="Use 3–24 letters, numbers, or underscores">
    </label>

    <label>
      Password
      <input id="password" type="password" minlength="8"
        required autocomplete="current-password">
    </label>

    <button class="button button-primary button-wide"
      id="auth-submit" type="submit">Sign in</button>
  </form>

  <button id="auth-toggle" class="link-button" type="button">
    Need an account? Sign up
  </button>

  <p id="auth-status" role="status"></p>

  <p class="auth-note">
    Keep your password safe. Username-based accounts use GameVault's username login.
  </p>
`;

document.body.append(authDialog);

const $ = id => document.getElementById(id);
let signup = false;

function openAuth() {
  $('auth-status').textContent = '';
  authDialog.showModal();
}

$('auth-open').addEventListener('click', openAuth);

$('auth-toggle').addEventListener('click', () => {
  signup = !signup;

  $('auth-heading').textContent = signup
    ? 'Create your account'
    : 'Enter the vault';

  $('auth-submit').textContent = signup
    ? 'Create account'
    : 'Sign in';

  $('auth-toggle').textContent = signup
    ? 'Already have an account? Sign in'
    : 'Need an account? Sign up';

  $('password').autocomplete = signup
    ? 'new-password'
    : 'current-password';

  $('auth-status').textContent = signup
    ? 'Choose a unique username and a password of at least 8 characters.'
    : '';
});

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();

  const username = $('username').value.trim();
  const password = $('password').value;

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    $('auth-status').textContent =
      'Username must be 3–24 letters, numbers, or underscores.';
    return;
  }

  const submit = $('auth-submit');
  submit.disabled = true;
  $('auth-status').textContent = signup
    ? 'Creating account…'
    : 'Signing in…';

  try {
    const email = `${username.toLowerCase()}@username.gamevault.invalid`;

    let result;

    if (signup) {
      result = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });

      if (result.error) throw result.error;

      if (!result.data.session) {
        $('auth-status').textContent =
          'Account created, but confirmation is enabled. Please check the Supabase Authentication settings.';
        return;
      }
    } else {
      result = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;
    }

    $('auth-status').textContent = signup
      ? 'Account created!'
      : 'Signed in!';

    authDialog.close();

    // Reload the current page so its own features receive the new session.
    location.reload();

  } catch (error) {
    $('auth-status').textContent =
      error.message || 'Authentication failed.';
  } finally {
    submit.disabled = false;
  }
});

async function updateSharedAuthButton() {
  const { data } = await sb.auth.getSession();
  $('auth-open').hidden = !!data.session?.user;
}

updateSharedAuthButton();

sb.auth.onAuthStateChange(() => {
  updateSharedAuthButton();
});

// Keep the shared create-post button working only where an upload dialog exists.
$('upload-open').addEventListener('click', () => {
  const uploadDialog = $('upload-dialog');

  if (uploadDialog) {
    uploadDialog.showModal();
  } else {
    location.href = 'index.html#share';
  }
});

