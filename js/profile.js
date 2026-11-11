
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let authReady = false;
let profileUser = null;
let accountProfile = null;
function setStatus(message) {
  $('profile-page-status').textContent = message;
}

function showError(message) {
  $('profile-page-content').textContent = message;
}

function usernameOf(user) {
  return user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    'Player';
}

function avatarUrl(path) {
  if (!path) return '';

  const { data } = sb.storage
    .from('gamevault-avatars')
    .getPublicUrl(path);

  return data.publicUrl;
}

async function loadAccountProfile() {
  if (!currentUser) {
    accountProfile = null;
    return;
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_path, is_admin')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('Account profile loading error:', error);
    accountProfile = null;
    return;
  }

  accountProfile = data;
}


async function loadProfile() {
  const requestedUsername =
    new URLSearchParams(location.search).get('u');

  if (!currentUser) {
    $('profile-page-title').textContent = 'Player Profile';
    setStatus('Please sign in to view player profiles.');
    showError('Sign in to GameVault first, then open this profile again.');
    return;
  }

  let profileQuery = sb
    .from('profiles')
  .select('id, username, display_name, avatar_path, is_admin, created_at')
  if (requestedUsername) {
    profileQuery = profileQuery.eq('username', requestedUsername);
  } else {
    profileQuery = profileQuery.eq('id', currentUser.id);
  }

  const { data: profile, error } = await profileQuery.maybeSingle();

  if (error) {
    console.error('Profile loading error:', error);
    setStatus('Could not load this profile.');
    showError('Something went wrong while loading this player profile.');
    return;
  }

  if (!profile) {
    $('profile-page-title').textContent = 'Profile not found';
    setStatus('This player could not be found.');
    showError('The requested GameVault profile does not exist.');
    return;
  }

 profileUser = profile;
renderProfileAccount();

const isOwnProfile = profile.id === currentUser.id;

  $('profile-page-title').textContent = '@' + profile.username;
  setStatus(isOwnProfile ? 'Your GameVault profile' : 'GameVault player profile');

  const content = $('profile-page-content');
  content.replaceChildren();

  const header = document.createElement('div');
  header.className = 'gv-public-profile-header';

  const avatar = document.createElement('img');
  avatar.className = 'gv-public-profile-avatar';
  avatar.alt = profile.username + ' profile picture';
  avatar.src = avatarUrl(profile.avatar_path) ||
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<rect width="120" height="120" rx="60" fill="#263447"/>' +
      '<text x="60" y="78" text-anchor="middle" fill="white" font-size="52">' +
      profile.username.charAt(0).toUpperCase() +
      '</text></svg>'
    );

  const info = document.createElement('div');
  info.className = 'gv-public-profile-info';

  const username = document.createElement('h2');
  username.textContent = profile.display_name?.trim() || profile.username;
  const usernameTag = document.createElement('small');
usernameTag.textContent = '@' + profile.username;
  const role = document.createElement('span');
  role.className = 'gv-public-profile-role';
  role.textContent = profile.is_admin ? 'Administrator' : 'GameVault member';

  const joined = document.createElement('small');
  joined.textContent = 'Joined ' +
    new Date(profile.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long'
    });

  info.append(username, usernameTag, role, joined);
  header.append(avatar, info);

  const stats = document.createElement('div');
  stats.className = 'gv-public-profile-stats';

  const postsHeading = document.createElement('h3');
  postsHeading.textContent = 'Posts';

  const postsContainer = document.createElement('div');
  postsContainer.className = 'gv-public-profile-posts';

  const { data: posts, error: postsError } = await sb
    .from('posts')
    .select('id, user_id, title, description, category, media_url, media_type, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(60);

  if (postsError) {
    console.error('Profile posts error:', postsError);
    postsContainer.textContent = 'Could not load this player’s posts.';
  } else {
    const postCount = document.createElement('strong');
    postCount.textContent = String(posts.length);

    const postLabel = document.createElement('span');
    postLabel.textContent = 'Published posts';

    stats.append(postCount, postLabel);

    if (!posts.length) {
      postsContainer.textContent = 'This player has not published any posts yet.';
    } else {
      posts.forEach(post => {
        const card = document.createElement('article');
        card.className = 'gv-public-profile-post';

        const mediaLink = document.createElement('a');
        mediaLink.href = `post.html?id=${encodeURIComponent(post.id)}`;
        mediaLink.className = 'gv-public-profile-post-media';

        let media;

        if (post.media_type === 'video') {
          media = document.createElement('video');
          media.preload = 'metadata';
        } else {
          media = document.createElement('img');
          media.loading = 'lazy';
          media.alt = post.title || 'Gaming post';
        }

        media.src = post.media_url;
        mediaLink.append(media);

        const title = document.createElement('a');
        title.className = 'gv-public-profile-post-title';
        title.href = mediaLink.href;
        title.textContent = post.title || 'Untitled post';

        const category = document.createElement('small');
        category.textContent = post.category || 'Gaming';

        card.append(mediaLink, category, title);
        postsContainer.append(card);
      });
    }
  }

  content.append(header, stats, postsHeading, postsContainer);
}


function renderProfileAccount() {
  const signIn = $('auth-open');
  const account = $('account');

  account.replaceChildren();

  if (!currentUser) {
    signIn.hidden = !authReady;
    return;
  }

  signIn.hidden = true;

  const username = usernameOf(currentUser);
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

  const ownProfile = accountProfile;
  const displayName = ownProfile?.display_name?.trim() || username;
  avatar.src = avatarUrl(ownProfile?.avatar_path) ||
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
      '<rect width="40" height="40" rx="20" fill="#263447"/>' +
      '<text x="20" y="27" text-anchor="middle" fill="white" font-size="22">' +
      username.charAt(0).toUpperCase() +
      '</text></svg>'
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
  headingLabel.textContent = ownProfile?.is_admin
    ? 'Administrator'
    : 'GameVault member';

  heading.append(headingName, headingLabel);
  dropdown.append(heading);

  function closeMenu() {
    dropdown.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function addLink(label, href, icon) {
    const link = document.createElement('a');
    link.className = 'profile-menu-item';
    link.href = href;

    const symbol = document.createElement('span');
    symbol.className = 'profile-menu-icon';
    symbol.textContent = icon;

    const text = document.createElement('span');
    text.textContent = label;

    link.append(symbol, text);
    link.addEventListener('click', closeMenu);
    dropdown.append(link);
  }

  addLink('My Profile', 'profile.html', '◉');
  addLink('Friends Chat', 'dm.html', '✉');

  const separator = document.createElement('div');
  separator.className = 'profile-menu-divider';
  dropdown.append(separator);

  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'profile-menu-item';

  const signOutIcon = document.createElement('span');
  signOutIcon.className = 'profile-menu-icon';
  signOutIcon.textContent = '↪';

  const signOutText = document.createElement('span');
  signOutText.textContent = 'Sign Out';

  signOut.append(signOutIcon, signOutText);

  signOut.addEventListener('click', async () => {
    closeMenu();
    signOut.disabled = true;

    const { error } = await sb.auth.signOut();

    if (error) {
      alert('Could not sign out: ' + error.message);
      signOut.disabled = false;
    }
  });

  dropdown.append(signOut);
  menu.append(trigger, dropdown);
  account.append(menu);

  trigger.addEventListener('click', () => {
    const opening = dropdown.hidden;
    dropdown.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
  });

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
}

function updateUpload() {
  $('upload-button').disabled = !currentUser;
  $('upload-status').textContent = currentUser
    ? 'Signed in. Files are limited to 20 MB.'
    : 'Sign in before uploading.';

  $('upload-open').hidden = !authReady || !currentUser;
}

$('upload-open')?.addEventListener('click', () => {
  $('upload-dialog')?.showModal();
});

$('upload-close')?.addEventListener('click', () => {
  $('upload-form').reset();
  clearUploadPreview();
  $('upload-dialog')?.close();
});
$('upload-dialog')?.addEventListener('close', () => {
  $('upload-form').reset();
  clearUploadPreview();
});
async function uploadFileWithProgress(path, file) {
  const { data: sessionData, error: sessionError } =
    await sb.auth.getSession();

  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${SUPABASE_URL}/storage/v1/object/gamevault-media/${encodedPath}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', url);
    xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return;

      const percent = Math.round((event.loaded / event.total) * 100);
      const uploadedMB = (event.loaded / (1024 * 1024)).toFixed(2);
      const totalMB = (event.total / (1024 * 1024)).toFixed(2);

      $('upload-progress-bar').style.width = `${percent}%`;
      $('upload-progress-percent').textContent = `${percent}%`;
      $('upload-progress-label').textContent = 'Uploading media…';
      $('upload-progress-size').textContent =
        `${uploadedMB} MB of ${totalMB} MB uploaded`;
    });

    xhr.onload = () => {
      let response = {};

      try {
        response = JSON.parse(xhr.responseText);
      } catch {}

      if (xhr.status >= 200 && xhr.status < 300) {
        $('upload-progress-bar').style.width = '100%';
        $('upload-progress-percent').textContent = '100%';
        $('upload-progress-label').textContent = 'Upload complete';
        $('upload-progress-size').textContent =
          `${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded`;
        resolve(response);
      } else {
        reject(new Error(
          response.message || response.error || `Upload failed (${xhr.status}).`
        ));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    xhr.send(file);
  });
}

let uploadPreviewUrl = '';
function clearUploadPreview() {
  if (uploadPreviewUrl) {
    URL.revokeObjectURL(uploadPreviewUrl);
    uploadPreviewUrl = '';
  }

  $('upload-preview').hidden = true;
  $('upload-preview-media').replaceChildren();
  $('upload-file-name').textContent = '';
  $('upload-file-size').textContent = '';
  $('upload-progress-label').textContent = 'Ready to upload';
  $('upload-progress-percent').textContent = '0%';
  $('upload-progress-bar').style.width = '0%';
  $('upload-progress-size').textContent = '0 MB uploaded';
}
$('upload-remove-file')?.addEventListener('click', () => {
  $('media').value = '';
  clearUploadPreview();
});
$('media')?.addEventListener('change', () => {
  const file = $('media').files?.[0];
  const preview = $('upload-preview');
  if (!preview) return;

  if (uploadPreviewUrl) {
    URL.revokeObjectURL(uploadPreviewUrl);
    uploadPreviewUrl = '';
  }

  const mediaBox = $('upload-preview-media');
  mediaBox.replaceChildren();

  if (!file) {
    preview.hidden = true;
    return;
  }

  preview.hidden = false;
  $('upload-file-name').textContent = file.name;
  $('upload-file-size').textContent =
    `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

  const media = document.createElement(
    file.type.startsWith('video/') ? 'video' : 'img'
  );

  uploadPreviewUrl = URL.createObjectURL(file);
  media.src = uploadPreviewUrl;

  if (file.type.startsWith('video/')) {
    media.controls = true;
    media.preload = 'metadata';
  } else {
    media.alt = file.name;
  }

  mediaBox.appendChild(media);
  $('upload-progress-label').textContent = 'Ready to upload';
  $('upload-progress-percent').textContent = '0%';
  $('upload-progress-bar').style.width = '0%';
  $('upload-progress-size').textContent = '0 MB uploaded';
});


$('upload-form').onsubmit = async event => {
  event.preventDefault();

  if (!currentUser) {
    $('upload-status').textContent = 'Please sign in before uploading.';
    return;
  }

  const file = $('media').files[0];
  if (!file) return;

  if (file.size > 20 * 1024 * 1024) {
    $('upload-status').textContent = 'File exceeds 20 MB. Choose a smaller file.';
    return;
  }

  if (
    !file.type.startsWith('image/') &&
    !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)
  ) {
    $('upload-status').textContent =
      'Choose an image, MP4, WebM, or QuickTime video.';
    return;
  }

  $('upload-button').disabled = true;
  $('upload-status').textContent = 'Uploading…';

  let path = '';

  try {
    const safe = file.name.toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .slice(-90);

    path = `${currentUser.id}/${crypto.randomUUID()}-${safe}`;

  await uploadFileWithProgress(path, file);

    const url = sb.storage
      .from('gamevault-media')
      .getPublicUrl(path).data.publicUrl;

    const result = await sb.from('posts').insert({
      user_id: currentUser.id,
      title: $('title').value.trim(),
      description: $('description').value.trim(),
      category: $('category').value,
      media_url: url,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      storage_path: path
    });

    if (result.error) {
      await sb.storage.from('gamevault-media').remove([path]);
      throw result.error;
    }

    $('upload-form').reset();
clearUploadPreview();
$('upload-status').textContent = 'Uploaded successfully!';
await loadProfile();
$('upload-dialog').close();

  } catch (error) {
    $('upload-status').textContent =
      error.message || 'Upload failed. Check Storage and RLS policies.';
  } finally {
    updateUpload();
  }
};


async function initializeProfilePage() {
  if (
    !SUPABASE_URL.startsWith('https://') ||
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_URL.includes('PASTE_YOUR') ||
    SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR')
  ) {
    setStatus('Supabase is not configured.');
    showError('Check the Supabase settings in js/config.js.');
    return;
  }

  const { data, error } = await sb.auth.getSession();
  authReady = true;

  if (error) {
    console.error('Profile session error:', error);
    setStatus('Could not check your sign-in status.');
    return;
  }

  currentUser = data.session?.user || null;
  updateUpload();

await loadAccountProfile();
renderProfileAccount();
await loadProfile();

  sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
    updateUpload();

  setTimeout(async () => {
    await loadAccountProfile();
    renderProfileAccount();
    await loadProfile();
  }, 0);
});
}

initializeProfilePage().catch(error => {
  console.error('GameVault profile page error:', error);
  setStatus('Something went wrong.');
  showError('Could not load this profile. Please refresh the page.');
});
