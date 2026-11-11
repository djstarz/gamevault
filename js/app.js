import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
let sb=null,user=null,signup=false,isAdmin=false,postsCache=[],avatarUrl=null;
let reactionsCache = {};
let authReady = false;
let chatChannel = null;
let chatStarted = false;
let dmConversationsCache = [];
let presenceTimer = null;

async function updateGameVaultPresence() {
  if (!user) return;

  const { error } = await sb
    .from('gamevault_presence')
    .upsert({
      user_id: user.id,
      last_seen: new Date().toISOString()
    });

  if (error) {
    console.error('Presence update error:', error);
  }
}

function startGameVaultPresence() {
  if (presenceTimer) clearInterval(presenceTimer);

  if (!user) {
    presenceTimer = null;
    return;
  }

  updateGameVaultPresence();
  presenceTimer = setInterval(updateGameVaultPresence, 30000);
}
let dmRequestsCache = [];
let activeDmConversation = null;
let dmChannel = null;

// Username accounts are mapped to a synthetic, non-deliverable address. Disable email confirmation in Supabase Auth.
const accountEmail = name => `${name.toLowerCase()}@username.gamevault.invalid`;
const configured=SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('PASTE_YOUR')&&SUPABASE_PUBLISHABLE_KEY&&!SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR');
if(configured){sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);start()}else{$('gallery-grid').textContent='Add your Supabase URL and publishable key in js/config.js to connect the vault.';$('upload-status').textContent='Waiting for Supabase configuration.'}
async function start() {
  $('dm-search-button')?.addEventListener('click', searchGameVaultUsers);
  const { data } = await sb.auth.getSession();
  authReady = true;
  user = data.session?.user || null;
  startGameVaultPresence();
  await refreshAdmin();
  await loadAvatar();
  renderAccount();
  updateChatAccess();
  await loadPosts();
if ($('community-chat')) await initializeChat();
await loadDmRequests();
await loadDmConversations();
  
  sb.auth.onAuthStateChange((_e, s) => {
  user = s?.user || null;
  startGameVaultPresence();

  setTimeout(async () => {
      await refreshAdmin();
      await loadAvatar();
      renderAccount();
      updateUpload();
      updateChatAccess();
      await loadPosts();
await loadDmRequests();
await loadDmConversations();
    }, 0);
  });

  updateUpload();
}
function usernameOf(u){return u?.user_metadata?.username||u?.email?.split('@')[0]||'Player'}
function createGameVaultAvatar(username, avatarUrl, className = 'gv-inline-avatar') {
  const name = username || 'Player';
  const initial = name.charAt(0).toUpperCase();

  const fallback =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
        <circle cx="20" cy="20" r="20" fill="#263447"/>
        <text x="20" y="27" text-anchor="middle" fill="#ffffff" font-size="20">${initial}</text>
      </svg>`
    );

  const avatar = document.createElement('img');
  avatar.className = className;
  avatar.alt = '';
  avatar.width = 32;
  avatar.height = 32;
  avatar.src = avatarUrl || fallback;

  avatar.onerror = () => {
    avatar.onerror = null;
    avatar.src = fallback;
  };

  return avatar;
}

async function searchGameVaultUsers() {
  const input = $('dm-user-search');
  const results = $('dm-search-results');
  const term = input.value.trim();

  results.replaceChildren();

  if (!user) {
    results.textContent = 'Please sign in to search for users.';
    return;
  }

  if (!/^[A-Za-z0-9_]{3,24}$/.test(term)) {
    results.textContent = 'Enter a username (3–24 characters).';
    return;
  }

  results.textContent = 'Searching...';

  const { data, error } = await sb.rpc(
    'search_gamevault_users',
    { search_term: term }
  );

  results.replaceChildren();

  if (error) {
    results.textContent = 'Could not search users. Please try again.';
    console.error('DM user search error:', error);
    return;
  }

  if (!data || data.length === 0) {
    results.textContent = 'No matching users found.';
    return;
  }

  data.forEach(result => {
    const item = document.createElement('div');
    item.className = 'gv-dm-search-result';

    const name = document.createElement('span');
    name.textContent = '@' + result.username;

    const requestButton = document.createElement('button');
    requestButton.type = 'button';
    requestButton.textContent = 'Send request';

    requestButton.addEventListener('click', async () => {
      requestButton.disabled = true;
      requestButton.textContent = 'Sending...';

      const { error: requestError } = await sb
        .from('dm_requests')
        .insert({
          sender_id: user.id,
          recipient_id: result.user_id,
          status: 'pending'
        });

      if (requestError) {
        requestButton.disabled = false;

        if (requestError.code === '23505') {
          requestButton.textContent = 'Already requested';
        } else {
          requestButton.textContent = 'Try again';
          console.error('DM request error:', requestError);
        }

        return;
      }

      requestButton.textContent = 'Request sent';
    });

    item.append(name, requestButton);
    results.appendChild(item);
  });
}
async function loadDmRequests() {
  const list = $('dm-requests');
  const count = $('dm-request-count');

  if (!list || !count) return;

  list.replaceChildren();
  count.textContent = '0';

  if (!user) return;

  const { data, error } = await sb.rpc('get_dm_requests');

  if (error) {
    list.textContent = 'Could not load message requests.';
    console.error('DM requests error:', error);
    return;
  }

  count.textContent = String(data.length);

  if (!data.length) {
    list.textContent = 'No pending requests.';
    return;
  }

  data.forEach(request => {
    const item = document.createElement('div');
    item.className = 'gv-dm-request';

    const username = document.createElement('strong');
    username.textContent = request.username;

    const message = document.createElement('p');
    message.textContent = 'Wants to start a conversation.';

    const actions = document.createElement('div');
    actions.className = 'gv-dm-request-actions';

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Accept';

    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Decline';

    async function respond(status) {
      accept.disabled = true;
      decline.disabled = true;

      const { error } = await sb
        .from('dm_requests')
        .update({ status })
        .eq('id', request.request_id);

      if (error) {
        console.error('DM request response error:', error);
        accept.disabled = false;
        decline.disabled = false;
        return;
      }

      await loadDmRequests();
      await loadDmConversations();
    }

    accept.addEventListener('click', () => respond('accepted'));
    decline.addEventListener('click', () => respond('declined'));

    actions.append(accept, decline);
    item.append(username, message, actions);
    list.append(item);
  });
}
async function loadDmConversations() {
  const container = $('dm-conversations');
  if (!container || !sb || !user) return;

  const { data, error } = await sb.rpc('get_dm_conversations');

  if (error) {
    console.error('DM conversations error:', error);
    container.textContent = 'Could not load conversations.';
    return;
  }

  dmConversationsCache = data || [];
  container.replaceChildren();

  if (!dmConversationsCache.length) {
    container.textContent = 'No conversations yet.';
    return;
  }

  dmConversationsCache.forEach(conversation => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gv-dm-conversation';
    button.dataset.conversationId = conversation.conversation_id;
    button.dataset.username = conversation.username;
    button.textContent = conversation.username || 'Player';

    container.appendChild(button);
  });
}
$('dm-conversations')?.addEventListener('click', event => {
  const button = event.target.closest('.gv-dm-conversation');
  if (!button) return;

  const conversation = dmConversationsCache.find(
    item => item.conversation_id === button.dataset.conversationId
  );

  if (!conversation) return;

  activeDmConversation = conversation;

  $('dm-chat-empty').hidden = true;
  $('dm-chat-active').hidden = false;
  $('dm-chat-username').textContent = conversation.username || 'Player';

$('dm-messages').replaceChildren();
$('dm-message-feedback').textContent = '';

document.querySelectorAll('.gv-dm-conversation').forEach(item => {
  item.classList.toggle('active', item === button);
});

loadDmMessages();
subscribeToDmConversation(conversation.conversation_id);
});
async function loadDmMessages() {
  const container = $('dm-messages');

  if (!container || !sb || !user || !activeDmConversation) return;

  const conversationId = activeDmConversation.conversation_id;

  container.textContent = 'Loading messages...';

  const { data, error } = await sb
    .from('dm_messages')
    .select('id,conversation_id,sender_id,body,shared_post_id,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('DM messages error:', error);
    container.textContent = 'Could not load messages.';
    return;
  }

  // Ignore results if the user switched conversations while loading.
  if (activeDmConversation?.conversation_id !== conversationId) return;

  container.replaceChildren();

  if (!data || !data.length) {
    container.textContent = 'No messages yet. Say hello!';
    return;
  }

  for (const message of data) {
    const bubble = document.createElement('div');
    bubble.className = 'gv-dm-bubble';

    const own = message.sender_id === user.id;

    if (own) bubble.classList.add('own');

    const sender = document.createElement('strong');
    sender.textContent = own
      ? 'You'
      : activeDmConversation.username || 'Player';

    const time = document.createElement('time');
    const date = new Date(message.created_at);
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleString();

    const body = document.createElement('p');
    body.textContent = message.body || '';

    bubble.append(sender, time);

    if (message.body) {
      bubble.append(body);
    }

    if (message.shared_post_id) {
      const shared = document.createElement('button');
      shared.type = 'button';
      shared.className = 'gv-shared-post-card';
      shared.textContent = 'Loading shared post…';

      const { data: sharedPost, error: sharedError } = await sb
        .from('posts')
        .select('id,user_id,title')
        .eq('id', message.shared_post_id)
        .maybeSingle();

      if (sharedError || !sharedPost) {
        shared.textContent = 'Shared post unavailable';
      } else {
        const { data: author } = await sb
          .from('profiles')
          .select('username')
          .eq('id', sharedPost.user_id)
          .maybeSingle();

        shared.textContent =
          `📎 ${sharedPost.title || 'Untitled post'} · By ${author?.username || 'Player'} — View post`;

        shared.onclick = async () => {
          let post = postsCache.find(
            item => item.id === message.shared_post_id
          );

          if (!post) {
            const { data, error } = await sb
              .from('posts')
              .select('id,user_id,title,description,category,media_url,media_type,created_at')
              .eq('id', message.shared_post_id)
              .maybeSingle();

            if (error || !data) {
              shared.textContent = 'Shared post unavailable';
              return;
            }

            post = data;
          }

          openPost(post);
        };
      }

      bubble.append(shared);
    }

    container.appendChild(bubble);
  }

  container.scrollTop = container.scrollHeight;
}
function subscribeToDmConversation(conversationId) {
  if (dmChannel) {
    sb.removeChannel(dmChannel);
    dmChannel = null;
  }

  if (!sb || !conversationId) return;

  dmChannel = sb
    .channel(`dm-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      () => {
        loadDmMessages();
      }
    )
    .subscribe();
}
$('dm-message-form')?.addEventListener('submit', sendDmMessage);
async function sendDmMessage(event) {
  event.preventDefault();

  if (!user || !activeDmConversation) {
    $('dm-message-feedback').textContent =
      'Select a conversation first.';
    return;
  }

  const input = $('dm-message-input');
const button = $('dm-message-form').querySelector('button');
  const body = input.value.trim();

  if (!body) return;

  button.disabled = true;
  $('dm-message-feedback').textContent = 'Sending...';

  const { error } = await sb
    .from('dm_messages')
    .insert({
      conversation_id: activeDmConversation.conversation_id,
      sender_id: user.id,
      body
    });

  if (error) {
    console.error('DM send error:', error);
    $('dm-message-feedback').textContent =
      'Could not send message. Please try again.';
    button.disabled = false;
    return;
  }

  input.value = '';
  $('dm-message-feedback').textContent = 'Message sent.';

  await loadDmMessages();

  button.disabled = false;
  input.focus();
}
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
  if (!sb || !user || !file) return false;

  const types = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  if (!types[file.type]) {
    alert('Choose a JPG, PNG, or WebP image.');
    return false;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('Profile pictures must be 2 MB or smaller.');
    return false;
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
    return false;
  }

  const { error: profileError } = await sb
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', user.id);

  if (profileError) {
    alert('Image uploaded, but saving the profile failed: ' +
      profileError.message);
    return false;
  }

  await loadAvatar();
  renderAccount();
  return true;
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

  $('auth-open').hidden = !authReady || !!user;

    if (!user) {
    isAdmin = false;
    avatarUrl = null;
    $('admin-panel').hidden = true;
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
  if (file) await openAvatarCrop(file);
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
    window.location.href = 'profile.html';
  }, '◉');

  addItem('Friends Chat', () => {
  closeMenu();
  window.location.href = 'dm.html';
}, '✉');
  
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

  addItem('Account Settings', () => {
  closeMenu();
  $('settings-status').textContent = '';
  $('settings-form').reset();
  $('settings-dialog').showModal();
}, '⚙');

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

function updateUpload() {
  $('upload-button').disabled = !user;
  $('upload-status').textContent = user
    ? 'Signed in. Files are limited to 20 MB.'
    : 'Sign in before uploading.';

  const openButton = $('upload-open');
  if (openButton) openButton.hidden = !authReady || !user;
}

$('upload-open')?.addEventListener('click', () => {
  $('upload-dialog')?.showModal();
});
document.querySelectorAll('.upload-trigger').forEach(button => {
  button.addEventListener('click', () => {
    $('upload-dialog')?.showModal();
  });
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

$('upload-form').onsubmit=async e=>{e.preventDefault();if(!user)return openAuth();const f=$('media').files[0];if(!f)return;if(f.size>20*1024*1024){$('upload-status').textContent='File exceeds 20 MB. Choose a smaller file.';return}if(!f.type.startsWith('image/')&&!['video/mp4','video/webm','video/quicktime'].includes(f.type)){$('upload-status').textContent='Choose an image, MP4, WebM, or QuickTime video.';return}$('upload-button').disabled=true;$('upload-status').textContent='Uploading…';let path='';try{const safe=f.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(-90);path=`${user.id}/${crypto.randomUUID()}-${safe}`;await uploadFileWithProgress(path, f);const url=sb.storage.from('gamevault-media').getPublicUrl(path).data.publicUrl;const ins=await sb.from('posts').insert({user_id:user.id,title:$('title').value.trim(),description:$('description').value.trim(),category:$('category').value,media_url:url,media_type:f.type.startsWith('video/')?'video':'image',storage_path:path});if(ins.error){await sb.storage.from('gamevault-media').remove([path]);throw ins.error}$('upload-form').reset();clearUploadPreview();$('upload-status').textContent='Uploaded successfully!';await loadPosts();$('upload-dialog').close()}catch(err){$('upload-status').textContent=err.message||'Upload failed. Check Storage and RLS policies.'}finally{updateUpload()}};

async function loadPostComments(postId, dialog) {
  const list = dialog.querySelector('#post-comments-list');
  list.textContent = 'Loading comments...';

  const { data, error } = await sb
    .from('post_comments')
    .select('id,post_id,user_id,parent_id,username,content,created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    list.textContent = 'Could not load comments: ' + error.message;
    return;
  }

  const comments = data || [];
  const roots = comments.filter(comment => !comment.parent_id);

  list.replaceChildren();

  if (!comments.length) {
    list.textContent = 'No comments yet. Be the first!';
    return;
  }

  function renderComment(comment, depth = 0) {
    const item = document.createElement('div');
    item.style.cssText =
      `margin:12px 0 12px ${depth ? '22px' : '0'};` +
      'padding:10px;border-left:2px solid #394150;';

        const heading = document.createElement('a');
    heading.textContent = '@' + (comment.username || 'Player');
    heading.href = `profile.html?u=${encodeURIComponent(comment.username || '')}`;
    heading.className = 'gv-profile-link';

    const time = document.createElement('small');
    time.textContent = ' · ' +
      new Date(comment.created_at).toLocaleString();

    const content = document.createElement('p');
    content.textContent = comment.content;
    content.style.cssText = 'margin:6px 0;white-space:pre-wrap;';

    item.append(heading, time, content);
    if (user && user.id === comment.user_id) {
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:6px;';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';

  edit.onclick = () => {
    if (item.querySelector('.comment-edit-form')) return;

    const form = document.createElement('form');
    form.className = 'comment-edit-form';

    const input = document.createElement('textarea');
    input.value = comment.content;
    input.maxLength = 1000;
    input.required = true;
    input.style.cssText =
      'display:block;width:100%;min-height:60px;margin:8px 0;' +
      'padding:8px;background:#1c222d;color:#fff;' +
      'border:1px solid #394150;border-radius:8px;';

    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => form.remove();

    form.append(input, save, cancel);

    form.onsubmit = async event => {
      event.preventDefault();

      const updated = input.value.trim();
      if (!updated) return;

      save.disabled = true;

      const { error } = await sb
        .from('post_comments')
        .update({ content: updated })
        .eq('id', comment.id)
        .eq('user_id', user.id);

      if (error) {
        alert('Could not edit comment: ' + error.message);
        save.disabled = false;
        return;
      }

      await loadPostComments(postId, dialog);
    };

    item.append(form);
    input.focus();
  };

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Delete';

  remove.onclick = async () => {
    if (!confirm('Delete this comment? Any replies beneath it will also be deleted.')) {
      return;
    }

    remove.disabled = true;

    const { error } = await sb
      .from('post_comments')
      .delete()
      .eq('id', comment.id)
      .eq('user_id', user.id);

    if (error) {
      alert('Could not delete comment: ' + error.message);
      remove.disabled = false;
      return;
    }

    await loadPostComments(postId, dialog);
  };

  actions.append(edit, remove);
  item.append(actions);
}

    if (user) {
      const reply = document.createElement('button');
      reply.type = 'button';
      reply.textContent = 'Reply';
      reply.style.cssText = 'cursor:pointer;margin-top:4px;';

      reply.onclick = () => {
        if (item.querySelector('.comment-reply-form')) return;

        const form = document.createElement('form');
        form.className = 'comment-reply-form';

        const input = document.createElement('textarea');
        input.maxLength = 1000;
        input.required = true;
        input.placeholder = 'Write a reply...';
        input.style.cssText =
          'display:block;width:100%;min-height:60px;margin:8px 0;' +
          'padding:8px;background:#1c222d;color:#fff;' +
          'border:1px solid #394150;border-radius:8px;';

        const send = document.createElement('button');
        send.type = 'submit';
        send.textContent = 'Send reply';

        form.append(input, send);

        form.onsubmit = async event => {
          event.preventDefault();
          const text = input.value.trim();
          if (!text || !user) return;

          send.disabled = true;

          const { error } = await sb.from('post_comments').insert({
            post_id: postId,
            parent_id: comment.id,
            user_id: user.id,
            username: usernameOf(user),
            content: text
          });

          if (error) {
            alert('Could not post reply: ' + error.message);
            send.disabled = false;
            return;
          }

          await loadPostComments(postId, dialog);
        };

        item.append(form);
        input.focus();
      };

      item.append(reply);
    }

    comments
      .filter(child => child.parent_id === comment.id)
      .forEach(child => item.append(renderComment(child, depth + 1)));

    return item;
  }

  roots.forEach(comment => list.append(renderComment(comment)));
}
function getPostShareUrl(post) {
  const url = new URL('post.html', window.location.href);
  url.searchParams.set('post', post.id);
  return url.toString();
}
function openMediaViewer(post) {
  document.getElementById('gv-media-viewer')?.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'gv-media-viewer';

  dialog.style.cssText = `
    width:min(1200px,96vw);
    max-width:1200px;
    max-height:92vh;
    padding:0;
    overflow:hidden;
    background:#111722;
    color:#dce8f7;
    border:1px solid #39465a;
    border-radius:14px;
  `;

  dialog.innerHTML = `
    <button type="button" id="gv-media-close"
      aria-label="Close viewer"
      style="position:absolute;top:12px;left:12px;z-index:5">
      ✕
    </button>

    <div class="gv-media-viewer-layout">
      <div id="gv-media-display"></div>

      <aside class="gv-media-side">
        <div id="gv-media-reactions"></div>

        <button type="button" id="gv-media-comment-toggle">
          💬 Comment
        </button>

        <button type="button" id="gv-media-share">
          ↗ Share
        </button>

        <h2 id="gv-media-title"></h2>
        <p id="gv-media-description"></p>

        <section id="gv-media-comments" hidden>
          <h3>Comments</h3>
          <div id="post-comments-list">Loading comments...</div>

          <form id="post-comment-form">
            <textarea id="post-comment-input"
              maxlength="1000"
              placeholder="Write a comment..."
              required></textarea>
            <button type="submit">Post comment</button>
          </form>
        </section>
      </aside>
    </div>
  `;

  const media = dialog.querySelector('#gv-media-display');

  const element = document.createElement(
    post.media_type === 'video' ? 'video' : 'img'
  );

  element.src = post.media_url;

  if (post.media_type === 'video') {
    element.controls = true;
    element.preload = 'metadata';
  } else {
    element.alt = post.title || 'Gaming media';
  }

  media.append(element);

  dialog.querySelector('#gv-media-title').textContent =
    post.title || 'Untitled post';

  dialog.querySelector('#gv-media-description').textContent =
    post.description || '';

  dialog.querySelector('#gv-media-reactions')
    .append(createPostReactions(post));

  dialog.querySelector('#gv-media-comment-toggle').onclick = () => {
    const comments = dialog.querySelector('#gv-media-comments');
    comments.hidden = !comments.hidden;

    if (!comments.hidden) {
      loadPostComments(post.id, dialog);
    }
  };

  dialog.querySelector('#gv-media-share').onclick = () => {
  openSharePost(post, dialog);
};

  dialog.querySelector('#gv-media-close').onclick = () => dialog.close();

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  const form = dialog.querySelector('#post-comment-form');
  const input = dialog.querySelector('#post-comment-input');

  form.hidden = !user;

  form.onsubmit = async event => {
    event.preventDefault();

    if (!user) return openAuth();

    const content = input.value.trim();
    if (!content) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    const { error } = await sb.from('post_comments').insert({
      post_id: post.id,
      user_id: user.id,
      username: usernameOf(user),
      content
    });

    if (error) {
      alert('Could not post comment: ' + error.message);
    } else {
      input.value = '';
      await loadPostComments(post.id, dialog);
    }

    button.disabled = false;
  };

  document.body.append(dialog);
  dialog.showModal();
}
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

  <hr style="border-color:#394150;margin:20px 0">

  <section id="post-comments">
    <h3>Comments</h3>
    <div id="post-comments-list">Loading comments...</div>

    <form id="post-comment-form" style="margin-top:16px">
      <textarea id="post-comment-input"
        placeholder="Write a comment..."
        maxlength="1000"
        required
        style="width:100%;min-height:80px;padding:10px;background:#1c222d;color:#fff;border:1px solid #394150;border-radius:8px;resize:vertical"></textarea>

      <button type="submit"
        style="margin-top:8px;padding:9px 16px;cursor:pointer">
        Post comment
      </button>
    </form>
  </section>
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

const commentForm = dialog.querySelector('#post-comment-form');
const commentInput = dialog.querySelector('#post-comment-input');

commentForm.hidden = !user;

commentForm.onsubmit = async event => {
  event.preventDefault();

  if (!user) return openAuth();

  const content = commentInput.value.trim();
  if (!content) return;

  const button = commentForm.querySelector('button[type="submit"]');
  button.disabled = true;

  const { error } = await sb.from('post_comments').insert({
    post_id: post.id,
    user_id: user.id,
    username: usernameOf(user),
    content
  });

  if (error) {
    alert('Could not post comment: ' + error.message);
  } else {
    commentInput.value = '';
    await loadPostComments(post.id, dialog);
  }

  button.disabled = false;
};

loadPostComments(post.id, dialog);

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
  'Screenshots',
  'Wallpapers',
  'Edits',
  'Clips',
  'Builds',
  'Guides'
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

const POST_REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎮'];

function createPostReactions(post) {
  const container = document.createElement('div');
  container.className = 'post-reactions';

  const reactions = reactionsCache[post.id] || [];
  const myReaction = reactions.find(
    reaction => user && reaction.user_id === user.id
  );

  POST_REACTION_EMOJIS.forEach(emoji => {
    const count = reactions.filter(
      reaction => reaction.reaction === emoji
    ).length;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-reaction';
    button.textContent = `${emoji} ${count}`;
    button.title = `${emoji} reaction`;
    button.setAttribute(
      'aria-pressed',
      String(myReaction?.reaction === emoji)
    );

    if (myReaction?.reaction === emoji) {
      button.classList.add('selected');
    }

    button.onclick = async () => {
      if (!user) {
        openAuth();
        return;
      }

      if (button.disabled) return;

      container.querySelectorAll('button').forEach(
        item => item.disabled = true
      );

      let result;

      if (myReaction?.reaction === emoji) {
        result = await sb
          .from('post_reactions')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
      } else {
        result = await sb
          .from('post_reactions')
          .upsert(
            {
              post_id: post.id,
              user_id: user.id,
              reaction: emoji
            },
            { onConflict: 'post_id,user_id' }
          );
      }

      if (result.error) {
        alert('Could not save reaction: ' + result.error.message);
        container.querySelectorAll('button').forEach(
          item => item.disabled = false
        );
        return;
      }

      const refreshed = await sb
        .from('post_reactions')
        .select('post_id,user_id,reaction')
        .eq('post_id', post.id);

      if (refreshed.error) {
        alert('Reaction saved, but counts could not refresh: ' +
          refreshed.error.message);
        return;
      }

      reactionsCache[post.id] = refreshed.data || [];
      container.replaceWith(createPostReactions(post));
    };

    container.append(button);
  });

  return container;
}
function makePostCard(post, admin = false) {
  const c = document.createElement('article');
  c.className = 'card';

  const m = document.createElement('div');
  m.className = 'media';

  let el;

  if (post.media_type === 'video') {
    el = document.createElement('video');
el.controls = false;
el.preload = 'metadata';
  } else {
    el = document.createElement('img');
    el.loading = 'lazy';
    el.alt = post.title || 'Gaming media';
  }

 el.src = post.media_url;
m.append(el);

m.style.cursor = 'pointer';
m.setAttribute('role', 'button');
m.setAttribute('tabindex', '0');
m.setAttribute('aria-label', 'Open post media');

m.addEventListener('click', () => openMediaViewer(post));

m.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openMediaViewer(post);
  }
});
  const b = document.createElement('div');
  b.className = 'cardbody';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = post.category || 'Gaming';

  const h = document.createElement('h3');

const titleLink = document.createElement('a');
titleLink.href = `post.html?id=${encodeURIComponent(post.id)}`;
titleLink.textContent = post.title || 'Untitled post';

h.append(titleLink);
b.append(tag, h);

const author = document.createElement('a');
author.className = 'gv-profile-link';
author.textContent = '@' + (post.username || 'Player');
author.href = `profile.html?u=${encodeURIComponent(post.username || '')}`;
b.append(author);

  if (post.description) {
    const p = document.createElement('p');
    p.textContent = post.description;
    b.append(p);
  }
    b.append(createPostReactions(post));
  const comment = document.createElement('button');
  comment.type = 'button';
  comment.className = 'gv-comment-post';
  comment.textContent = '💬 Comment';
  comment.onclick = () => {
    openMediaViewer(post);
    document.querySelector('#gv-media-comment-toggle')?.click();
  };
  b.append(comment);

  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'gv-share-post';
  share.textContent = 'Share post';
  share.onclick = () => {
  console.log('Share button clicked:', post.id);
  openSharePost(post);
};

  b.append(share);
  
if (user && (user.id === post.user_id || admin)) {
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'gv-edit-button';
  edit.textContent = 'Edit post';
  edit.onclick = () => openEditPost(post, admin);
  b.append(edit);

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
function openSharePost(post, container = document.body) {
  const existing = document.getElementById('gv-share-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement(
  container !== document.body ? 'dialog' : 'div'
);
  console.log('Share overlay created');
  overlay.id = 'gv-share-overlay';
  overlay.className = 'gv-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'gv-modal';

  const heading = document.createElement('h3');
  heading.textContent = 'Share post';

  const description = document.createElement('p');
  description.textContent = post.title || 'Untitled post';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy link';

  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(getPostShareUrl(post));
      copy.textContent = 'Link copied!';
    } catch (error) {
      copy.textContent = 'Could not copy link';
      console.error('Copy post link error:', error);
    }
  };
  const nativeShare = document.createElement('button');
  nativeShare.type = 'button';
  nativeShare.textContent = 'Share…';

  nativeShare.onclick = async () => {
    const url = getPostShareUrl(post);

    if (!navigator.share) {
      nativeShare.textContent = 'Sharing not supported';
      return;
    }

    try {
      await navigator.share({
        title: post.title || 'GameVault post',
        text: 'Check out this gaming post on GameVault!',
        url
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Native share error:', error);
      }
    }
  };
    const dmLabel = document.createElement('p');
  dmLabel.textContent = 'Share with a GameVault user';

  const dmSelect = document.createElement('select');
  dmSelect.id = 'gv-share-dm-select';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a conversation';
  dmSelect.append(placeholder);

  dmConversationsCache.forEach(conversation => {
    const option = document.createElement('option');
    option.value = conversation.conversation_id;
    option.textContent = conversation.username || 'Player';
    dmSelect.append(option);
  });

  const sendDm = document.createElement('button');
  sendDm.type = 'button';
  sendDm.textContent = 'Send to DM';
  sendDm.disabled = dmConversationsCache.length === 0;

  sendDm.onclick = async () => {
    if (!user) {
      overlay.remove();
      openAuth();
      return;
    }

    const conversationId = dmSelect.value;

    if (!conversationId) {
      sendDm.textContent = 'Choose a conversation first';
      return;
    }

    sendDm.disabled = true;
    sendDm.textContent = 'Sending...';

    const { error } = await sb
      .from('dm_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: 'Shared a post',
        shared_post_id: post.id
      });

    if (error) {
      console.error('Share post DM error:', error);
      sendDm.textContent = 'Could not send';
      sendDm.disabled = false;
      return;
    }

    sendDm.textContent = 'Post shared!';
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.onclick = () => overlay.remove();

  modal.append(
    heading,
    description,
    copy,
    nativeShare,
    dmLabel,
    dmSelect,
    sendDm,
    close
  );
  overlay.append(modal);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) overlay.remove();
  });

  if (container !== document.body) {
  overlay.classList.add('gv-share-native-dialog');
  document.body.append(overlay);
  overlay.showModal();
} else {
  container.append(overlay);
}
}
async function loadPosts() {
  if (!sb) return;

  const g = $('gallery-grid');
  g.textContent = 'Loading…';

  const r = await sb
    .from('posts')
    .select('id,user_id,title,description,category,media_url,media_type,created_at,storage_path')
    .order('created_at', { ascending: false })
    .limit(60);

  if (r.error) {
    g.textContent = r.error.message;
    return;
  }

    postsCache = r.data || [];
  reactionsCache = {};

  if (postsCache.length) {
    const userIds = [...new Set(postsCache.map(post => post.user_id))];

    const { data: profiles, error: profilesError } = await sb
      .from('profiles')
      .select('id, username, avatar_path')
      .in('id', userIds);

    if (profilesError) {
      console.error('Could not load post authors:', profilesError.message);
    } else {
      const authorProfiles = Object.fromEntries(
  (profiles || []).map(profile => [profile.id, profile])
);

postsCache.forEach(post => {
  const profile = authorProfiles[post.user_id];
  post.username = profile?.username || 'Player';

  post.avatar_url = profile?.avatar_path
    ? sb.storage.from('gamevault-avatars').getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
});
    }
  }
  if (postsCache.length) {
    const { data, error } = await sb
      .from('post_reactions')
      .select('post_id,user_id,reaction')
      .in('post_id', postsCache.map(post => post.id));

    if (error) {
      console.error('Could not load reactions:', error.message);
    } else {
      (data || []).forEach(reaction => {
        if (!reactionsCache[reaction.post_id]) {
          reactionsCache[reaction.post_id] = [];
        }

        reactionsCache[reaction.post_id].push(reaction);
      });
    }
  }

  if (!postsCache.length) {
    g.textContent =
      'The vault is empty. Be the first to share a gaming moment!';
  } else {
    g.replaceChildren(...postsCache.map(post => makePostCard(post, false)));
  }

  if (isAdmin) renderAdminPosts();
}$('show-all-posts').onclick = async () => {
  $('show-all-posts').hidden = true;

  const heading = document.querySelector('.community-heading h2');
  if (heading) heading.textContent = 'Explore the vault';

  await loadPosts();
};
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
  if (!user) return openAuth();

  if (!admin && p.user_id !== user.id) {
    alert('You can only delete your own posts.');
    return;
  }

  if (!await confirmDeletePost(p, admin)) return;

  let query = sb.from('posts').delete().eq('id', p.id);

  if (!admin) {
    query = query.eq('user_id', user.id);
  }

  const { error } = await query;

  if (error) {
    alert('Could not delete post: ' + error.message);
    return;
  }

  if (p.storage_path) {
    const { error: storageError } = await sb.storage
      .from('gamevault-media')
      .remove([p.storage_path]);

    if (storageError) {
      alert('Post deleted, but its media could not be removed: ' +
        storageError.message);
    }
  }

  await loadPosts();

  if (admin) {
    $('admin-message').textContent = 'Post removed.';
  }
}
function renderAdminPosts(){const g=$('admin-posts');$('admin-post-count').textContent=String(postsCache.length);g.replaceChildren(...postsCache.map(p=>makePostCard(p,true)));if(!postsCache.length)g.textContent='No posts to moderate.'}

// ================= COMMUNITY CHAT =================

let selectedChatFile = null;
let chatPreviewUrl = null;
let chatSending = false;

const CHAT_MAX_SIZE = 20 * 1024 * 1024;

const CHAT_FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
};

function updateChatAccess() {
  if (!$('chat-input')) return;

  const input = $('chat-input');
  const send = $('chat-send');
  const attach = $('chat-attach');
  const fileInput = $('chat-media-input');
  const feedback = $('chat-feedback');

  const disabled = !user || chatSending;

  input.disabled = disabled;
  send.disabled = disabled;
  attach.disabled = disabled;
  fileInput.disabled = disabled;

  if (!user) {
    feedback.textContent = 'Sign in to participate in the conversation.';
  } else if (!chatSending) {
    feedback.textContent = 'You are signed in. Keep the conversation friendly.';
  }
}

function clearChatAttachment() {
    if (!$('chat-media-input')) return;
  selectedChatFile = null;

  if (chatPreviewUrl) {
    URL.revokeObjectURL(chatPreviewUrl);
    chatPreviewUrl = null;
  }

  $('chat-media-input').value = '';
  $('chat-attachment-preview').replaceChildren();
  $('chat-attachment-preview').hidden = true;
}

function showChatAttachment(file) {
    if (!$('chat-attachment-preview')) return;
  clearChatAttachment();

  selectedChatFile = file;
  chatPreviewUrl = URL.createObjectURL(file);

  const preview = $('chat-attachment-preview');

  const media = file.type.startsWith('image/')
    ? document.createElement('img')
    : document.createElement('video');

  media.src = chatPreviewUrl;
  media.alt = file.name;

  if (media.tagName === 'VIDEO') {
    media.controls = true;
    media.muted = true;
  }

  const info = document.createElement('div');
  info.className = 'chat-attachment-info';

  const filename = document.createElement('strong');
  filename.textContent = file.name;

  const size = document.createElement('div');
  size.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

  info.append(filename, size);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chat-attachment-remove';
  remove.textContent = '✕';
  remove.title = 'Remove attachment';
  remove.setAttribute('aria-label', 'Remove attachment');

  remove.onclick = () => {
    clearChatAttachment();
    $('chat-feedback').textContent = 'Attachment removed.';
  };

  preview.append(media, info, remove);
  preview.hidden = false;
}

if ($('chat-attach')) $('chat-attach').onclick = () => {
  if (!user) return openAuth();
  if (!chatSending) $('chat-media-input').click();
};

if ($('chat-media-input')) $('chat-media-input').onchange = () => {
  const file = $('chat-media-input').files?.[0];

  if (!file) return;

  if (!CHAT_FILE_TYPES[file.type]) {
    clearChatAttachment();
    $('chat-feedback').textContent =
      'Unsupported file. Choose JPG, PNG, WebP, GIF, MP4, WebM, or MOV.';
    return;
  }

  if (file.size > CHAT_MAX_SIZE) {
    clearChatAttachment();
    $('chat-feedback').textContent =
      'File exceeds 20 MB. Choose a smaller file.';
    return;
  }

  showChatAttachment(file);
  $('chat-feedback').textContent = 'Attachment ready to send.';
};


function addChatMessage(message) {
  const container = $('chat-messages');
  if (!container) return;

  if (container.querySelector(`[data-message-id="${message.id}"]`)) {
    return;
  }

  const item = document.createElement('article');
  item.className = 'chat-message';
  item.dataset.messageId = message.id;

  const heading = document.createElement('div');
  heading.className = 'chat-message-heading';

    const name = document.createElement('a');
  name.textContent = '@' + (message.username || 'Player');
  name.href = `profile.html?u=${encodeURIComponent(message.username || '')}`;
  name.className = 'gv-profile-link';

  const time = document.createElement('time');
  const date = new Date(message.created_at);
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  heading.append(name, time);
  item.append(heading);

  if (message.message?.trim()) {
    const body = document.createElement('p');
    body.textContent = message.message;
    item.append(body);
  }

  if (message.media_url && message.media_type === 'image') {
    const image = document.createElement('img');
    image.className = 'chat-message-media';
    image.src = message.media_url;
    image.alt = 'Chat attachment';
    image.loading = 'lazy';
    item.append(image);
  } else if (message.media_url && message.media_type === 'video') {
    const video = document.createElement('video');
    video.className = 'chat-message-media';
    video.src = message.media_url;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    item.append(video);
  }

  // Show controls only on the current user's messages.
    // Three-dot menu for the current user's messages.
  if (user && user.id === message.user_id) {
    const actions = document.createElement('div');
    actions.className = 'chat-message-actions';

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'chat-menu-button';
    menuButton.textContent = '⋮';
    menuButton.setAttribute('aria-label', 'Message options');
    menuButton.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'chat-message-menu';
    menu.hidden = true;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit message';
    edit.onclick = () => {
      menu.hidden = true;
      editChatMessage(message);
    };

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete message';
    remove.className = 'chat-menu-delete';
    remove.onclick = () => {
      menu.hidden = true;
      deleteChatMessage(message);
    };

menuButton.onclick = () => {
  const shouldOpen = menu.hidden;

  document.querySelectorAll('.chat-message-menu').forEach(openMenu => {
    openMenu.hidden = true;

    const actions = openMenu.parentElement;
    const button = actions?.querySelector('.chat-menu-button');
    const messageItem = actions?.closest('.chat-message');

    messageItem?.classList.remove('menu-open');

    if (button) {
      button.setAttribute('aria-expanded', 'false');
    }
  });

  if (shouldOpen) {
    menu.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    item.classList.add('menu-open');
  }
};

    actions.append(menuButton, menu);
    menu.append(edit, remove);
    item.append(actions);
  }

  container.append(item);

  while (container.children.length > 50) {
    container.firstElementChild.remove();
  }

  container.scrollTop = container.scrollHeight;
}

async function editChatMessage(message) {
  if (!$('chat-messages') || !$('chat-feedback')) return;
  if (!user || message.user_id !== user.id) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'gv-edit-dialog';

  const form = document.createElement('form');
  form.className = 'gv-edit-form';

  const heading = document.createElement('h2');
  heading.textContent = 'Edit message';

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Make changes to your chat message.';

  const label = document.createElement('label');
  label.textContent = 'Your message';

  const textarea = document.createElement('textarea');
  textarea.rows = 4;
  textarea.maxLength = 500;
  textarea.value = message.message || '';
  textarea.required = !message.media_url;

  label.append(textarea);

  const status = document.createElement('p');
  status.className = 'chat-edit-status';

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
  form.append(heading, subtitle, label, status, actions);
  dialog.append(form);
  document.body.append(dialog);

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  form.onsubmit = async event => {
    event.preventDefault();

    const newMessage = textarea.value.trim();

    if (newMessage.length > 500) {
      status.textContent = 'Messages cannot exceed 500 characters.';
      return;
    }

    if (!newMessage && !message.media_url) {
      status.textContent = 'A message cannot be empty without an attachment.';
      return;
    }

    save.disabled = true;
    save.textContent = 'Saving…';
    status.textContent = '';

    try {
      const { data, error } = await sb
        .from('chat_messages')
        .update({ message: newMessage })
        .eq('id', message.id)
        .eq('user_id', user.id)
        .select('id,user_id,username,message,media_url,media_type,storage_path,created_at')
        .single();

      if (error) throw error;

      dialog.close();

      const oldItem = $('chat-messages')
        .querySelector(`[data-message-id="${message.id}"]`);

      if (oldItem) oldItem.remove();

      addChatMessage(data);
      $('chat-feedback').textContent = 'Message updated successfully.';
    } catch (error) {
      status.textContent = 'Could not edit message: ' + error.message;
      save.disabled = false;
      save.textContent = 'Save changes';
    }
  };

  dialog.showModal();
  textarea.focus();
}


function confirmDeleteChatMessage(message) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'gv-delete-dialog';

    const content = document.createElement('div');
    content.className = 'gv-delete-content';

    const icon = document.createElement('div');
    icon.className = 'gv-delete-icon';
    icon.textContent = '⌫';

    const title = document.createElement('h2');
    title.textContent = 'Delete this message?';

    const description = document.createElement('p');
    description.textContent =
      'This action cannot be undone. Are you sure?';

    const preview = document.createElement('p');
    preview.className = 'gv-delete-post-title';
    preview.textContent = message.message || 'Message with attachment';

    const actions = document.createElement('div');
    actions.className = 'gv-delete-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'gv-delete-cancel';
    cancel.textContent = 'Cancel';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'gv-delete-confirm';
    confirm.textContent = 'Delete message';

    actions.append(cancel, confirm);
    content.append(icon, title, description, preview, actions);
    dialog.append(content);
    document.body.append(dialog);

    let finished = false;

    function finish(result) {
      if (finished) return;
      finished = true;

      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(result);
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


async function deleteChatMessage(message) {
  if (!$('chat-messages') || !$('chat-feedback')) return;
  if (!user || message.user_id !== user.id) return;

  if (!await confirmDeleteChatMessage(message)) return;

  const { data, error } = await sb
    .from('chat_messages')
    .delete()
    .eq('id', message.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    $('chat-feedback').textContent =
      'Could not delete message: ' + error.message;
    return;
  }

  if (!data) {
    $('chat-feedback').textContent =
      'Message was not deleted. Check your permissions.';
    return;
  }

  const item = $('chat-messages')
    .querySelector(`[data-message-id="${message.id}"]`);

  if (item) item.remove();

  if (message.storage_path) {
    const { error: storageError } = await sb.storage
      .from('gamevault-media')
      .remove([message.storage_path]);

    if (storageError) {
      $('chat-feedback').textContent =
        'Message deleted, but its attachment could not be removed: ' +
        storageError.message;
      return;
    }
  }

  $('chat-feedback').textContent = 'Message deleted successfully.';
}


async function initializeChat() {
  if (!sb || chatStarted || !$('chat-status') || !$('chat-messages')) return;

  chatStarted = true;
  $('chat-status').textContent = 'Loading…';

  const { data, error } = await sb
    .from('chat_messages')
    .select(
      'id,user_id,username,message,media_url,media_type,storage_path,created_at'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    $('chat-status').textContent = 'Chat unavailable';
    $('chat-messages').textContent = error.message;
    chatStarted = false;
    return;
  }

  $('chat-messages').replaceChildren();
  (data || []).reverse().forEach(addChatMessage);

  updateChatAccess();
  $('chat-status').textContent = 'Connected';


  chatChannel = sb
    .channel('gamevault-community-chat')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      },
      payload => addChatMessage(payload.new)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages'
      },
      payload => {
        const oldItem = $('chat-messages')
          .querySelector(`[data-message-id="${payload.new.id}"]`);

        if (oldItem) oldItem.remove();

        addChatMessage(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages'
      },
      payload => {
        const oldItem = $('chat-messages')
          .querySelector(`[data-message-id="${payload.old.id}"]`);

        if (oldItem) oldItem.remove();
      }
    )
    .subscribe(status => {
      $('chat-status').textContent =
        status === 'SUBSCRIBED' ? 'Connected' : 'Connecting…';
    });

}

if ($('chat-form')) $('chat-form').onsubmit = async event => {
  event.preventDefault();

  if (!user) {
    $('chat-feedback').textContent = 'Please sign in first.';
    return openAuth();
  }

  const input = $('chat-input');
  const message = input.value.trim();
  const file = selectedChatFile;

  if (!message && !file) {
    $('chat-feedback').textContent =
      'Write a message or attach a file.';
    return;
  }

  if (message.length > 500) {
    $('chat-feedback').textContent =
      'Messages cannot exceed 500 characters.';
    return;
  }

  chatSending = true;
  updateChatAccess();
  $('chat-feedback').textContent = file
    ? 'Uploading attachment…'
    : 'Sending message…';

  let storagePath = null;

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (file) {
      const extension = CHAT_FILE_TYPES[file.type];

      storagePath =
        `${user.id}/chat-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await sb.storage
        .from('gamevault-media')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = sb.storage
        .from('gamevault-media')
        .getPublicUrl(storagePath);

      mediaUrl = publicData.publicUrl;
      mediaType = file.type.startsWith('image/') ? 'image' : 'video';
    }

    const { data, error } = await sb
      .from('chat_messages')
      .insert({
        user_id: user.id,
        username: usernameOf(user),
        message: message || '',
        media_url: mediaUrl,
        media_type: mediaType,
        storage_path: storagePath
      })
      .select(
        'id,user_id,username,message,media_url,media_type,storage_path,created_at'
      )
      .single();

    if (error) throw error;

    addChatMessage(data);

    input.value = '';
    clearChatAttachment();

    $('chat-feedback').textContent = 'Message sent successfully.';
  } catch (error) {
    // Remove uploaded media if saving the chat message failed.
    if (storagePath) {
      const { error: cleanupError } = await sb.storage
        .from('gamevault-media')
        .remove([storagePath]);

      if (cleanupError) {
        console.error('Could not clean up failed chat upload:', cleanupError);
      }
    }

    $('chat-feedback').textContent =
      'Message failed: ' + error.message;
  } finally {
    chatSending = false;
    updateChatAccess();
  }
};

// ================= ACCOUNT SETTINGS =================


$('settings-close').onclick = () => {
  $('settings-dialog').close();
};

$('settings-form').onsubmit = async event => {
  event.preventDefault();

  if (!user) return openAuth();

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
// ================= AVATAR CROPPING =================

let cropImage = null;
let cropZoom = 1;
let cropX = 0;
let cropY = 0;
let cropDragging = false;
let cropLastX = 0;
let cropLastY = 0;

const cropCanvas = $('avatar-crop-canvas');
const cropContext = cropCanvas.getContext('2d');

function drawAvatarCrop() {
  if (!cropImage) return;

  const size = 300;
  const base = Math.max(
    size / cropImage.width,
    size / cropImage.height
  );

  const width = cropImage.width * base * cropZoom;
  const height = cropImage.height * base * cropZoom;

  cropX = Math.min(0, Math.max(size - width, cropX));
  cropY = Math.min(0, Math.max(size - height, cropY));

  cropContext.clearRect(0, 0, size, size);
  cropContext.drawImage(cropImage, cropX, cropY, width, height);
}

async function openAvatarCrop(file) {
  if (!file.type.startsWith('image/')) {
    $('crop-status').textContent = 'Choose an image file.';
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    $('crop-status').textContent = 'Choose an image smaller than 10 MB.';
    return;
  }

  try {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);

      cropImage = image;
      cropZoom = 1;

      const base = Math.max(
        300 / image.width,
        300 / image.height
      );

      cropX = (300 - image.width * base) / 2;
      cropY = (300 - image.height * base) / 2;

      $('avatar-zoom').value = '1';
      $('crop-status').textContent =
        'Drag the image to reposition it.';

      drawAvatarCrop();
      $('avatar-crop-dialog').showModal();
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      $('crop-status').textContent = 'Could not open this image.';
    };

    image.src = url;
  } catch (error) {
    $('crop-status').textContent = error.message;
  }
}

$('avatar-zoom').oninput = () => {
  if (!cropImage) return;

  const oldZoom = cropZoom;
  cropZoom = Number($('avatar-zoom').value);

  // Keep the image position centred as zoom changes.
  const ratio = cropZoom / oldZoom;
  cropX = 150 - (150 - cropX) * ratio;
  cropY = 150 - (150 - cropY) * ratio;

  drawAvatarCrop();
};

cropCanvas.addEventListener('pointerdown', event => {
  if (!cropImage) return;

  cropDragging = true;
  cropLastX = event.clientX;
  cropLastY = event.clientY;
  cropCanvas.setPointerCapture(event.pointerId);
});

cropCanvas.addEventListener('pointermove', event => {
  if (!cropDragging) return;

  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = 300 / rect.width;
  const scaleY = 300 / rect.height;

  cropX += (event.clientX - cropLastX) * scaleX;
  cropY += (event.clientY - cropLastY) * scaleY;

  cropLastX = event.clientX;
  cropLastY = event.clientY;

  drawAvatarCrop();
});

cropCanvas.addEventListener('pointerup', () => {
  cropDragging = false;
});

cropCanvas.addEventListener('pointercancel', () => {
  cropDragging = false;
});

function closeCrop() {
  $('avatar-crop-dialog').close();
  cropImage = null;
}

$('crop-close').onclick = closeCrop;
$('crop-cancel').onclick = closeCrop;

$('crop-save').onclick = async () => {
  if (!cropImage || !user) return;

  const button = $('crop-save');
  button.disabled = true;
  $('crop-status').textContent = 'Preparing your avatar…';

  cropCanvas.toBlob(async blob => {
    if (!blob) {
      $('crop-status').textContent = 'Could not prepare the image.';
      button.disabled = false;
      return;
    }

    const file = new File([blob], 'gamevault-avatar.jpg', {
      type: 'image/jpeg'
    });

    const success = await uploadAvatar(file);

    if (success) {
      closeCrop();
    } else {
      $('crop-status').textContent = 'Upload failed. Please try again.';
    }

    button.disabled = false;
  }, 'image/jpeg', 0.90);
};
$('admin-refresh').onclick=async()=>{if(!isAdmin)return;$('admin-message').textContent='Refreshing…';await loadPosts();$('admin-message').textContent='Posts refreshed.'};$('admin-close').onclick=()=>$('admin-panel').hidden=true;

// ================= GAMEVAULT APP UPDATE CHECKER =================

async function checkGameVaultUpdate() {
  const isAndroidApp =
    /Android/i.test(navigator.userAgent) &&
    (window.Capacitor?.isNativePlatform?.() === true);

  if (!isAndroidApp) return;

  try {
    const [installedResponse, remoteResponse] = await Promise.all([
      fetch('./app-version.json?t=' + Date.now()),
      fetch('https://djstarz.github.io/gamevault/version.json?t=' + Date.now())
    ]);

if (!remoteResponse.ok) return;
const installed = installedResponse.ok
  ? await installedResponse.json()
  : { version: '1.0.2' };

const update = await remoteResponse.json();

    const parseVersion = v => v.split('.').map(Number);

    const isNewer = (remote, current) => {
      const a = parseVersion(remote);
      const b = parseVersion(current);

      for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) > (b[i] || 0)) return true;
        if ((a[i] || 0) < (b[i] || 0)) return false;
      }

      return false;
    };

    if (!installed.version || !update.version) return;
    if (!isNewer(update.version, installed.version)) return;

    const notice = document.createElement('div');
    notice.className = 'gv-update-notice';

    const heading = document.createElement('strong');
    heading.textContent = 'GameVault Update Available!';

    const message = document.createElement('p');
    message.textContent = update.message || 'A new GameVault update is available.';

    notice.append(heading, message);

    if (update.download_url) {
      const link = document.createElement('a');
      link.href = update.download_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Download Update';
      notice.append(link);
    }

    document.body.appendChild(notice);

  } catch (error) {
    console.log('GameVault update check failed:', error);
  }
}

checkGameVaultUpdate();
