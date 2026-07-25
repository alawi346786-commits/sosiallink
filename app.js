// Menggunakan Firebase CDN Modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Konfigurasi Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAZwS4WKzX0Pdki9Z3od2ptZuGZhcruH_Y",
    authDomain: "sosiallink.firebaseapp.com",
    projectId: "sosiallink",
    storageBucket: "sosiallink.firebasestorage.app",
    messagingSenderId: "970738917928",
    appId: "1:970738917928:web:17e968b69bc1c72959cb1d"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Aplikasi Global
let currentUser = null;
let userData = { username: '', displayName: '', bio: '', links: [], photoURL: '' };
let isDragAndDropActive = false;
let saveTimeout = null;

// --- UTILS & HELPERS ---
const $ = selector => document.querySelector(selector);
const showLoader = () => $('#global-loader').classList.add('active');
const hideLoader = () => $('#global-loader').classList.remove('active');

const showToast = (message) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    $('#toast-container').appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const validateUrl = (url) => {
    if (!url) return '';
    if (!url.match(/^https?:\/\//i)) return 'https://' + url;
    return url;
};

// Auto-generate username from email
const generateUsername = (email) => email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000);

// --- ROUTING SYSTEM (VANILLA JS SPA) ---
const hideAllViews = () => document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

const handleRoute = async () => {
    const path = window.location.pathname;
    hideAllViews();
    
    if (path === '/' || path === '/login') {
        $('#view-landing').classList.add('active');
        if (currentUser) navigateTo('/dashboard');
    } else if (path === '/dashboard' || path === '/settings') {
        if (!currentUser) navigateTo('/');
        else {
            $('#view-landing').classList.remove('active');
            $('#view-dashboard').classList.add('active');
            renderDashboard();
        }
    } else {
        // Rute untuk profil publik
        const username = path.substring(1).toLowerCase();
        $('#view-profile').classList.add('active');
        await loadPublicProfile(username);
    }
};

const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    handleRoute();
};

window.addEventListener('popstate', handleRoute);

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Ambil Data dari Firestore
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            userData = docSnap.data();
        } else {
            // Pengguna Baru
            userData = {
                uid: user.uid,
                username: generateUsername(user.email),
                displayName: user.displayName || 'Nama Anda',
                photoURL: user.photoURL || '',
                bio: 'Saya menggunakan Sosial.link!',
                links: [],
                createdAt: serverTimestamp()
            };
            await setDoc(docRef, userData);
        }
        
        if (window.location.pathname === '/' || window.location.pathname === '/login') {
            navigateTo('/dashboard');
        } else {
            handleRoute();
        }
    } else {
        currentUser = null;
        if (window.location.pathname === '/dashboard') navigateTo('/');
        else handleRoute();
    }
    hideLoader();
});

const login = async () => {
    showLoader();
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        showToast('Login gagal: ' + error.message);
        hideLoader();
    }
};

$('#btn-login-nav').addEventListener('click', login);
$('#btn-login-hero').addEventListener('click', login);
$('#btn-logout').addEventListener('click', () => {
    showLoader();
    signOut(auth).then(() => { navigateTo('/'); });
});

// --- DASHBOARD UI & LOGIC ---
const updateIframePreview = () => {
    const iframe = $('#preview-frame');
    if(userData.username) {
        iframe.src = `/${userData.username}`;
    }
};

const renderDashboard = () => {
    $('#input-display-name').value = userData.displayName || '';
    $('#dash-photo').src = userData.photoURL || 'https://via.placeholder.com/80';
    $('#input-username').value = userData.username;
    $('#input-bio').value = userData.bio;
    renderLinksManager();
    updateIframePreview();
};

// Debounce Autosave
const autoSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await setDoc(doc(db, 'users', currentUser.uid), userData, { merge: true });
            updateIframePreview();
        } catch (e) {
            console.error("Autosave error", e);
        }
    }, 800);
};

// Logika Tombol Simpan Profil Utama
$('#btn-save-profile').addEventListener('click', async () => {
    const newDisplayName = $('#input-display-name').value.trim();
    const newUsername = $('#input-username').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const newBio = $('#input-bio').value.trim();
    
    if (!newDisplayName) return showToast('Nama tampilan tidak boleh kosong!');
    if (!newUsername) return showToast('Username tidak boleh kosong!');
    
    showLoader();
    try {
        // Validasi ketersediaan Username unik jika ada perubahan
        if (newUsername !== userData.username) {
            const q = query(collection(db, 'users'), where('username', '==', newUsername));
            const querySnapshot = await getDocs(q);
            let taken = false;
            querySnapshot.forEach((docSnap) => {
                if (docSnap.id !== currentUser.uid) taken = true;
            });
            if (taken) {
                hideLoader();
                return showToast('Username sudah dipakai orang lain.');
            }
        }
        
        // Simpan data terbaru
        userData.displayName = newDisplayName;
        userData.username = newUsername;
        userData.bio = newBio;
        userData.updatedAt = serverTimestamp();
        
        await setDoc(doc(db, 'users', currentUser.uid), userData, { merge: true });
        showToast('Profil berhasil disimpan!');
        updateIframePreview();
    } catch (e) {
        showToast('Error menyimpan profil.');
    }
    hideLoader();
});

$('#btn-copy-link').addEventListener('click', () => {
    const url = window.location.origin + '/' + userData.username;
    navigator.clipboard.writeText(url);
    showToast('Link berhasil disalin!');
});


// --- UBAH FOTO PROFIL (RESIZE COMPRESSION) ---
const resizeImage = (file, maxSize = 200) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

$('#btn-change-photo').addEventListener('click', () => $('#input-avatar').click());

$('#input-avatar').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Pilih file gambar (JPG/PNG)!');
    
    showLoader();
    try {
        const base64Image = await resizeImage(file, 200);
        userData.photoURL = base64Image;
        $('#dash-photo').src = base64Image;
        autoSave();
        showToast('Foto profil berhasil diubah!');
    } catch (error) {
        showToast('Gagal memproses gambar');
    }
    hideLoader();
    e.target.value = ''; // Reset form file
});


// --- LINK MANAGER (DRAG & DROP) ---
$('#btn-add-link').addEventListener('click', () => {
    const newLink = {
        id: 'link_' + Date.now(),
        title: '',
        url: '',
        active: true,
        order: userData.links.length
    };
    userData.links.unshift(newLink);
    renderLinksManager();
    autoSave();
});

const renderLinksManager = () => {
    const container = $('#links-container');
    container.innerHTML = '';
    
    userData.links.sort((a, b) => a.order - b.order);
    
    userData.links.forEach((link, index) => {
        const item = document.createElement('div');
        item.className = 'link-item';
        item.draggable = true;
        item.dataset.index = index;
        
        item.innerHTML = `
            <div class="drag-handle"><svg width="24" height="24"><use href="#icon-drag"></use></svg></div>
            <div class="link-content">
                <input type="text" class="inp-title" value="${link.title}" placeholder="Judul Tautan">
                <input type="url" class="inp-url" value="${link.url}" placeholder="URL">
            </div>
            <div class="link-actions">
                <label class="toggle">
                    <input type="checkbox" class="inp-active" ${link.active ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <button class="btn btn-danger delete-link"><svg width="18" height="18"><use href="#icon-trash"></use></svg></button>
            </div>
        `;
        
        item.querySelector('.inp-title').addEventListener('input', (e) => {
            userData.links[index].title = e.target.value;
            autoSave();
        });
        
        item.querySelector('.inp-url').addEventListener('change', (e) => {
            userData.links[index].url = validateUrl(e.target.value);
            e.target.value = userData.links[index].url;
            autoSave();
        });
        
        item.querySelector('.inp-active').addEventListener('change', (e) => {
            userData.links[index].active = e.target.checked;
            autoSave();
        });
        
        item.querySelector('.delete-link').addEventListener('click', () => {
            userData.links.splice(index, 1);
            renderLinksManager();
            autoSave();
        });
        
        item.addEventListener('dragstart', (e) => {
            isDragAndDropActive = true;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            isDragAndDropActive = false;
            const newOrder = Array.from(container.children).map(child => parseInt(child.dataset.index));
            const reorderedLinks = newOrder.map(i => userData.links[i]);
            reorderedLinks.forEach((l, i) => l.order = i);
            userData.links = reorderedLinks;
            renderLinksManager();
            autoSave();
        });
        
        container.appendChild(item);
    });
};

$('#links-container').addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isDragAndDropActive) return;
    
    const draggingItem = $('.dragging');
    const siblings = [...$('#links-container').querySelectorAll('.link-item:not(.dragging)')];
    let nextSibling = siblings.find(sibling => {
        return e.clientY <= sibling.offsetTop + sibling.offsetHeight / 2;
    });
    
    $('#links-container').insertBefore(draggingItem, nextSibling);
});


// --- PUBLIC PROFILE LOGIC & AUTO ICON DETECTOR ---
const getIconForUrl = (url) => {
    if (!url) return 'default';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('whatsapp.com') || lowerUrl.includes('wa.me')) return 'whatsapp';
    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.me') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('linkedin.com')) return 'linkedin';
    return 'default';
};

const loadPublicProfile = async (username) => {
    const container = $('#public-content');
    
    container.innerHTML = `
        <div class="skeleton-profile">
            <div class="skel-avatar skeleton"></div>
            <div class="skel-text skeleton"></div>
            <div class="skel-text skeleton" style="width: 50%;"></div>
            <div class="skel-btn skeleton"></div>
            <div class="skel-btn skeleton"></div>
        </div>
    `;

    try {
        const q = query(collection(db, 'users'), where('username', '==', username));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            hideAllViews();
            $('#view-404').classList.add('active');
            return;
        }

        let profileData = null;
        querySnapshot.forEach((doc) => { profileData = doc.data(); });
        
        let html = `
            <img src="${profileData.photoURL || 'https://via.placeholder.com/100'}" alt="${profileData.displayName}" class="pub-avatar">
            <h1 class="pub-name">${profileData.displayName}</h1>
            <p class="pub-bio">${profileData.bio}</p>
        `;
        
        const activeLinks = profileData.links
            .filter(link => link.active && link.title && link.url)
            .sort((a, b) => a.order - b.order);
            
        activeLinks.forEach(link => {
            const iconName = getIconForUrl(link.url);
            html += `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="pub-link">
                    <svg class="pub-link-icon" width="24" height="24"><use href="#icon-${iconName}"></use></svg>
                    <span>${link.title}</span>
                </a>
            `;
        });
        
        if(activeLinks.length === 0) {
            html += `<p style="color:var(--text-muted); margin-top:20px;">Belum ada tautan yang ditambahkan.</p>`;
        }
        
        container.innerHTML = html;
        
    } catch (e) {
        container.innerHTML = '<p>Terjadi kesalahan memuat profil.</p>';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    showLoader();
});
