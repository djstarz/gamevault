
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let user = null;
let authReady = false;
let avatarUrl = null;
let accountDisplayName = null;
let dmConversationsCache = [];
let activeDmConversation = null;
let dmChannel = null;

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

function usernameOf(u) {
  return u?.user_metadata?.username
    || u?.email?.split('@')[0]
    || 'Player';
}

function setStatus(message) {
  const status = $('dm-page-status');
  if (status) status.textContent = message;
}



function renderAccount() {
  const account = $('account');
  const signIn = $('auth-open');

  account.replaceChildren();

  if (!user) {
    signIn.hidden = !authReady;
    avatarUrl = null;
    return;
  }

  signIn.hidden = true;

const username = usernameOf(user);
const displayName = accountDisplayName || username;
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
  avatar.src = avatarUrl ||
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
      '<rect width="40" height="40" rx="20" fill="#263447"/>' +
      '<text x="20" y="27" text-anchor="middle" fill="white" font-size="22">?</text>' +
      '</svg>'
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
  headingLabel.textContent = 'GameVault member';

  heading.append(headingName, headingLabel);
  dropdown.append(heading);

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
    dropdown.append(link);
  }

    addLink('My Profile', 'profile.html', '◉');;
addLink('My Posts', 'index.html#gallery', '▤');

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

  signOut.onclick = async () => {
    const { error } = await sb.auth.signOut();

    if (error) {
      alert('Could not sign out: ' + error.message);
    }
  };

  dropdown.append(signOut);

  trigger.onclick = () => {
    const opening = dropdown.hidden;
    dropdown.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
  };

  menu.append(trigger, dropdown);
  account.append(menu);

  if (!window.__gameVaultProfileMenuHandler) {
    document.addEventListener('click', event => {
      document.querySelectorAll('.profile-menu').forEach(item => {
        if (!item.contains(event.target)) {
          const panel = item.querySelector('.profile-dropdown');
          const button = item.querySelector('.profile-trigger');

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
async function loadAvatar() {
  avatarUrl = null;
  if (!user) return;

  const { data, error } = await sb
    .from('profiles')
.select('avatar_path, display_name')
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
  accountDisplayName = data?.display_name?.trim() || usernameOf(user);
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

  if (!data?.length) {
    results.textContent = 'No matching users found.';
    return;
  }

  data.forEach(result => {
    const item = document.createElement('div');
    item.className = 'gv-dm-search-result';

        const name = document.createElement('a');
    name.className = 'gv-profile-link';
name.textContent = `${result.display_name || result.username} · @${result.username}`;
    name.href = `profile.html?u=${encodeURIComponent(result.username)}`;

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

  list.replaceChildren();
  count.textContent = '0';

  if (!user) {
    list.textContent = 'Sign in to view message requests.';
    return;
  }

  const { data, error } = await sb.rpc('get_dm_requests');

  if (error) {
    list.textContent = 'Could not load message requests.';
    console.error('DM requests error:', error);
    return;
  }

  const requests = data || [];
  count.textContent = String(requests.length);

  if (!requests.length) {
    list.textContent = 'No pending requests.';
    return;
  }

  requests.forEach(request => {
    const item = document.createElement('div');
    item.className = 'gv-dm-request';

   const username = document.createElement('a');
username.className = 'gv-profile-link';
username.textContent = `${request.display_name || request.username || 'Player'} · @${request.username || 'Player'}`;
    username.href = `profile.html?u=${encodeURIComponent(request.username || '')}`;

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

  if (!user) {
    dmConversationsCache = [];
    container.textContent = 'Sign in to view conversations.';
    return;
  }

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

  const usernames = dmConversationsCache
    .map(conversation => conversation.username)
    .filter(Boolean);

  const { data: profiles, error: profileError } = await sb
    .from('profiles')
    .select('id, username, avatar_path')
    .in('username', usernames);

  if (profileError) {
    console.error('Could not load friend avatars:', profileError);
  }

  const { data: presenceRows, error: presenceError } = await sb
  .from('gamevault_presence')
  .select('user_id, last_seen')
  .in('user_id', (profiles || []).map(profile => profile.id));

if (presenceError) {
  console.error('Could not load friend presence:', presenceError);
}

const onlineUsers = new Set(
  (presenceRows || [])
    .filter(row =>
      Date.now() - new Date(row.last_seen).getTime() < 120000
    )
    .map(row => row.user_id)
);

  const avatarMap = new Map();

  (profiles || []).forEach(profile => {
    if (!profile.avatar_path) return;

    const { data: imageData } = sb.storage
      .from('gamevault-avatars')
      .getPublicUrl(profile.avatar_path);

    avatarMap.set(profile.username, imageData.publicUrl);
  });

  dmConversationsCache.forEach(conversation => {
    const username = conversation.username || 'Player';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gv-dm-conversation';
    button.dataset.conversationId = conversation.conversation_id;
    button.dataset.username = username;

    const avatar = document.createElement('img');
    avatar.className = 'gv-dm-friend-avatar';
    avatar.alt = '';
    avatar.width = 44;
    avatar.height = 44;

    avatar.src = avatarMap.get(username) ||
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">' +
        '<rect width="44" height="44" rx="22" fill="#263447"/>' +
        '<text x="22" y="29" text-anchor="middle" fill="white" font-size="20">' +
        username.charAt(0).toUpperCase() +
        '</text></svg>'
      );

    const details = document.createElement('span');
    details.className = 'gv-dm-friend-details';

    const name = document.createElement('strong');
name.textContent = `${conversation.display_name || username} · @${username}`;
    const profile = (profiles || []).find(
  item => item.username === username
);

const isOnline = profile && onlineUsers.has(profile.id);

const statusDot = document.createElement('span');
statusDot.className = isOnline
  ? 'gv-dm-status-dot online'
  : 'gv-dm-status-dot offline';

statusDot.title = isOnline
  ? 'Online'
  : 'Offline';

statusDot.setAttribute(
  'aria-label',
  isOnline ? 'Online' : 'Offline'
);

name.append(statusDot);

    const subtitle = document.createElement('small');
    subtitle.textContent = 'Private conversation';

    details.append(name, subtitle);
    button.append(avatar, details);
    container.appendChild(button);
  });

  if (activeDmConversation) {
    const updated = dmConversationsCache.find(
      item => item.conversation_id === activeDmConversation.conversation_id
    );

    if (updated) activeDmConversation = updated;
  }
}


$('dm-conversations').addEventListener('click', event => {
  const button = event.target.closest('.gv-dm-conversation');
  if (!button) return;

  const conversation = dmConversationsCache.find(
    item => item.conversation_id === button.dataset.conversationId
  );

  if (!conversation) return;

  activeDmConversation = conversation;

  $('dm-friends-view').hidden = true;
  $('dm-chat-view').hidden = false;

  $('dm-chat-empty').hidden = true;
  $('dm-chat-active').hidden = false;
$('dm-chat-username').textContent = `${conversation.display_name || conversation.username || 'Player'} · @${conversation.username || 'Player'}`;
  $('dm-chat-username').href =
    `profile.html?u=${encodeURIComponent(conversation.username || '')}`;

  $('dm-messages').replaceChildren();
  $('dm-message-feedback').textContent = '';

  loadDmMessages();
  subscribeToDmConversation(conversation.conversation_id);
});

$('dm-back-to-friends').addEventListener('click', () => {
  $('dm-chat-view').hidden = true;
  $('dm-friends-view').hidden = false;

  if (dmChannel) {
    sb.removeChannel(dmChannel);
    dmChannel = null;
  }
});

async function loadDmMessages() {
  const container = $('dm-messages');

  if (!user || !activeDmConversation) return;

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

  if (activeDmConversation?.conversation_id !== conversationId) return;

  container.replaceChildren();

  if (!data?.length) {
    container.textContent = 'No messages yet. Say hello!';
    return;
  }

  for (const message of data) {
    const bubble = document.createElement('div');
    bubble.className = 'gv-dm-bubble';

    const own = message.sender_id === user.id;
    if (own) bubble.classList.add('own');

   const sender = own
  ? document.createElement('strong')
  : document.createElement('a');

sender.textContent = own
  ? 'You'
  : '@' + (activeDmConversation.username || 'Player');

if (!own) {
  sender.className = 'gv-profile-link';
  sender.href =
    `profile.html?u=${encodeURIComponent(activeDmConversation.username || '')}`;
}

    const time = document.createElement('time');
    const date = new Date(message.created_at);
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleString();

    bubble.append(sender, time);

    if (message.body) {
      const body = document.createElement('p');
      body.textContent = message.body;
      bubble.append(body);
    }

    if (message.shared_post_id) {
      const shared = document.createElement('a');
      shared.className = 'gv-shared-post-card';
      shared.href = `post.html?id=${encodeURIComponent(message.shared_post_id)}`;
      shared.textContent = '📎 View shared post';
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

  if (!conversationId) return;

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
      () => loadDmMessages()
    )
    .subscribe();
}

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

async function initializePage() {
  const { data, error } = await sb.auth.getSession();
  authReady = true;

  if (error) {
    setStatus('Could not check your sign-in status.');
    console.error(error);
    return;
  }

  user = data.session?.user || null;
startGameVaultPresence();
await loadAvatar();
renderAccount();

  if (!user) {
    setStatus('Please sign in to use private messages.');
    $('dm-requests').textContent = 'Sign in to view message requests.';
    $('dm-conversations').textContent = 'Sign in to view conversations.';
    return;
  }

  setStatus('Your private messages are ready.');

  await loadDmRequests();
  await loadDmConversations();
  setInterval(() => {
  if (user) loadDmConversations();
}, 30000);

  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      user = session?.user || null;
startGameVaultPresence();
await loadAvatar();
renderAccount();
      if (!user) {
        if (dmChannel) sb.removeChannel(dmChannel);
        dmChannel = null;
        activeDmConversation = null;
        dmConversationsCache = [];
        $('dm-chat-active').hidden = true;
        $('dm-chat-empty').hidden = false;
        setStatus('Please sign in to use private messages.');
        await loadDmRequests();
        await loadDmConversations();
        return;
      }

      setStatus('Your private messages are ready.');
      await loadDmRequests();
      await loadDmConversations();
    }, 0);
  });
}

$('dm-search-button').addEventListener('click', searchGameVaultUsers);
$('dm-user-search').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchGameVaultUsers();
  }
});
$('dm-message-form').addEventListener('submit', sendDmMessage);

initializePage().catch(error => {
  console.error('GameVault DM page error:', error);
  setStatus('Something went wrong while loading private messages.');
});
