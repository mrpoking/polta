// USERNAME
let username = localStorage.getItem("username") || "";

// CHAT LIMIT
let lastchatTime = 0;
const CHAT_COOLDOWN = 2541; 
const MAX_WORDS = 100;
const MAX_CHARS = 100;
const loadedKeys = new Set();

// ABLY INIT
const ABLY_API_KEY = "FMzwfA.bBJkxA:6oMEcHlLzda4NJ5qqcaMmk049tLWjg6SlpMpnL_IHH0";
const ably = new Ably.Realtime({ key: ABLY_API_KEY });
const channel = ably.channels.get("wassup-developers");

// FIREBASE INIT
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const chatCollection = db.collection("achievement-chats");
const usersCollection = db.collection("users");

document.addEventListener("DOMContentLoaded", () => {

    const chatContainer = document.getElementById('chatContainer');
    const chatInput = document.getElementById('chatInput');
    const nameInput = document.getElementById("nameInput");
    const buttonName = document.getElementById("buttonName");

    function setChatDisabled(isDisabled) {
        chatInput.disabled = isDisabled;
        chatInput.placeholder = isDisabled ? "Invalid To Chat" : "Aa";
    }

    function initializeNameInput() {
        if (!nameInput || !buttonName) return;

        if (username) {
            nameInput.placeholder = username;
            nameInput.value = "";
            setChatDisabled(false);
        } else {
            nameInput.placeholder = "Type Your Name";
            setChatDisabled(true);
        }

        buttonName.addEventListener("click", saveUsername);
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") saveUsername();
        });
    }

    async function saveUsername() {
        const input = nameInput.value.trim();
        if (!input) return;

        const validUsernameRegex = /^[\p{L}]+( [\p{L}]+)*$/u; // letters + Vietnamese
        if (!validUsernameRegex.test(input)) return alert("Invalid Name");

        const cleanName = input.replace(/\s+/g, " ").trim();
        if (cleanName.length < 6) return alert("Too Short");
        if (cleanName.length > 20) return alert("Too Long");

        try {
            if (cleanName === username) return;

            const now = Date.now();
            await usersCollection.doc(cleanName).set({
                createdAt: firebase.firestore.Timestamp.fromMillis(now)
            });

            username = cleanName;
            localStorage.setItem("username", username);
            nameInput.placeholder = username;
            nameInput.value = "";
            setChatDisabled(false);

            alert(`${username}`);
        } catch (err) {
            console.error(err);
            alert("Error Saving Username");
        }
    }

    chatInput.addEventListener("input", () => {
        if (chatInput.disabled) return;

        let content = chatInput.value;
        const urlRegex = /(https?:\/\/[^\s]+)/;
        const hasLink = urlRegex.test(content);

        if (!hasLink) {
            if (content.length > MAX_CHARS) content = content.slice(0, MAX_CHARS);
            const words = content.trim().split(/\s+/);
            if (words.length > MAX_WORDS) content = words.slice(0, MAX_WORDS).join(" ");
        }

        chatInput.value = content;
    });

    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[m]));
    }

    function createChatElement({ id, content, username }) {
        if (!id || document.getElementById(`chat-${id}`)) return null;

        const wrapper = document.createElement("div");
        wrapper.classList.add("username-chat");
        wrapper.id = `chat-${id}`;

        const chat = document.createElement("div");
        chat.classList.add("chat");

        const safeContent = escapeHTML(content).replace(
            /(https?:\/\/[^\s]+)/g,
            `<a href="$&" target="_blank">$&</a>`
        );

        chat.innerHTML = `
            <strong class="chat-username">${escapeHTML(username)}</strong>:
            <span class="chat-message">${safeContent}</span>
        `;

        chat.addEventListener("click", (e) => {
            const target = e.target.closest("a");
            if (!target) return;
            e.preventDefault();
            if (!confirm(`Visit\n${target.href}`)) return;
            window.open(target.href);
        });

        wrapper.appendChild(chat);
        return wrapper;
    }

    function handleIncomingchat(data) {
        if (!data || !data.id || loadedKeys.has(data.id)) return;

        loadedKeys.add(data.id);
        const chatElement = createChatElement(data);
        if (!chatElement) return;

        chatContainer.appendChild(chatElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        const allchats = chatContainer.getElementsByClassName("username-chat");
        while (allchats.length > 50) allchats[0].remove();
    }

    function hasLongRepeatingChars(str) {
        return /(.)\1{5,}/.test(str);
    }

    async function addchat() {
        if (chatInput.disabled) {
            alert("Invalid To Chat");
            return;
        }

        const now = Date.now();
        if (now - lastchatTime < CHAT_COOLDOWN) return;
        lastchatTime = now;

        const content = chatInput.value.trim();
        if (!content) return;

        if (hasLongRepeatingChars(content)) {
            alert("Message contains repeated characters");
            return;
        }

        chatInput.value = "";

        const chatData = {
            content,
            username: username || "Anonymous",
            time: firebase.firestore.Timestamp.fromMillis(Date.now())
        };

        try {
            const docRef = await chatCollection.add(chatData);

            channel.publish("new-achievement", {
                id: docRef.id,
                content,
                username: username || "Anonymous"
            });
        } catch (err) {
            console.error("Chating Failed:", err);
        }
    }

    function initializeApp() {
        try {
            chatCollection
                .orderBy("time", "asc")
                .limitToLast(50)
                .onSnapshot(snapshot => {
                    snapshot.docs.forEach(doc => {
                        handleIncomingchat({
                            id: doc.id,
                            content: doc.data().content || "",
                            username: doc.data().username || "Anonymous",
                        });
                    });
                });

            channel.subscribe("new-achievement", (msg) =>
                handleIncomingchat(msg.data)
            );
        } catch (error) {
            console.error("Error Initializing App:", error);
        }
    }

    // Press Enter to send
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addchat();
    });

    // Expose global function for HTML Send button
    window.sendChat = addchat;

    // Initialize
    initializeNameInput();
    initializeApp();
});

