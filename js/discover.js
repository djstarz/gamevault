
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const grid = document.getElementById("discover-grid");
const status = document.getElementById("discover-status");
const searchInput = document.getElementById("discover-search");
const sortSelect = document.getElementById("discover-sort");
const filters = document.getElementById("discover-filters");

let posts = [];
let activeCategory = "All";

function getPostText(post) {
  return [
    post.title,
    post.description,
    post.category,
    post.username,
    post.display_name
  ].filter(Boolean).join(" ").toLowerCase();
}

function getPostDate(post) {
  const date = new Date(post.created_at).getTime();
  return Number.isFinite(date) ? date : 0;
}

function renderPosts() {
  const search = searchInput.value.trim().toLowerCase();

  let visible = posts.filter(post => {
    const categoryMatch =
      activeCategory === "All" ||
      String(post.category || "").toLowerCase() === activeCategory.toLowerCase();

    return categoryMatch && (!search || getPostText(post).includes(search));
  });

  visible.sort((a, b) => {
    if (sortSelect.value === "popular") {
      return (b.reaction_count || 0) - (a.reaction_count || 0) ||
        getPostDate(b) - getPostDate(a);
    }

    return getPostDate(b) - getPostDate(a);
  });

  grid.innerHTML = "";

  if (!visible.length) {
    status.hidden = false;
    status.textContent = posts.length
      ? "No posts match your search or selected category."
      : "No community posts yet.";
    return;
  }

  status.hidden = true;

  visible.forEach(post => {
    const card = document.createElement("article");
    card.className = "card";

    const title = post.title || "Untitled post";
    const category = post.category || "Gaming";
    const author = post.display_name || post.username || "Player";

    const media = document.createElement("a");
    media.className = "media";
    media.href = `post.html?id=${encodeURIComponent(post.id)}`;
    media.setAttribute("aria-label", `Open ${title}`);

    if (post.media_url) {
      const isVideo = post.media_type === "video";
      const element = document.createElement(isVideo ? "video" : "img");

      element.src = post.media_url;

      if (isVideo) {
        element.muted = true;
        element.playsInline = true;
        element.preload = "metadata";
      } else {
        element.alt = title;
        element.loading = "lazy";
      }

      media.appendChild(element);
    } else {
      media.classList.add("gv-discover-no-media");
      media.textContent = "GAMEVAULT";
    }

    const body = document.createElement("div");
    body.className = "cardbody";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = category;

    const heading = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = `post.html?id=${encodeURIComponent(post.id)}`;
    titleLink.textContent = title;
    heading.appendChild(titleLink);

    const authorLine = document.createElement("p");
    authorLine.className = "gv-discover-author";
    authorLine.textContent = `Posted by ${author}`;

    const popularity = document.createElement("p");
    popularity.className = "gv-discover-popularity";
    popularity.textContent =
      `${post.reaction_count || 0} reactions`;

    body.append(tag, heading, authorLine, popularity);
    card.append(media, body);
    grid.appendChild(card);
  });
}

async function loadPosts() {
  status.hidden = false;
  status.textContent = "Loading community posts...";

  try {
    const { data, error } = await supabase
      .from("posts")
      .select("id,user_id,title,description,category,media_url,media_type,created_at,storage_path")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    posts = data || [];

    if (posts.length) {
      const userIds = [...new Set(posts.map(post => post.user_id))];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,username,display_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = Object.fromEntries(
        (profiles || []).map(profile => [profile.id, profile])
      );

      posts.forEach(post => {
        const profile = profileMap[post.user_id];
        post.username = profile?.username || "Player";
        post.display_name =
          profile?.display_name?.trim() || post.username;
        post.reaction_count = 0;
      });

      const { data: reactions, error: reactionsError } = await supabase
        .from("post_reactions")
        .select("post_id,user_id,reaction")
        .in("post_id", posts.map(post => post.id));

      if (reactionsError) throw reactionsError;

      const reactionCounts = {};

      (reactions || []).forEach(reaction => {
        reactionCounts[reaction.post_id] =
          (reactionCounts[reaction.post_id] || 0) + 1;
      });

      posts.forEach(post => {
        post.reaction_count = reactionCounts[post.id] || 0;
      });
    }

    renderPosts();
  } catch (error) {
    console.error("Discover loading error:", error);
    status.hidden = false;
    status.textContent =
      "Could not load posts. Please refresh and try again.";
  }
}

searchInput.addEventListener("input", renderPosts);
sortSelect.addEventListener("change", renderPosts);

filters.addEventListener("click", event => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;

  activeCategory = button.dataset.category;

  filters.querySelectorAll("button").forEach(item => {
    item.classList.toggle("active", item === button);
  });

  renderPosts();
});

loadPosts();
