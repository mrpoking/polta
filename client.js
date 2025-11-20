// CUSTOMIZE USERNAME
let username = localStorage.getItem("username") || "";

// SPAM PREVENTION
let lastPostTime = 0;
const CHAT_COOLDOWN = 2541;
const MAX_WORDS     = 100;
const MAX_CHARS     = 100;

// DOM ELEMENTS
const postContainer = document.getElementById('chatContainer');
const chatInput     = document.getElementById('chatInput');
const postButton    = document.getElementById('postButton');
const nameInput     = document.getElementById("nameInput");
const nameButton    = document.getElementById("nameButton");
const loadedKeys    = new Set();

// ABLY INIT
const ABLY_API_KEY = "FMzwfA.m94D-g:TV0cojmYMInPRGxeof6UWD2pM_mPBVPfn94PmktgWjA";
const ably         = new Ably.Realtime({ key: ABLY_API_KEY });
const channel      = ably.channels.get("achievement-feed");

// FIREBASE INIT
firebase.initializeApp(firebaseConfig);
const db              = firebase.firestore();
const chatCollection  = db.collection("achievement-chats");
const usersCollection = db.collection("users");

// CHAT DISABLED CONTROL
function setChatDisabled(isDisabled) {
    chatInput.disabled = isDisabled;
    if (postButton) postButton.disabled = isDisabled;
    chatInput.placeholder = isDisabled
        ? "Please enter and save your name first"
        : "...";
}

// INITIALIZE NAME INPUT
function initializeNameInput() {
    if (username) {
        nameInput.placeholder = username;
        nameInput.value = "";
        setChatDisabled(false);
    } else {
        nameInput.placeholder = "...";
        setChatDisabled(true);
    }
    nameButton.onclick = saveUsername;
}

// SAVE USERNAME FUNCTION
async function saveUsername() {
    const input = nameInput.value.trim();
    if (!input) return alert("Enter Your Name!");
    const validUsernameRegex = /^[\w ]+$/;
    if (!validUsernameRegex.test(input)) {
        return alert("Username can only contain letters, numbers, underscores, and spaces.");
    }
    const cleanName = input.replace(/\s+/g, ' ').trim();
    if (cleanName.length < 6) return alert("Username must be at least 10 characters.");
    if (cleanName.length > 20) return alert("Username cannot exceed 20 characters.");
    if (cleanName === username) return alert(`You are already using this username: ${username}`);
    const oldUsername = username;
    try {
        const newRef = usersCollection.doc(cleanName);
        const snap = await newRef.get();
        if (snap.exists) return alert("This username is already taken!");
        await newRef.set({ createdAt: firebase.firestore.Timestamp.fromMillis(Date.now()) });
        if (oldUsername) {
            await usersCollection.doc(oldUsername).delete().catch(() => {});
        }
        username = cleanName;
        localStorage.setItem("username", username);
        setChatDisabled(false);
        nameInput.placeholder = username;
        nameInput.value = "";
        alert(`Username changed to: ${username}`);
    } catch (err) {
        console.error(err);
        alert("Error saving username!");
    }
}

// CHAT INPUT LIMIT
chatInput.addEventListener('input', () => {
    if (chatInput.disabled) return;
    let content = chatInput.value;
    const urlRegex = /(https?:\/\/[^\s]+)/;
    const hasLink = urlRegex.test(content);
    if (!hasLink) {
        if (content.length > MAX_CHARS) content = content.slice(0, MAX_CHARS);
        const words = content.trim().split(/\s+/);
        if (words.length > MAX_WORDS) content = words.slice(0, MAX_WORDS).join(' ');
    }
    chatInput.value = content;
});

// ESCAPE HTML FUNCTION
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
}

// CREATE POST ELEMENT
function createPostElement({ id, content, username }) {
    if (!id) return null;
    if (document.getElementById(`post-${id}`)) return null;
    const wrapper = document.createElement('div');
    wrapper.classList.add('username-chat');
    wrapper.id = `post-${id}`;
    const post = document.createElement('div');
    post.classList.add('chat');
    const safeContent = escapeHTML(content).replace(
        /(https?:\/\/[^\s]+)/g,
        `<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>`
    );
    post.innerHTML = `
        <strong class="chat-username">${escapeHTML(username || "Anonymous")}</strong>:
        <span class="chat-message">${safeContent}</span>
    `;
    post.addEventListener("click", (e) => {
        const target = e.target.closest("a");
        if (!target) return;
        e.preventDefault();
        const url = target.href;
        if (!confirm(`You Are Leaving Polta To Visit\n\n${url}\n\nAre You Sure?`)) return;
        window.open(url, "_blank", "noopener,noreferrer");
    });
    wrapper.appendChild(post);
    return wrapper;
}

// HANDLE INCOMING POST
function handleIncomingPost(data) {
    if (!data || !data.id || loadedKeys.has(data.id)) return;
    loadedKeys.add(data.id);
    const postElement = createPostElement(data);
    if (!postElement) return;
    postContainer.appendChild(postElement);
    postContainer.scrollTop = postContainer.scrollHeight;
    const allPosts = postContainer.getElementsByClassName('username-chat');
    while (allPosts.length > 30) allPosts[0].remove();
}

// ADD NEW POST
async function addPost() {
    if (chatInput.disabled) {
        alert("Please enter and save your name first.");
        return;
    }
    const now = Date.now();
    if (now - lastPostTime < CHAT_COOLDOWN) return console.log("Wait a bit...");
    lastPostTime = now;
    const content = chatInput.value.trim();
    if (!content) return;
    chatInput.value = '';
    const postData = {
        content,
        username: username || "Anonymous",
        time: firebase.firestore.Timestamp.fromMillis(Date.now())
    };
    try {
        const docRef = await chatCollection.add(postData);
        channel.publish('new-achievement', {
            id: docRef.id,
            content,
            username: username || "Anonymous"
        });
    } catch (err) {
        console.error("Posting failed:", err);
    }
}

// INITIALIZE APP
function initializeApp() {
    try {
        chatCollection
            .orderBy("time", "asc")
            .limitToLast(30)
            .onSnapshot(snapshot => {
                snapshot.docs.forEach(doc => {
                    handleIncomingPost({
                        id: doc.id,
                        content: doc.data().content || "",
                        username: doc.data().username || "Anonymous"
                    });
                });
            });
        channel.subscribe('new-achievement', msg => handleIncomingPost(msg.data));
        initializeNameInput();
    } catch (error) {
        console.error("Error initializing app:", error);
    }
}

// EVENT HOOKUP
window.addPost = addPost;
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addPost();
    });
});
