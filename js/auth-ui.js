
const accountEmail = username =>
  `${username.toLowerCase()}@username.gamevault.invalid`;

export function initGameVaultAuthUI({
  sb,
  getUser,
  getProfile = () => null,
  getAvatarUrl = () => '',
  onAction = () => {}
}) {
  const authButton = document.getElementById('auth-open');
  const account = document.getElementById('account');

  if (!sb || !authButton || !account) {
    console.error('GameVault Auth UI: Required elements are missing.');
    return null;
  }

  let authReady = false;
  let signup = false;

  // Create the login dialog once.
  let dialog = document.getElementById('auth-dialog');

  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'auth-dialog';
    dialog.className = 'auth-dialog';

    dialog.innerHTML = `
      <form method="dialog" class="close">
        <button aria-label="Close" type="submit">×</button>
      </form>

      <div class="auth-brand">GAME<span>VAULT</span></div>
      <h2 id="auth-heading">Enter the vault</h2>

      <form id="auth-form" class="auth-form">
        <label>Username
          <input id="username" required minlength="3" maxlength="24"
            autocomplete="username" pattern="[A-Za-z0-9_]+"
            title="Use 3–24 letters, numbers, or underscores">
        </label>

        <label>Password
          <input id="password" type="password" minlength="8"
            required autocomplete="current-password">
        </label>

        <button id="auth-submit" type="submit">Sign in</button>
      </form>

      <button id="auth-toggle" type="button">
        Need an account? Sign up
      </button>

      <p id="auth-status" role="status"></p>
    `;

    document.body.append(dialog);
  }

  const $ = id => document.getElementById(id);

  function openAuth() {
    $('auth-status').textContent = '';
    $('auth-form').reset();
    signup = false;
    updateAuthMode();

    if (!dialog.open) dialog.showModal();
  }

  function updateAuthMode() {
    $('auth-heading').textContent =
      signup ? 'Create your account' : 'Enter the vault';

    $('auth-submit').textContent =
      signup ? 'Create account' : 'Sign in';

    $('auth-toggle').textContent =
      signup
        ? 'Already have an account? Sign in'
        : 'Need an account? Sign up';

    $('password').autocomplete =
      signup ? 'new-password' : 'current-password';

    $('password').value = '';
  }

  authButton.addEventListener('click', openAuth);

  $('auth-toggle').addEventListener('click', () => {
    signup = !signup;
    updateAuthMode();

    $('auth-status').textContent = signup
      ? 'Choose a unique username and a password of at least 8 characters.'
      : '';
  });

  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault();

    const username = $('username').value.trim();
    const password = $('password').value;
    const submit = $('auth-submit');
    const status = $('auth-status');

    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      status.textContent =
        'Username must be 3–24 letters, numbers, or underscores.';
      return;
    }

    submit.disabled = true;
    status.textContent = signup ? 'Creating account…' : 'Signing in…';

    try {
      let result;

      if (signup) {
        result = await sb.auth.signUp({
          email: accountEmail(username),
          password,
          options: {
            data: { username }
          }
        });

        if (result.error) throw result.error;

        if (!result.data.session) {
          status.textContent =
            'Account created, but email confirmation is enabled. ' +
            'Please contact the administrator.';
          return;
        }

        status.textContent = 'Account created!';
      } else {
        result = await sb.auth.signInWithPassword({
          email: accountEmail(username),
          password
        });

        if (result.error) throw result.error;

        status.textContent = 'Signed in successfully!';
      }

      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 400);

    } catch (error) {
      status.textContent = error.message || 'Authentication failed.';
    } finally {
      submit.disabled = false;
    }
  });

  function addMenuItem(dropdown, label, icon, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-menu-item';

    const symbol = document.createElement('span');
    symbol.className = 'profile-menu-icon';
    symbol.textContent = icon;

    const text = document.createElement('span');
    text.textContent = label;

    button.append(symbol, text);

    button.addEventListener('click', action);
    dropdown.append(button);

    return button;
  }

  function render() {
    const user = getUser();
    const profile = getProfile();

    account.replaceChildren();
    authButton.hidden = !authReady || !!user;

    if (!user) return;

    const username =
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      'Player';

    const displayName =
      profile?.display_name?.trim() || username;

    const menu = document.createElement('div');
    menu.className = 'profile-menu';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'profile-trigger';
    trigger.setAttribute('aria-label', 'Open account menu');
    trigger.setAttribute('aria-expanded', 'false');

    const avatar = document.createElement('img');
    avatar.className = 'profile-avatar';
    avatar.alt = '';
    avatar.width = 40;
    avatar.height = 40;

    avatar.src = getAvatarUrl(profile?.avatar_path) ||
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
          <rect width="40" height="40" rx="20" fill="#263447"/>
          <text x="20" y="27" text-anchor="middle"
            fill="white" font-size="22">${username.charAt(0).toUpperCase()}</text>
        </svg>`
      );

    const name = document.createElement('span');
    name.className = 'profile-trigger-name';
    name.textContent = displayName;

    const arrow = document.createElement('span');
    arrow.className = 'profile-chevron';
    arrow.textContent = '⌄';

    trigger.append(avatar, name, arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'profile-dropdown';
    dropdown.hidden = true;

    const heading = document.createElement('div');
    heading.className = 'profile-dropdown-heading';

    const headingName = document.createElement('strong');
    headingName.textContent = displayName;

    const headingLabel = document.createElement('span');
    headingLabel.textContent = profile?.is_admin
      ? 'Administrator'
      : 'GameVault member';

    heading.append(headingName, headingLabel);
    dropdown.append(heading);

    function closeMenu() {
      dropdown.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    addMenuItem(dropdown, 'My Profile', '◉', () => {
      closeMenu();
      window.location.href = 'profile.html';
    });

    addMenuItem(dropdown, 'Friends Chat', '✉', () => {
      closeMenu();
      window.location.href = 'dm.html';
    });

    addMenuItem(dropdown, 'My Posts', '▤', () => {
      closeMenu();
      onAction('my-posts');
    });

    addMenuItem(dropdown, 'Change Profile Picture', '✎', () => {
      closeMenu();
      onAction('change-picture');
    });

    addMenuItem(dropdown, 'Account Settings', '⚙', () => {
      closeMenu();
      onAction('account-settings');
    });

    if (profile?.is_admin) {
      addMenuItem(dropdown, 'Admin Portal', '⚙', () => {
        closeMenu();
        onAction('admin-portal');
      });
    }

    const separator = document.createElement('div');
    separator.className = 'profile-menu-divider';
    dropdown.append(separator);

    addMenuItem(dropdown, 'Sign Out', '↪', async () => {
      closeMenu();

      const { error } = await sb.auth.signOut();

      if (error) {
        alert('Could not sign out: ' + error.message);
      }
    });

    menu.append(trigger, dropdown);
    account.append(menu);

    trigger.addEventListener('click', () => {
      const opening = dropdown.hidden;
      dropdown.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
    });
  }

  if (!window.__gameVaultAuthMenuHandler) {
    document.addEventListener('click', event => {
      document.querySelectorAll('.profile-menu').forEach(menu => {
        if (!menu.contains(event.target)) {
          const panel = menu.querySelector('.profile-dropdown');
          const button = menu.querySelector('.profile-trigger');

          if (panel && button) {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });

    window.__gameVaultAuthMenuHandler = true;
  }

  return {
    render,
    setAuthReady(value) {
      authReady = !!value;
      render();
    }
  };
}

