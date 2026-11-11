
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let user = null;
let dmConversationsCache = [];
let activeDmConversation = null;
let dmChannel = null;

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
    signIn.hidden = false;
    return;
  }

  signIn.hidden = true;

  const username = document.createElement('strong');
  username.textContent = '@' + usernameOf(user);

  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'sign-in-button';
  signOut.textContent = 'Sign out';

  signOut.onclick = async () => {
    signOut.disabled = true;
    const { error } = await sb.auth.signOut();

    if (error) {
      console.error('Sign out error:', error);
      signOut.disabled = false;
    }
  };

  account.append(username, signOut);
}

const accountEmail = name =>
  `${name.toLowerCase()}@username.gamevault.invalid`;

let signup = false;

$('auth-open').addEventListener('click', () => {
  $('auth-status').textContent = '';
  $('auth-dialog').showModal();
});

$('auth-toggle').addEventListener('click', () => {
  signup = !signup;

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

  $('auth-status').textContent = signup
    ? 'Choose a unique username and a password of at least 8 characters.'
    : '';
});

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();

  const name = $('username').value.trim();
  const password = $('password').value;

  if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) {
    $('auth-status').textContent =
      'Username must be 3–24 letters, numbers, or underscores.';
    return;
  }

  $('auth-submit').disabled = true;
  $('auth-status').textContent =
    signup ? 'Creating account…' : 'Signing in…';

  try {
    let result;

    if (signup) {
      result = await sb.auth.signUp({
        email: accountEmail(name),
        password,
        options: {
          data: { username: name }
        }
      });

      if (result.error) throw result.error;

      if (!result.data.session) {
        $('auth-status').textContent =
          'Account created, but email confirmation is enabled. Turn OFF Confirm email in Supabase Authentication settings for username-only accounts.';
        return;
      }

      $('auth-status').textContent = 'Account created!';
    } else {
      result = await sb.auth.signInWithPassword({
        email: accountEmail(name),
        password
      });

      if (result.error) throw result.error;

      $('auth-status').textContent = 'Signed in!';
    }

    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    renderAccount();

    $('auth-dialog').close();
    $('auth-form').reset();

  } catch (error) {
    $('auth-status').textContent =
      error.message || 'Authentication failed.';
  } finally {
    $('auth-submit').disabled = false;
  }
});

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

    const username = document.createElement('strong');
    username.textContent = request.username || 'Player';

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

  dmConversationsCache.forEach(conversation => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gv-dm-conversation';
    button.dataset.conversationId = conversation.conversation_id;
    button.dataset.username = conversation.username || 'Player';
    button.textContent = conversation.username || 'Player';

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

    const sender = document.createElement('strong');
    sender.textContent = own
      ? 'You'
      : activeDmConversation.username || 'Player';

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

  if (error) {
    setStatus('Could not check your sign-in status.');
    console.error(error);
    return;
  }

  user = data.session?.user || null;
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

  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      user = session?.user || null;
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
