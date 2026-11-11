
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = id => document.getElementById(id);

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let user = null;
let currentPost = null;

const REACTIONS = ['👍', '❤️', '😂', '🔥', '🎮'];

async function init() {
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;

  const postId = new URLSearchParams(location.search).get('id')
    || new URLSearchParams(location.search).get('post');

  if (!postId) {
    showStatus('No post ID was provided.');
    return;
  }

  await loadPost(postId);
}

function showStatus(message) {
  $('post-status').textContent = message;
  $('post-status').hidden = false;
  $('post-content').hidden = true;
}

async function loadPost(postId) {
  showStatus('Loading post...');

  const { data: post, error } = await sb
    .from('posts')
    .select('id,user_id,title,description,category,media_url,media_type,created_at')
    .eq('id', postId)
    .maybeSingle();

  if (error || !post) {
    showStatus(error ? 'Could not load post: ' + error.message : 'Post not found.');
    return;
  }

  currentPost = post;

  const { data: author } = await sb
    .from('profiles')
.select('username, display_name')
    .eq('id', post.user_id)
    .maybeSingle();

  renderPost(post, author);
  await loadReactions(post.id);
  await loadComments(post.id);

  $('post-status').hidden = true;
  $('post-content').hidden = false;

  document.title = `${post.title || 'Post'} — GameVault`;
}

function renderPost(post, author) {
  const authorBox = $('post-author');
  authorBox.replaceChildren();

    const authorName = document.createElement('a');
  authorName.className = 'gv-profile-link';
authorName.textContent = `${author?.display_name?.trim() || author?.username || 'Player'} · @${author?.username || 'Player'}`;
  authorName.href = `profile.html?u=${encodeURIComponent(author?.username || '')}`;

  const date = document.createElement('small');
  date.textContent = ' · ' + new Date(post.created_at).toLocaleString();

  authorBox.append(authorName, date);

  $('post-title').textContent = post.title || 'Untitled post';
  $('post-description').textContent = post.description || '';
  $('post-category').textContent = post.category || 'Gaming';

  const media = $('post-media');
  media.replaceChildren();

  if (post.media_url) {
    const element = document.createElement(
      post.media_type === 'video' ? 'video' : 'img'
    );

    element.src = post.media_url;

    if (post.media_type === 'video') {
      element.controls = true;
      element.preload = 'metadata';
    } else {
      element.alt = post.title || 'Gaming media';
      element.loading = 'eager';
    }

    media.append(element);
  }
}

async function loadReactions(postId) {
  const container = $('post-reactions');
  container.textContent = 'Loading reactions...';

  const { data, error } = await sb
    .from('post_reactions')
    .select('post_id,user_id,reaction')
    .eq('post_id', postId);

  if (error) {
    container.textContent = 'Could not load reactions.';
    console.error(error);
    return;
  }

  renderReactions(data || []);
}

function renderReactions(reactions) {
  const container = $('post-reactions');
  container.replaceChildren();

  REACTIONS.forEach(emoji => {
    const matching = reactions.filter(item => item.reaction === emoji);
    const mine = matching.some(item => item.user_id === user?.id);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-reaction';
    button.textContent = `${emoji} ${matching.length}`;

    if (mine) button.classList.add('selected');

    button.setAttribute('aria-pressed', String(mine));

    button.onclick = async () => {
      if (!user) {
        alert('Please sign in to react to posts.');
        return;
      }

      button.disabled = true;

      let result;

      if (mine) {
        result = await sb
          .from('post_reactions')
          .delete()
          .eq('post_id', currentPost.id)
          .eq('user_id', user.id);
      } else {
        result = await sb
          .from('post_reactions')
          .upsert({
            post_id: currentPost.id,
            user_id: user.id,
            reaction: emoji
          }, {
            onConflict: 'post_id,user_id'
          });
      }

      if (result.error) {
        alert('Could not save reaction: ' + result.error.message);
        button.disabled = false;
        return;
      }

      await loadReactions(currentPost.id);
    };

    container.append(button);
  });
}

function openReplyModal(comment) {
  return createCommentModal(comment, false);
}

function openEditModal(comment) {
  return createCommentModal(comment, true);
}

function createCommentModal(comment, editing) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      display:flex;align-items:center;justify-content:center;
      padding:20px;background:rgba(0,0,0,.75);
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width:100%;max-width:440px;padding:24px;
      background:#171b23;border:1px solid #2b3341;
      border-radius:16px;color:#f2f5fb;
      box-shadow:0 15px 50px rgba(0,0,0,.5);
    `;

    const title = document.createElement('h3');
    title.textContent = editing ? 'Edit comment' : 'Reply to comment';

    const original = document.createElement('p');
    original.textContent = editing
      ? 'Update your comment below.'
      : `${comment.username || 'Player'}: ${comment.content}`;

    const input = document.createElement('textarea');
    input.placeholder = editing ? 'Edit your comment...' : 'Write your reply...';
    input.value = editing ? comment.content : '';
    input.rows = 4;
    input.style.cssText = `
      box-sizing:border-box;width:100%;resize:vertical;
      padding:12px;background:#101318;color:#f2f5fb;
      border:1px solid #2b3341;border-radius:9px;
      font:inherit;outline:none;
    `;

    const actions = document.createElement('div');
    actions.style.cssText = `
      display:flex;justify-content:flex-end;gap:10px;margin-top:16px;
    `;

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';

    const send = document.createElement('button');
    send.textContent = editing ? 'Save Changes' : 'Send Reply';

    [cancel, send].forEach(button => {
      button.type = 'button';
      button.style.cssText = `
        padding:10px 16px;border:0;border-radius:8px;
        cursor:pointer;font-weight:600;
      `;
    });

    cancel.style.background = '#2b3341';
    cancel.style.color = '#f2f5fb';
    send.style.background = '#4b91e2';
    send.style.color = '#fff';

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    cancel.onclick = () => close(null);
    send.onclick = () => {
      const value = input.value.trim();
      if (value) close(value);
    };

    overlay.onclick = event => {
      if (event.target === overlay) close(null);
    };

    actions.append(cancel, send);
    modal.append(title, original, input, actions);
    overlay.append(modal);
    document.body.append(overlay);

    input.focus();
  });
}
function openDeleteModal(comment) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      display:flex;align-items:center;justify-content:center;
      padding:20px;background:rgba(0,0,0,.75);
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width:100%;max-width:400px;padding:24px;
      background:#171b23;border:1px solid #2b3341;
      border-radius:16px;color:#f2f5fb;
      box-shadow:0 15px 50px rgba(0,0,0,.5);
    `;

    const title = document.createElement('h3');
    title.textContent = 'Delete comment?';

    const message = document.createElement('p');
    message.textContent =
      'Are you sure you want to delete this comment and its replies? This action cannot be undone.';

    const actions = document.createElement('div');
    actions.style.cssText =
      'display:flex;justify-content:flex-end;gap:10px;margin-top:16px;';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';

    const remove = document.createElement('button');
    remove.textContent = 'Delete';

    [cancel, remove].forEach(button => {
      button.type = 'button';
      button.style.cssText = `
        padding:10px 16px;border:0;border-radius:8px;
        cursor:pointer;font-weight:600;
      `;
    });

    cancel.style.background = '#2b3341';
    cancel.style.color = '#f2f5fb';
    remove.style.background = '#dc4c4c';
    remove.style.color = '#fff';

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    cancel.onclick = () => close(false);
    remove.onclick = () => close(true);

    overlay.onclick = event => {
      if (event.target === overlay) close(false);
    };

    actions.append(cancel, remove);
    modal.append(title, message, actions);
    overlay.append(modal);
    document.body.append(overlay);
  });
}
async function loadComments(postId) {
  const list = $('post-comments-list');
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
  list.replaceChildren();

  if (!comments.length) {
    list.textContent = 'No comments yet. Be the first!';
  } else {
    const roots = comments.filter(comment => !comment.parent_id);

    function renderComment(comment, depth = 0) {
      const item = document.createElement('div');
      item.className = 'post-comment';
      item.style.marginLeft = depth ? '22px' : '0';

      const heading = document.createElement('a');
heading.className = 'gv-profile-link';
heading.textContent = '@' + (comment.username || 'Player');
heading.href = `profile.html?u=${encodeURIComponent(comment.username || '')}`;

      const time = document.createElement('small');
      time.textContent = ' · ' + new Date(comment.created_at).toLocaleString();

      const content = document.createElement('p');
      content.textContent = comment.content;

      item.append(heading, time, content);

      if (user && user.id === comment.user_id) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';

        edit.onclick = async () => {
          const updated = await openEditModal(comment);
if (!updated) return;

          const { error } = await sb
            .from('post_comments')
            .update({ content: updated.trim() })
            .eq('id', comment.id)
            .eq('user_id', user.id);

          if (error) {
            alert('Could not edit comment: ' + error.message);
            return;
          }

          await loadComments(postId);
        };

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Delete';

        remove.onclick = async () => {
          const confirmed = await openDeleteModal(comment);
if (!confirmed) return;

          const { error } = await sb
            .from('post_comments')
            .delete()
            .eq('id', comment.id)
            .eq('user_id', user.id);

          if (error) {
            alert('Could not delete comment: ' + error.message);
            return;
          }

          await loadComments(postId);
        };

        item.append(edit, remove);
      }

      if (user) {
        const reply = document.createElement('button');
        reply.type = 'button';
        reply.textContent = 'Reply';

        reply.onclick = async () => {
  const text = await openReplyModal(comment);
  if (!text) return;

          const { error } = await sb
            .from('post_comments')
            .insert({
              post_id: postId,
              parent_id: comment.id,
              user_id: user.id,
              username: usernameOf(user),
              content: text.trim()
            });

          if (error) {
            alert('Could not post reply: ' + error.message);
            return;
          }

          await loadComments(postId);
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

  $('post-comment-form').hidden = !user;
}

function usernameOf(u) {
  return u?.user_metadata?.username
    || u?.email?.split('@')[0]
    || 'Player';
}

$('post-comment-form').addEventListener('submit', async event => {
  event.preventDefault();

  if (!user || !currentPost) return;

  const input = $('post-comment-input');
  const button = $('post-comment-form').querySelector('button[type="submit"]');
  const content = input.value.trim();

  if (!content) return;

  button.disabled = true;

  const { error } = await sb
    .from('post_comments')
    .insert({
      post_id: currentPost.id,
      user_id: user.id,
      username: usernameOf(user),
      content
    });

  if (error) {
    alert('Could not post comment: ' + error.message);
  } else {
    input.value = '';
    await loadComments(currentPost.id);
  }

  button.disabled = false;
});

init().catch(error => {
  console.error('GameVault post page error:', error);
  showStatus('Something went wrong while loading this post.');
});

