import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id); let sb=null,user=null,signup=false,isAdmin=false,postsCache=[];
// Username accounts are mapped to a synthetic, non-deliverable address. Disable email confirmation in Supabase Auth.
const accountEmail = name => `${name.toLowerCase()}@username.gamevault.invalid`;
const configured=SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('PASTE_YOUR')&&SUPABASE_PUBLISHABLE_KEY&&!SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR');
if(configured){sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);start()}else{$('gallery-grid').textContent='Add your Supabase URL and publishable key in js/config.js to connect the vault.';$('upload-status').textContent='Waiting for Supabase configuration.'}
async function start(){const {data}=await sb.auth.getSession();user=data.session?.user||null;await refreshAdmin();renderAccount();await loadPosts();sb.auth.onAuthStateChange((_e,s)=>{user=s?.user||null;setTimeout(async()=>{await refreshAdmin();renderAccount();updateUpload();await loadPosts()},0)});updateUpload()}
function usernameOf(u){return u?.user_metadata?.username||u?.email?.split('@')[0]||'Player'}

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
function renderAccount(){const a=$('account');a.replaceChildren();if(user){a.append(document.createTextNode(usernameOf(user)+' '));const b=document.createElement('button');b.textContent='Sign out';b.onclick=()=>sb.auth.signOut();a.append(b);if(isAdmin){const adm=document.createElement('button');adm.textContent='Admin portal';adm.onclick=()=>{$('admin-panel').hidden=false;$('admin-panel').scrollIntoView({behavior:'smooth'})};a.append(adm)}}}
function updateUpload(){$('upload-button').disabled=!user;$('upload-status').textContent=user?'Signed in. Files are limited to 20 MB.':'Sign in before uploading.'}
function openAuth(){$('auth-status').textContent='';$('auth-dialog').showModal()}$('auth-open').onclick=openAuth;
$('auth-toggle').onclick=()=>{signup=!signup;$('auth-heading').textContent=signup?'Create your account':'Enter the vault';$('auth-submit').textContent=signup?'Create account':'Sign in';$('auth-toggle').textContent=signup?'Already have an account? Sign in':'Need an account? Sign up';$('password').autocomplete=signup?'new-password':'current-password';$('auth-status').textContent=signup?'Choose a unique username and a password of at least 8 characters.':''};
$('auth-form').onsubmit=async e=>{e.preventDefault();if(!sb)return;const name=$('username').value.trim();if(!/^[A-Za-z0-9_]{3,24}$/.test(name)){$('auth-status').textContent='Username must be 3–24 letters, numbers, or underscores.';return}$('auth-submit').disabled=true;$('auth-status').textContent=signup?'Creating account…':'Signing in…';try{let r;if(signup){r=await sb.auth.signUp({email:accountEmail(name),password:$('password').value,options:{data:{username:name}}});if(r.error)throw r.error;if(!r.data.session){$('auth-status').textContent='Account created, but confirmation is enabled. For username-only accounts, turn OFF Confirm email in Supabase Authentication settings, then try again.';return}$('auth-status').textContent='Account created!';}else{r=await sb.auth.signInWithPassword({email:accountEmail(name),password:$('password').value});if(r.error)throw r.error;$('auth-status').textContent='Signed in!'}setTimeout(()=>$('auth-dialog').close(),400)}catch(err){$('auth-status').textContent=err.message||'Authentication failed.'}finally{$('auth-submit').disabled=false}};
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
async function deletePost(p,admin=false){if(!confirm(`${admin?'Admin removal':'Delete'} “${p.title}”?`))return;const r=await sb.from('posts').delete().eq('id',p.id);if(r.error){alert(r.error.message);return}if(p.storage_path){const f=await sb.storage.from('gamevault-media').remove([p.storage_path]);if(f.error)alert('Post row deleted, but media removal failed: '+f.error.message)}await loadPosts();if(admin)$('admin-message').textContent='Post removed.'}
function renderAdminPosts(){const g=$('admin-posts');$('admin-post-count').textContent=String(postsCache.length);g.replaceChildren(...postsCache.map(p=>makePostCard(p,true)));if(!postsCache.length)g.textContent='No posts to moderate.'}
$('admin-refresh').onclick=async()=>{if(!isAdmin)return;$('admin-message').textContent='Refreshing…';await loadPosts();$('admin-message').textContent='Posts refreshed.'};$('admin-close').onclick=()=>$('admin-panel').hidden=true;
