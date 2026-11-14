import { initGameVaultAuthUI } from './auth-ui.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let authReady = false;
let profileUser = null;
let accountProfile = null;
let authUI = null;
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

if (isOwnProfile) {
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'button button-secondary';
  settingsButton.textContent = 'Account Settings';

  settingsButton.addEventListener('click', () => {
    $('settings-status').textContent = '';
    $('settings-form').reset();
    $('display-name').value = accountProfile?.display_name || '';
    $('settings-dialog').showModal();
  });

  info.append(settingsButton);
}

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
  authUI?.render();
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

  authUI = initGameVaultAuthUI({
  sb,
  getUser: () => currentUser,
  getProfile: () => accountProfile,
  getAvatarUrl: path => avatarUrl(path),
  onAction: action => {
  if (action === 'admin-portal') {
    window.location.href = 'index.html#admin';
  }
}

    if (action === 'my-posts') {
      window.location.href = 'index.html#gallery';
    }

    if (action === 'change-picture') {
      alert('Profile picture changing will be connected in a later step.');
    }

    if (action === 'admin-portal') {
      window.location.href = 'index.html#admin';
    }
  }
});

const { data, error } = await sb.auth.getSession();

  if (error) {
    console.error('Profile session error:', error);
    setStatus('Could not check your sign-in status.');
    return;
  }

  currentUser = data.session?.user || null;
  updateUpload();

await loadAccountProfile();
authUI?.setAuthReady(true);
await loadProfile();

  sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
    updateUpload();

  setTimeout(async () => {
    await loadAccountProfile();
authUI?.render();
await loadProfile();
  }, 0);
});
}
$('settings-close').onclick = () => {
  $('settings-dialog').close();
};

$('settings-form').onsubmit = async event => {
  event.preventDefault();

  if (!currentUser) return;

  const password = $('new-password').value;
  const confirm = $('confirm-password').value;
  const button = $('password-save');
  const status = $('settings-status');

  if (password.length < 8) {
    status.textContent = 'Password must be at least 8 characters.';
    return;
  }

  if (password !== confirm) {
    status.textContent = 'The passwords do not match.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Updating password…';

  try {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;

    status.textContent = 'Password updated successfully.';
    $('settings-form').reset();
  } catch (error) {
    status.textContent = 'Could not update password: ' + error.message;
  } finally {
    button.disabled = false;
  }
};

$('display-name-save').onclick = async () => {
  if (!currentUser) return;

  const displayName = $('display-name').value.trim();
  const button = $('display-name-save');
  const status = $('settings-status');

  if (!displayName || displayName.length > 32) {
    status.textContent = 'Enter a display name (1–32 characters).';
    return;
  }

  button.disabled = true;
  status.textContent = 'Saving display name…';

  try {
    const { error } = await sb
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', currentUser.id);

    if (error) throw error;

    accountProfile = {
      ...accountProfile,
      display_name: displayName
    };

    status.textContent = 'Display name saved successfully.';
    renderProfileAccount();
    await loadProfile();
  } catch (error) {
    status.textContent = 'Could not save display name: ' + error.message;
  } finally {
    button.disabled = false;
  }
};
$('profile-picture-change').onclick = () => {
  $('profile-picture-file').click();
};

$('profile-picture-file').onchange = async () => {
  const file = $('profile-picture-file').files[0];
  if (!file || !currentUser) return;

  const status = $('settings-status');
  const button = $('profile-picture-change');

  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  if (!extensions[file.type]) {
    status.textContent = 'Choose a JPG, PNG, or WebP image.';
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    status.textContent = 'Image must be 2 MB or smaller.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Uploading profile picture…';

  try {
    const path = `${currentUser.id}/avatar-${crypto.randomUUID()}.${extensions[file.type]}`;

    const { error: uploadError } = await sb.storage
      .from('gamevault-avatars')
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { error: updateError } = await sb
      .from('profiles')
      .update({ avatar_path: path })
      .eq('id', currentUser.id);

    if (updateError) throw updateError;

    accountProfile = {
      ...accountProfile,
      avatar_path: path
    };

    await loadProfile();
    renderProfileAccount();

    status.textContent = 'Profile picture updated successfully.';
  } catch (error) {
    status.textContent = 'Could not update picture: ' + error.message;
  } finally {
    button.disabled = false;
    $('profile-picture-file').value = '';
  }
};
initializeProfilePage().catch(error => {
  console.error('GameVault profile page error:', error);
  setStatus('Something went wrong.');
  showError('Could not load this profile. Please refresh the page.');
});
