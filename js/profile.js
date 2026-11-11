
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let profileUser = null;

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
    .select('id, username, avatar_path, is_admin, created_at');

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
  username.textContent = '@' + profile.username;

  const role = document.createElement('span');
  role.className = 'gv-public-profile-role';
  role.textContent = profile.is_admin ? 'Administrator' : 'GameVault member';

  const joined = document.createElement('small');
  joined.textContent = 'Joined ' +
    new Date(profile.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long'
    });

  info.append(username, role, joined);
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

  if (error) {
    console.error('Profile session error:', error);
    setStatus('Could not check your sign-in status.');
    return;
  }

  currentUser = data.session?.user || null;

  await loadProfile();

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    setTimeout(() => {
      loadProfile();
    }, 0);
  });
}

initializeProfilePage().catch(error => {
  console.error('GameVault profile page error:', error);
  setStatus('Something went wrong.');
  showError('Could not load this profile. Please refresh the page.');
});
