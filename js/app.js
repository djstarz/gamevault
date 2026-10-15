
function renderAccount() {
  const a = $('account');
  a.replaceChildren();

  $('admin-panel').hidden = true;
  $('auth-open').hidden = !!user;

  if (!user) {
    isAdmin = false;
    avatarUrl = null;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'profile-menu';

  const avatar = document.createElement('img');
  avatar.alt = 'Profile picture';
  avatar.width = 42;
  avatar.height = 42;
  avatar.src = avatarUrl || (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42">' +
      '<rect width="42" height="42" rx="21" fill="#263447"/>' +
      '<text x="21" y="28" text-anchor="middle" fill="white" font-size="22">?</text>' +
      '</svg>'
    )
  );

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'profile-trigger';
  toggle.setAttribute('aria-label', 'Open account menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.append(avatar);

  const label = document.createElement('span');
  label.className = 'profile-trigger-name';
  label.textContent = usernameOf(user);

  const arrow = document.createElement('span');
  arrow.className = 'profile-chevron';
  arrow.textContent = '⌄';

  toggle.append(label, arrow);

  const menu = document.createElement('div');
  menu.className = 'profile-dropdown';
  menu.hidden = true;

  const heading = document.createElement('div');
  heading.className = 'profile-dropdown-heading';

  const headingName = document.createElement('strong');
  headingName.textContent = usernameOf(user);

  const headingCaption = document.createElement('span');
  headingCaption.textContent = isAdmin
    ? 'GameVault administrator'
    : 'GameVault member';

  heading.append(headingName, headingCaption);
  menu.append(heading);

  function addMenuItem(text, icon, action, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-menu-item' +
      (danger ? ' profile-menu-danger' : '');
    button.innerHTML = '<span class="profile-menu-icon">' +
      icon + '</span>';

    const caption = document.createElement('span');
    caption.textContent = text;
    button.append(caption);

    button.addEventListener('click', () => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      action();
    });

    menu.append(button);
    return button;
  }

  addMenuItem('My profile', '♙', () => {
    let dialog = document.getElementById('my-profile-dialog');

    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'my-profile-dialog';
      dialog.className = 'profile-dialog';
      document.body.append(dialog);
    }

    dialog.replaceChildren();

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'profile-dialog-close';
    close.textContent = '×';
    close.onclick = () => dialog.close();

    const picture = document.createElement('img');
    picture.className = 'profile-dialog-avatar';
    picture.alt = 'Your profile picture';
    picture.src = avatarUrl || avatar.src;

    const name = document.createElement('h2');
    name.textContent = usernameOf(user);

    const caption = document.createElement('p');
    caption.textContent = 'Your GameVault profile';

    const posts = document.createElement('p');
    posts.className = 'profile-dialog-detail';
    posts.textContent = 'Your posts: ' +
      postsCache.filter(post => post.user_id === user.id).length;

    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'profile-dialog-action';
    change.textContent = 'Change profile picture';
    change.onclick = () => {
      dialog.close();
      fileInput.click();
    };

    dialog.append(close, picture, name, caption, posts, change);

    if (!dialog.open) dialog.showModal();
  });

  addMenuItem('My posts', '▧', () => {
    const mine = postsCache.filter(post => post.user_id === user.id);
    const grid = $('gallery-grid');

    grid.replaceChildren();

    if (!mine.length) {
      grid.textContent = 'You have not uploaded any posts yet.';
    } else {
      grid.replaceChildren(...mine.map(post => makePostCard(post)));
    }

    const heading = document.querySelector('.community-heading h2');
    if (heading) heading.textContent = 'My posts';

    const allButton = document.getElementById('show-all-posts');
    if (allButton) allButton.hidden = false;

    document.querySelector('.community-heading')
      ?.scrollIntoView({ behavior: 'smooth' });
  });

  addMenuItem('View all posts', '⌂', async () => {
    const heading = document.querySelector('.community-heading h2');
    if (heading) heading.textContent = 'Community feed';

    const allButton = document.getElementById('show-all-posts');
    if (allButton) allButton.hidden = true;

    await loadPosts();

    document.querySelector('.community-heading')
      ?.scrollIntoView({ behavior: 'smooth' });
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.hidden = true;

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (file) await uploadAvatar(file);
    fileInput.value = '';
  };

  addMenuItem('Change profile picture', '◎', () => fileInput.click());

  if (isAdmin) {
    addMenuItem('Admin portal', '♜', () => {
      $('admin-panel').hidden = false;
      $('admin-panel').scrollIntoView({ behavior: 'smooth' });
    });
  }

  const separator = document.createElement('div');
  separator.className = 'profile-menu-divider';
  menu.append(separator);

  addMenuItem('Sign out', '↪', async () => {
    const { error } = await sb.auth.signOut();

    if (error) {
      alert('Sign out failed: ' + error.message);
      return;
    }

    user = null;
    isAdmin = false;
    avatarUrl = null;
    $('admin-panel').hidden = true;
    renderAccount();
    updateUpload();
    await loadPosts();
  }, true);

  toggle.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });

  document.addEventListener('click', event => {
    if (!wrap.contains(event.target)) {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  wrap.append(toggle, menu, fileInput);
  a.append(wrap);
}
