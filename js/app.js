import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id); let sb=null,user=null,signup=false,isAdmin=false,postsCache=[],avatarUrl=null;
// Username accounts are mapped to a synthetic, non-deliverable address. Disable email confirmation in Supabase Auth.
const accountEmail = name => `${name.toLowerCase()}@username.gamevault.invalid`;
const configured=SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('PASTE_YOUR')&&SUPABASE_PUBLISHABLE_KEY&&!SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR');
if(configured){sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);start()}else{$('gallery-grid').textContent='Add your Supabase URL and publishable key in js/config.js to connect the vault.';$('upload-status').textContent='Waiting for Supabase configuration.'}
async function start() {
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;

  await refreshAdmin();
  await loadAvatar();
  renderAccount();

  await loadPosts();

  sb.auth.onAuthStateChange((_e, s) => {
    user = s?.user || null;

    setTimeout(async () => {
      await refreshAdmin();
      await loadAvatar();
      renderAccount();
      updateUpload();
      await loadPosts();
    }, 0);
  });

  updateUpload();
}
function usernameOf(u){return u?.user_metadata?.username||u?.email?.split('@')[0]||'Player'}

async function loadAvatar() {
  avatarUrl = null;
  if (!sb || !user) return;

  const { data, error } = await sb
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Could not load avatar:', error.message);
    return;
  }

  if (data?.avatar_path) {
    const { data: imageData } = sb.storage
      .from('gamevault-avatars')
      .getPublicUrl(data.avatar_path);

    avatarUrl = imageData.publicUrl;
  }
}

async function uploadAvatar(file) {
  if (!sb || !user || !file) return;

  const types = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  if (!types[file.type]) {
    alert('Choose a JPG, PNG, or WebP image.');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('Profile pictures must be 2 MB or smaller.');
    return;
  }

const path = `${user.id}/avatar-${crypto.randomUUID()}.${types[file.type]}`;

  const { error: uploadError } = await sb.storage
    .from('gamevault-avatars')
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600'
    });

  if (uploadError) {
    alert('Picture upload failed: ' + uploadError.message);
    return;
  }

  const { error: profileError } = await sb
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', user.id);

  if (profileError) {
    alert('Image uploaded, but saving the profile failed: ' +
      profileError.message);
    return;
  }

  await loadAvatar();
  renderAccount();
}

async function refreshAdmin() {
  isAdmin = false;
  $('admin-panel').hidden = true;

  if (!sb || !user) return;

  const r = await sb
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  isAdmin = !!r.data?.is_admin;
  $('admin-panel').hidden = !isAdmin;

  if (isAdmin) {
    $('admin-username').textContent = usernameOf(user);
  }
}




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

  const username = usernameOf(user);

  // Hidden input for changing the profile picture
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.hidden = true;

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (file) await uploadAvatar(file);
    fileInput.value = '';
  };

  // Profile dropdown wrapper
  const menu = document.createElement('div');
  menu.className = 'profile-menu';

  // Profile picture trigger
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

  if (avatarUrl) {
    avatar.src = avatarUrl;
  } else {
    avatar.src =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
        '<rect width="40" height="40" rx="20" fill="#263447"/>' +
        '<text x="20" y="27" text-anchor="middle" fill="white" font-size="22">?</text>' +
        '</svg>'
      );
  }

  const name = document.createElement('span');
  name.className = 'profile-trigger-name';
  name.textContent = username;

  const arrow = document.createElement('span');
  arrow.className = 'profile-chevron';
  arrow.textContent = '⌄';
  arrow.setAttribute('aria-hidden', 'true');

  trigger.append(avatar, name, arrow);

  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.className = 'profile-dropdown';
  dropdown.hidden = true;

  const heading = document.createElement('div');
  heading.className = 'profile-dropdown-heading';

  const headingName = document.createElement('strong');
  headingName.textContent = username;

  const headingLabel = document.createElement('span');
  headingLabel.textContent = isAdmin ? 'Administrator' : 'GameVault member';

  heading.append(headingName, headingLabel);
  dropdown.append(heading);

  function addItem(label, action, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-menu-item';

    const symbol = document.createElement('span');
    symbol.className = 'profile-menu-icon';
    symbol.textContent = icon;
    symbol.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = label;

    button.append(symbol, text);
    button.onclick = action;
    dropdown.append(button);

    return button;
  }

  function closeMenu() {
    dropdown.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function openProfile() {
    let dialog = $('my-profile-dialog');

    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'my-profile-dialog';
      dialog.className = 'profile-dialog';

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'profile-dialog-close';
      close.textContent = '✕';
      close.setAttribute('aria-label', 'Close profile');
      close.onclick = () => dialog.close();

      const picture = document.createElement('img');
      picture.id = 'my-profile-avatar';
      picture.className = 'profile-dialog-avatar';
      picture.alt = 'Your profile picture';

      const title = document.createElement('h2');
      title.id = 'my-profile-name';

      const subtitle = document.createElement('p');
      subtitle.id = 'my-profile-role';

      const count = document.createElement('p');
      count.id = 'my-profile-post-count';

      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'profile-dialog-action';
      change.textContent = 'Change profile picture';
      change.onclick = () => {
        dialog.close();
        fileInput.click();
      };

      dialog.append(close, picture, title, subtitle, count, change);
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });

      document.body.append(dialog);
    }

    $('my-profile-avatar').src = avatarUrl || avatar.src;
    $('my-profile-name').textContent = username;
    $('my-profile-role').textContent =
      isAdmin ? 'Administrator' : 'GameVault member';

    $('my-profile-post-count').textContent =
      'Posts in the latest loaded feed: ' +
      postsCache.filter(post => post.user_id === user.id).length;

    dialog.showModal();
  }

  addItem('My Profile', () => {
    closeMenu();
    openProfile();
  }, '◉');

  addItem('My Posts', async () => {
    closeMenu();

    const heading = document.querySelector('.community-heading h2');
    if (heading) heading.textContent = 'My Posts';

    const showAll = $('show-all-posts');
    if (showAll) showAll.hidden = false;

    const myPosts = postsCache.filter(post => post.user_id === user.id);
    const gallery = $('gallery-grid');

    if (!myPosts.length) {
      gallery.textContent = 'You have no posts in the latest loaded feed yet.';
    } else {
      gallery.replaceChildren(
        ...myPosts.map(post => makePostCard(post, false))
      );
    }

    $('gallery-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, '▤');

  addItem('Change Profile Picture', () => {
    closeMenu();
    fileInput.click();
  }, '✎');

  if (isAdmin) {
    addItem('Admin Portal', () => {
      closeMenu();
      $('admin-panel').hidden = false;
      $('admin-panel').scrollIntoView({ behavior: 'smooth' });
    }, '⚙');
  }

  const separator = document.createElement('div');
  separator.className = 'profile-menu-divider';
  dropdown.append(separator);

  addItem('Sign Out', async () => {
    closeMenu();

    const { error } = await sb.auth.signOut();

    if (error) {
      alert('Could not sign out: ' + error.message);
      return;
    }

    user = null;
    isAdmin = false;
    avatarUrl = null;

    $('admin-panel').hidden = true;
    renderAccount();
    updateUpload();
    await loadPosts();
  }, '↪');

  trigger.onclick = () => {
    const opening = dropdown.hidden;
    dropdown.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
  };

  // Close when clicking outside the menu
  if (!window.__gameVaultProfileMenuHandler) {
    document.addEventListener('click', event => {
      document.querySelectorAll('.profile-menu').forEach(profileMenu => {
        if (!profileMenu.contains(event.target)) {
          const panel = profileMenu.querySelector('.profile-dropdown');
          const button = profileMenu.querySelector('.profile-trigger');

          if (panel && button) {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });

    window.__gameVaultProfileMenuHandler = true;
  }

  menu.append(trigger, dropdown, fileInput);
  a.append(menu);
}


function updateUpload(){$('upload-button').disabled=!user;$('upload-status').textContent=user?'Signed in. Files are limited to 20 MB.':'Sign in before uploading.'}
function openAuth(){$('auth-status').textContent='';$('auth-dialog').showModal()}$('auth-open').onclick=openAuth;
$('auth-toggle').onclick=()=>{signup=!signup;$('auth-heading').textContent=signup?'Create your account':'Enter the vault';$('auth-submit').textContent=signup?'Create account':'Sign in';$('auth-toggle').textContent=signup?'Already have an account? Sign in':'Need an account? Sign up';$('password').autocomplete=signup?'new-password':'current-password';$('auth-status').textContent=signup?'Choose a unique username and a password of at least 8 characters.':''};

$('auth-form').onsubmit = async e => {
  e.preventDefault();
  if (!sb) return;

  const name = $('username').value.trim();

  if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) {
    $('auth-status').textContent =
      'Username must be 3–24 letters, numbers, or underscores.';
    return;
  }

  $('auth-submit').disabled = true;
  $('auth-status').textContent = signup
    ? 'Creating account…'
    : 'Signing in…';

  try {
    let r;

    if (signup) {
      r = await sb.auth.signUp({
        email: accountEmail(name),
        password: $('password').value,
        options: { data: { username: name } }
      });

      if (r.error) throw r.error;

      if (!r.data.session) {
        $('auth-status').textContent =
          'Account created, but confirmation is enabled. Turn OFF Confirm email in Supabase Authentication settings for username-only accounts.';
        return;
      }

      $('auth-status').textContent = 'Account created!';
    } else {
      r = await sb.auth.signInWithPassword({
        email: accountEmail(name),
        password: $('password').value
      });

      if (r.error) throw r.error;

      $('auth-status').textContent = 'Signed in!';
    }

    // Refresh the UI after successful authentication.
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    await refreshAdmin();
    await loadAvatar();
    renderAccount();
    updateUpload();
    await loadPosts();

    $('auth-dialog').close();

  } catch (err) {
    $('auth-status').textContent =
      err.message || 'Authentication failed.';
  } finally {
    $('auth-submit').disabled = false;
  }
};
$('upload-form').onsubmit=async e=>{e.preventDefault();if(!user)return openAuth();const f=$('media').files[0];if(!f)return;if(f.size>20*1024*1024){$('upload-status').textContent='File exceeds 20 MB. Choose a smaller file.';return}if(!f.type.startsWith('image/')&&!['video/mp4','video/webm','video/quicktime'].includes(f.type)){$('upload-status').textContent='Choose an image, MP4, WebM, or QuickTime video.';return}$('upload-button').disabled=true;$('upload-status').textContent='Uploading…';let path='';try{const safe=f.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(-90);path=`${user.id}/${crypto.randomUUID()}-${safe}`;const up=await sb.storage.from('gamevault-media').upload(path,f,{contentType:f.type,upsert:false});if(up.error)throw up.error;const url=sb.storage.from('gamevault-media').getPublicUrl(path).data.publicUrl;const ins=await sb.from('posts').insert({user_id:user.id,title:$('title').value.trim(),description:$('description').value.trim(),category:$('category').value,media_url:url,media_type:f.type.startsWith('video/')?'video':'image',storage_path:path});if(ins.error){await sb.storage.from('gamevault-media').remove([path]);throw ins.error}$('upload-form').reset();$('upload-status').textContent='Uploaded successfully!';await loadPosts()}catch(err){$('upload-status').textContent=err.message||'Upload failed. Check Storage and RLS policies.'}finally{updateUpload()}};

function openPost(post) {
  let dialog = document.getElementById('post-viewer');

  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'post-viewer';
    dialog.style.cssText =
      'width:min(900px,92vw);max-height:90vh;overflow:auto;' +
      'background:#151923;color:#fff;border:1px solid #394150;' +
      'border-radius:14px;padding:20px;';

    dialog.innerHTML = `
      <button type="button" id="post-viewer-close"
        style="float:right;padding:8px 14px;cursor:pointer">
        Close ✕
      </button>
      <h2 id="post-viewer-title"></h2>
      <div id="post-viewer-media"></div>
      <p id="post-viewer-description"></p>
      <p id="post-viewer-category"></p>
    `;

    dialog.addEventListener('click', e => {
      if (e.target === dialog) dialog.close();
    });

    dialog.querySelector('#post-viewer-close')
      .addEventListener('click', () => dialog.close());

    document.body.append(dialog);
  }

  dialog.querySelector('#post-viewer-title').textContent =
    post.title || 'Untitled post';
  dialog.querySelector('#post-viewer-description').textContent =
    post.description || '';
  dialog.querySelector('#post-viewer-category').textContent =
    post.category || 'Gaming';

  const media = dialog.querySelector('#post-viewer-media');
  media.replaceChildren();

  let el;
  if (post.media_type === 'video') {
    el = document.createElement('video');
    el.controls = true;
    el.autoplay = false;
    el.preload = 'metadata';
  } else {
    el = document.createElement('img');
    el.alt = post.title || 'Gaming media';
  }

  el.src = post.media_url;
  el.style.cssText =
    'display:block;max-width:100%;max-height:65vh;' +
    'width:auto;height:auto;margin:16px auto;object-fit:contain;';

  media.append(el);

  if (!dialog.open) dialog.showModal();
}


function openEditPost(post, admin = false) {
  const dialog = document.createElement('dialog');
  dialog.className = 'gv-edit-dialog';

  const form = document.createElement('form');
  form.className = 'gv-edit-form';

  const heading = document.createElement('h2');
  heading.textContent = 'Edit post';

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Update your post details. Your media will stay unchanged.';

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Post title';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 120;
  titleInput.required = true;
  titleInput.value = post.title || '';

  titleLabel.append(titleInput);

  const descriptionLabel = document.createElement('label');
  descriptionLabel.textContent = 'Description';

  const descriptionInput = document.createElement('textarea');
  descriptionInput.rows = 4;
  descriptionInput.maxLength = 2000;
  descriptionInput.value = post.description || '';

  descriptionLabel.append(descriptionInput);

  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Category';

  const categoryInput = document.createElement('select');

  // Keep these options aligned with the categories in your upload form.
  const categories = [
    'Genshin Impact',
    'Wuthering Waves',
    'Arknights: Endfield',
    'Other'
  ];

  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categoryInput.append(option);
  });

  // Preserve a category already used by a post, even if it is not listed above.
  if (post.category && !categories.includes(post.category)) {
    const option = document.createElement('option');
    option.value = post.category;
    option.textContent = post.category;
    categoryInput.append(option);
  }

  categoryInput.value = post.category || categories[0];
  categoryLabel.append(categoryInput);

  const actions = document.createElement('div');
  actions.className = 'gv-edit-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'gv-edit-cancel';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => dialog.close();

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'gv-edit-save';
  save.textContent = 'Save changes';

  actions.append(cancel, save);
  form.append(heading, subtitle, titleLabel, descriptionLabel,
    categoryLabel, actions);
  dialog.append(form);
  document.body.append(dialog);

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  form.onsubmit = async event => {
    event.preventDefault();

    const newTitle = titleInput.value.trim();
    if (!newTitle) {
      titleInput.focus();
      return;
    }

    save.disabled = true;
    save.textContent = 'Saving…';

    try {
      let query = sb.from('posts')
        .update({
          title: newTitle,
          description: descriptionInput.value.trim(),
          category: categoryInput.value
        })
        .eq('id', post.id);

      // Non-admins may only edit their own posts.
      if (!admin) query = query.eq('user_id', user.id);

      const { data, error } = await query.select('id');

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          'No post was updated. Check your permissions or refresh the page.'
        );
      }

      dialog.close();
      await loadPosts();

      const message = $('admin-message');
      if (admin && message) {
        message.textContent = 'Post updated successfully.';
      }
    } catch (error) {
      alert('Could not update post: ' + error.message);
      save.disabled = false;
      save.textContent = 'Save changes';
    }
  };

  dialog.showModal();
  titleInput.focus();
}

function makePostCard(post, admin = false) {
  const c = document.createElement('article');
  c.className = 'card';

  const m = document.createElement('div');
  m.className = 'media';

  let el;

  if (post.media_type === 'video') {
    el = document.createElement('video');
    el.controls = true;
    el.preload = 'metadata';
  } else {
    el = document.createElement('img');
    el.loading = 'lazy';
    el.alt = post.title || 'Gaming media';
  }

  el.src = post.media_url;
  m.append(el);

  const b = document.createElement('div');
  b.className = 'cardbody';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = post.category || 'Gaming';

  const h = document.createElement('h3');
  h.textContent = post.title || 'Untitled post';
  b.append(tag, h);

  if (post.description) {
    const p = document.createElement('p');
    p.textContent = post.description;
    b.append(p);
  }

  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'view-post';
  view.textContent = 'Open post';
  view.onclick = () => openPost(post);
  b.append(view);

  if (user && (user.id === post.user_id || admin)) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'delete';
    d.textContent = admin ? 'Remove post' : 'Delete my post';
    d.onclick = () => deletePost(post, admin);
    b.append(d);
  }

  c.append(m, b);
  return c;
}
async function loadPosts(){if(!sb)return;const g=$('gallery-grid');g.textContent='Loading…';const r=await sb.from('posts').select('id,user_id,title,description,category,media_url,media_type,created_at,storage_path').order('created_at',{ascending:false}).limit(60);if(r.error){g.textContent=r.error.message;return}postsCache=r.data||[];if(!postsCache.length){g.textContent='The vault is empty. Be the first to share a gaming moment!'}else g.replaceChildren(...postsCache.map(p=>makePostCard(p,false)));if(isAdmin)renderAdminPosts()}

function confirmDeletePost(post, admin = false) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'gv-delete-dialog';

    const content = document.createElement('div');
    content.className = 'gv-delete-content';

    const icon = document.createElement('div');
    icon.className = 'gv-delete-icon';
    icon.textContent = '⌫';

    const title = document.createElement('h2');
    title.textContent = admin ? 'Remove this post?' : 'Delete your post?';

    const message = document.createElement('p');
    message.textContent =
      'This action cannot be undone. Are you sure you want to continue?';

    const postTitle = document.createElement('p');
    postTitle.className = 'gv-delete-post-title';
    postTitle.textContent = post.title || 'Untitled post';
    postTitle.style.marginTop = '12px';

    const actions = document.createElement('div');
    actions.className = 'gv-delete-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'gv-delete-cancel';
    cancel.textContent = 'Cancel';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'gv-delete-confirm';
    confirm.textContent = admin ? 'Remove post' : 'Delete post';

    actions.append(cancel, confirm);
    content.append(icon, title, message, postTitle, actions);
    dialog.append(content);
    document.body.append(dialog);

    let finished = false;

    function finish(confirmed) {
      if (finished) return;
      finished = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(confirmed);
    }

    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);

    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish(false);
    });

    dialog.addEventListener('click', event => {
      if (event.target === dialog) finish(false);
    });

    dialog.showModal();
    cancel.focus();
  });
}

async function deletePost(p, admin = false) {
  if (!await confirmDeletePost(p, admin)) return;

  const r = await sb.from('posts').delete().eq('id', p.id);

  if (r.error) {
    alert(r.error.message);
    return;
  }

  if (p.storage_path) {
    const f = await sb.storage.from('gamevault-media').remove([p.storage_path]);

    if (f.error) {
      alert('Post row deleted, but media removal failed: ' + f.error.message);
    }
  }

  await loadPosts();

  if (admin) $('admin-message').textContent = 'Post removed.';
}
function renderAdminPosts(){const g=$('admin-posts');$('admin-post-count').textContent=String(postsCache.length);g.replaceChildren(...postsCache.map(p=>makePostCard(p,true)));if(!postsCache.length)g.textContent='No posts to moderate.'}
$('admin-refresh').onclick=async()=>{if(!isAdmin)return;$('admin-message').textContent='Refreshing…';await loadPosts();$('admin-message').textContent='Posts refreshed.'};$('admin-close').onclick=()=>$('admin-panel').hidden=true;
