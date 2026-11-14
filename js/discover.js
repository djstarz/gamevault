
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

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getPostText(post) {
  return [
    post.title,
    post.description,
    post.game,
    post.category,
    post.username,
    post.author_name
  ].filter(Boolean).join(" ").toLowerCase();
}

function getPostDate(post) {
  const value = post.created_at ? new Date(post.created_at).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function getPopularity(post) {
  return Number(post.likes_count || post.likes || post.reaction_count || 0);
}

function renderPosts() {
  const search = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  let visible = posts.filter(post => {
    const categoryMatch =
      activeCategory === "All" ||
      String(post.category || "").toLowerCase() === activeCategory.toLowerCase();

    const searchMatch = !search || getPostText(post).includes(search);

    return categoryMatch && searchMatch;
  });

  visible.sort((a, b) => {
    if (sort === "popular") {
      return getPopularity(b) - getPopularity(a) ||
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

    const postId = post.id;
    const title = post.title || post.game || "Untitled post";
    const category = post.category || "Community";
    const author = post.author_name || post.username || "Player";
    const mediaURL = post.media_url || post.image_url || "";
    const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(mediaURL);

    const media = document.createElement("a");
    media.className = "media";
    media.href = `post.html?id=${encodeURIComponent(postId)}`;
    media.setAttribute("aria-label", `Open ${title}`);

    if (mediaURL) {
      const element = document.createElement(isVideo ? "video" : "img");
      element.src = mediaURL;

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
    titleLink.href = `post.html?id=${encodeURIComponent(postId)}`;
    titleLink.textContent = title;
    heading.appendChild(titleLink);

    const authorLine = document.createElement("p");
    authorLine.className = "gv-discover-author";
    authorLine.textContent = `Posted by ${author}`;

    body.append(tag, heading, authorLine);
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
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    posts = data || [];
    renderPosts();
  } catch (error) {
    console.error("Discover loading error:", error);
    status.hidden = false;
    status.textContent = "Could not load posts. Please refresh and try again.";
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

