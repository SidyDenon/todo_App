const API_BASE = "https://todo-app-production-a928.up.railway.app";

// Sélecteurs
const usernameSpan = document.querySelector(".Username");
const usernameSpan2 = document.querySelector(".Username2");
const tacheTotalSpan = document.querySelector(".tacheTotal");
const tasksContainer = document.querySelector(".tasks");
const addTaskBtn = document.querySelector(".add-task");
const boxTache = document.getElementById("box-tache");
const tachesInput = document.getElementById("taches-input");
const categoriesSelect = document.getElementById("categories-select");
const cancelBtn = boxTache.querySelector(".cancel-btns");
const addBtn = boxTache.querySelector("#add-btn");
const editBtn = boxTache.querySelector("#edit-btn");
const toggleSunBtn = document.getElementById("toggleSunBtn");
const toggleMoonBtn = document.getElementById("toggleMoonBtn");
const logoutLink = document.querySelector(".decon a");
const menu = document.querySelector(".fa-bars");
const navPage = document.querySelector(".nav-page");
const closeNavbar = document.querySelector(".close");
const filtre = document.querySelector(".filtre");
const filtre2 = document.querySelector(".nav-filter");
const ecran2 = document.querySelector(".category-detail-ecran");
const retour = document.querySelector(".fa-arrow-left-long");
const themeBox = document.querySelector(".themes"); 
const adminBtn = document.getElementById("admin-btn");

// Nouveaux éléments ajoutés à ton HTML, à vérifier dans le DOM :
const categoriesContainer = document.querySelector(".categories");
const categoriesTitre = document.querySelector(".category-titre");
const categoriesImg = document.querySelector("#categories-img");
const iphone = document.querySelector(".iphone"); // wrapper de tâches

// Catégories en dur
const categories = [
  { title: "Personnel", img: "boy.png" },
  { title: "Travail", img: "briefcase.png" },
  { title: "Shopping", img: "shopping.png" },
  { title: "Coding", img: "web-design.png" },
  { title: "Santé", img: "healthcare.png" },
  { title: "Fitness", img: "dumbbell.png" },
  { title: "Education", img: "education.png" },
  { title: "Finance", img: "saving.png" },
];

// Variables d'état
let tasks = [];
let editingTaskId = null;
let token = localStorage.getItem("token");
let selectCategory = categories[0];

// Ajout de la variable pour le total de tâches catégorie (correction)
const categoriesTacheTotal = document.querySelector(".category-total-tasks");
const totalTaches = document.querySelector(".tacheTotal"); // déjà défini mais je garde au cas

// Fonction d’appel API sécurisée (avec gestion token + erreur)
async function apiFetch(url, options = {}) {
  if (!options.headers) options.headers = {};
  options.headers["Authorization"] = "Bearer " + token;
  options.headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + url, options);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      alert("Session expirée, veuillez vous reconnecter.");
      logout();
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Erreur API");
  }
  return res.json();
}

// Vérifier si utilisateur connecté
async function checkAuth() {
  if (!token) {
    window.location.href = "/pages/login.html";
    return;
  }

 try {
    // on récupère maintenant id, username, avatar, theme, role
    const { id, username, avatar, theme, role } = await apiFetch('/user');
    window.currentUserId = id;
    // met à jour nom & avatar
    usernameSpan.textContent = username;
    usernameSpan2.textContent = username;
    // applique l’avatar
   // cible à la fois #user-avatar et #sidebar-avatar
const ua1 = document.getElementById('user-avatar');
const ua2 = document.getElementById('sidebar-avatar');
 
const avatarUrl = avatar || "../styles/images/boy.png";
if (ua1) ua1.src = avatarUrl;
if (ua2) ua2.src = avatarUrl;

    setTheme(theme);
    if (role === "admin") adminBtn.style.display = 'inline-block';
    fillCategories();
    await loadTasks();
  } catch (err) {
    logout();
  }
}


// — Références —
const btnModifyProfile = document.getElementById('modifier');
const formProfile      = document.getElementById('user-profile-form');
const inpUsername      = document.getElementById('user-profile-username');
const inpAvatar        = document.getElementById('user-profile-avatar');

// Ouvre/ferme le form
btnModifyProfile.addEventListener('click', e => {
  e.preventDefault();
  formProfile.classList.toggle('hidden');
  inpUsername.value = usernameSpan.textContent;
});
document.getElementById('user-profile-cancel').addEventListener('click', e => {
  e.preventDefault();
  formProfile.classList.add('hidden');
});

// Soumission du form
document.getElementById('user-profile-submit').addEventListener('click', async e => {
  e.preventDefault();
  const newName = inpUsername.value.trim();
  let avatarData = "../styles/images/boy.png";
  if (inpAvatar.files.length > 0) {
    avatarData = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = ()=>r(reader.result);
      reader.readAsDataURL(inpAvatar.files[0]);
    });
  }
  try {
    const updated = await apiFetch('/user/profile', {
      method: 'PUT',
      body: JSON.stringify({
        username: newName,
        avatar:   avatarData
      })
    });
    // mise à jour UI
    usernameSpan.textContent = updated.username;
    usernameSpan2.textContent= updated.username;
    const ua = document.getElementById('user-avatar');
    if (ua) ua.src = updated.avatar;
    // prévenir les autres onglets/admin
    socket.emit('profileUpdated', {
      userId: window.currentUserId,
      username: updated.username,
      avatar: updated.avatar
    });
    formProfile.classList.add('hidden');
  } catch(err) {
    alert("Erreur mise à jour profil : " + (err.message||err));
  }
});


// Calcul total tâches selon catégorie sélectionnée et total global
function calculTotal() {
  const categoryTasks = tasks.filter(
    (task) =>
      task.category.toLowerCase() === selectCategory.title.toLowerCase()
  );
  if (categoriesTacheTotal) {
    categoriesTacheTotal.innerHTML = `${categoryTasks.length} Tâche${
      categoryTasks.length > 1 ? "s" : ""
    }`;
  }
  if (totalTaches) {
    totalTaches.innerHTML = tasks.length;
  }
}

// Affichage des catégories avec compte de tâches, triées par nombre de tâches
function renderCategories() {
  if (!categoriesContainer) return;
  categoriesContainer.innerHTML = "";

  const categoriesWithCount = categories.map((category) => {
    const count = tasks.filter(
      (task) => task.category.toLowerCase() === category.title.toLowerCase()
    ).length;
    return { ...category, count };
  });

  categoriesWithCount.sort((a, b) => b.count - a.count);

  categoriesWithCount.forEach((category) => {
    const div = document.createElement("div");
    div.classList.add("category");
    div.innerHTML = `
      <div class="left">
        <img src="../styles/images/${category.img}" alt="${category.title}">
        <div class="contenu">
          <h1>${category.title}</h1>
          <p><span class="nb-task">${category.count}</span> Tâche${
      category.count > 1 ? "s" : ""
    }</p>
        </div>
      </div>`;

    div.addEventListener("click", () => {
      iphone.classList.add("show-detail");
      if (window.matchMedia("(max-width: 482px)").matches) {
      themeBox.style.display = "none";
      }
      selectCategory = category;
      if (categoriesTitre) categoriesTitre.innerHTML = category.title;
      if (categoriesImg) categoriesImg.src = `../styles/images/${category.img}`;
      calculTotal();
      renderTasks();
    });

    categoriesContainer.appendChild(div);
  });
}

// Affiche uniquement les tâches de la catégorie sélectionnée
function renderTasks() {
  const filteredTasks = tasks.filter(
    (t) => t.category === selectCategory.title
  );
  tasksContainer.innerHTML = "";

  if (filteredTasks.length === 0) {
    tasksContainer.innerHTML = "<p>Aucune tâche pour cette catégorie.</p>";
    if (tacheTotalSpan) tacheTotalSpan.textContent = "0";
    return;
  }

  if (tacheTotalSpan) tacheTotalSpan.textContent = tasks.length;

  filteredTasks.forEach((task) => {
    const div = document.createElement("div");
    div.className = "task-wrapper";
    div.innerHTML = `
      <label class="task" data-id="${task.id}">
        <input type="checkbox" ${task.done ? "checked" : ""}>
        <a><i class="fa-solid fa-check"></i></a>
        <p>${escapeHtml(task.description)}</p>
      </label>
      <div class="sup-write">
        <a class="edit"><i class="fa-regular fa-pen-to-square"></i></a>
        <a class="delete"><i class="fa-regular fa-trash-can"></i></a>
      </div>
    `;

    // Checkbox done toggle
    div.querySelector("input").addEventListener("change", async (e) => {
      try {
        await apiFetch(`/tasks/${task.id}`, {
          method: "PUT",
          body: JSON.stringify({
            description: task.description,
            category: task.category,
            done: e.target.checked,
          }),
        });
        task.done = e.target.checked;
      } catch (e) {
        alert("Erreur mise à jour tâche : " + e.message);
        e.target.checked = !e.target.checked;
      }
    });

    // Edit task
    div.querySelector(".edit").addEventListener("click", () =>
      openEditTask(task)
    );

    // Delete task
    div.querySelector(".delete").addEventListener("click", async () => {
      if (confirm("Supprimer cette tâche ?")) {
        try {
          await apiFetch(`/tasks/${task.id}`, { method: "DELETE" });
          tasks = tasks.filter((t) => t.id !== task.id);
          renderTasks();
        } catch (e) {
          alert("Erreur suppression : " + e.message);
        }
      }
    });

    tasksContainer.appendChild(div);
  });
}

// Charge les tâches depuis l’API
async function loadTasks() {
  tasks = await apiFetch("/tasks");
  renderCategories();
  calculTotal();
  renderTasks();
}

// connexion au serveur
const socket = io(API_BASE);

// quand une tâche est ajoutée/modifiée/supprimée, on recharge
socket.on('taskAdded',   () => loadTasks());
socket.on('taskUpdated', () => loadTasks());
socket.on('taskDeleted', () => loadTasks());
socket.on("profileUpdated", data => {
  if (data.userId === window.currentUserId) {
    // Admin sidebar
    document.getElementById("sidebar-username").textContent = data.username;
    document.getElementById("sidebar-avatar").src = data.avatar;
    // User interface (si avatar & nom dupliqués)
    const ua = document.getElementById('user-avatar');
    if (ua) ua.src = data.avatar;
    document.querySelectorAll('.Username, .Username2')
      .forEach(el => el.textContent = data.username);
  }
});


// Escape texte HTML pour éviter injection
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Ouvre le formulaire édition tâche
function openEditTask(task) {
  editingTaskId = task.id;
  tachesInput.value = task.description;
  categoriesSelect.value = task.category;
  addBtn.style.display = "none";
  editBtn.style.display = "inline-block";
  addTaskBtn.classList.toggle("active");
  boxTache.classList.toggle("active");
  filtre.classList.toggle("active");
}

// Ferme le formulaire tâche
function closeBoxTache() {
  boxTache.classList.remove("active");
  filtre.classList.remove("active");
  addTaskBtn.classList.remove("active");
  editingTaskId = null;
  tachesInput.value = "";
}

// Ajoute une tâche
async function addTask() {
  const description = tachesInput.value.trim();
  const category = categoriesSelect.value || selectCategory.title;
  if (!description) return alert("La description est obligatoire.");
  try {
    await apiFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({ description, category }),
    });
    await loadTasks();
    closeBoxTache();
  } catch (e) {
    alert("Erreur ajout tâche : " + e.message);
  }
}


// Modifie une tâche existante
async function editTask() {
  const description = tachesInput.value.trim();
  const category = categoriesSelect.value;
  if (!description) return alert("La description est obligatoire.");
  try {
    await apiFetch(`/tasks/${editingTaskId}`, {
      method: "PUT",
      body: JSON.stringify({ description, category, done: false }),
    });
    await loadTasks();
    closeBoxTache();
  } catch (e) {
    alert("Erreur modification tâche : " + e.message);
  }
   
  
}

// Remplir la liste déroulante des catégories (formulaire)
function fillCategories() {
  categoriesSelect.innerHTML = "";
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.title;
    opt.textContent = cat.title;
    categoriesSelect.appendChild(opt);
  });
}

// Appliquer thème clair/sombre
const sunBtn = document.getElementById('toggleSunBtn');
const moonBtn = document.getElementById('toggleMoonBtn');
const body = document.body;

function setTheme(theme) {
  if (theme === "dark") {
    body.classList.add("dark");
    sunBtn.style.display = "inline-block";
    moonBtn.style.display = "none";
  } else {
    body.classList.remove("dark");
    sunBtn.style.display = "none";
    moonBtn.style.display = "inline-block";
  }
  localStorage.setItem("theme", theme);
}


// Bascule du thème quand on clique sur un bouton
// function toggleTheme() {
//   const currentTheme = body.classList.toggle("dark-theme") ? "dark" : "light";
//   const newTheme = currentTheme === "dark" ? "light" : "dark";
//   setTheme(newTheme);
// }

// Écouteurs sur les deux boutons qui appellent toggleTheme
sunBtn.addEventListener('click', () => {
  body.classList.toggle('dark');
  moonBtn.style.display="block"
  sunBtn.style.display="none"
  // Optionnel : mémoriser le choix dans localStorage
  if(body.classList.contains('dark')) {
    localStorage.setItem('theme', 'dark');
  } else {
    localStorage.setItem('theme', 'light');
  }
});

moonBtn.addEventListener('click', () => {
  body.classList.toggle('dark');
  sunBtn.style.display="block"
  moonBtn.style.display="none"
  // Optionnel : mémoriser le choix dans localStorage
//   if(body.classList.contains('dark-theme')) {
//     localStorage.setItem('theme', 'dark');
//   } else {
//     localStorage.setItem('theme', 'light');
//   }
});
// Au chargement, appliquer le thème sauvegardé
window.addEventListener('load', () => {
  const savedTheme = localStorage.getItem('theme') || "light";
  setTheme(savedTheme);
});

const toggleBtn = document.getElementById("notification-toggle");

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function sendNotification(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function scheduleNotification(hour, minute, callback) {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const timeout = target - now;
  setTimeout(() => {
    callback();
    scheduleNotification(hour, minute, callback);
  }, timeout);
}

function startNotifications() {
  if (localStorage.getItem("notificationsEnabled") !== "true") return;

  const token = localStorage.getItem("token"); // Assure-toi que ton token est stocké ici

  if (!token) {
    showToast("⚠️ Connecte-toi pour recevoir les notifications.");
    return;
  }

  // Notification début de journée à 8h
  scheduleNotification(8, 0, () => {
    fetch(API_BASE + "/tasks", { headers: { Authorization: "Bearer " + token } })
      .then(res => res.json())
      .then(tasks => {
        if (tasks.length === 0) {
          sendNotification("Planifie ta journée", "Tu n'as pas de tâches aujourd'hui, pense à en ajouter.");
        } else {
          sendNotification("Bonne journée", `Tu as ${tasks.length} tâche(s) aujourd'hui.`);
        }
      })
      .catch(() => {
        sendNotification("Erreur", "Impossible de récupérer tes tâches.");
      });
  });

  // Notification fin de journée à 20h
  scheduleNotification(20, 0, () => {
     fetch(API_BASE + "/tasks", { headers: { Authorization: "Bearer " + token } })
      .then(res => res.json())
      .then(tasks => {
        sendNotification("Résumé de ta journée", `Tu as eu ${tasks.length} tâche(s) aujourd'hui.`);
      })
      .catch(() => {
        sendNotification("Erreur", "Impossible de récupérer tes tâches.");
      });
  });
}

function updateButtonText() {
  const enabled = localStorage.getItem("notificationsEnabled") === "true";
  const icon = toggleBtn.querySelector("i");
  if (!icon) return;

  icon.className = enabled ? "fas fa-bell" : "fas fa-bell-slash";
}


toggleBtn.addEventListener("click", () => {
  const enabled = localStorage.getItem("notificationsEnabled") === "true";

  if (!enabled) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        localStorage.setItem("notificationsEnabled", "true");
        updateButtonText();
        showToast("✅ Notifications activées");
        startNotifications();
      } else {
        showToast("❌ Autorisation refusée");
      }
    });
  } else {
    localStorage.setItem("notificationsEnabled", "false");
    updateButtonText();
    showToast("🔕 Notifications désactivées");
  }
});

// Initialisation au chargement
updateButtonText();
startNotifications();



// Fonction pour changer le thème + envoyer au serveur
async function updateTheme(newTheme) {
  // Appliquer visuellement
  setTheme(newTheme);

  // Envoyer au serveur
  try {
    await apiFetch("/user/theme", {
      method: "PUT",
      body: JSON.stringify({ theme: newTheme }),
    });
  } catch (e) {
    alert("Erreur lors de la mise à jour du thème : " + e.message);
  }
}

// Soleil (passer au thème clair)
sunBtn.addEventListener('click', () => {
  updateTheme("light");
});

// Lune (passer au thème sombre)
moonBtn.addEventListener('click', () => {
  updateTheme("dark");
});


// Déconnexion
function logout() {
  localStorage.removeItem("token");
  window.location.href = "/pages/login.html";
}

// Événements UI
menu.addEventListener("click", () => {
  navPage.classList.toggle("active");
  filtre2.classList.toggle("active");
});
closeNavbar.addEventListener("click", () => {
  navPage.classList.toggle("active");
  filtre2.classList.toggle("active");
});
filtre2.addEventListener("click", () => {
  navPage.classList.toggle("active");
  filtre2.classList.toggle("active");
});
filtre.addEventListener("click", () => {
  filtre.classList.toggle("active");
  boxTache.classList.toggle("active");
  addTaskBtn.classList.toggle("active");
});


retour.addEventListener("click", () => {
  themeBox.style.display="block";
  iphone.classList.remove("show-detail")

});
addBtn.addEventListener("click", () =>{ 
  boxTache.classList.toggle("active");
  addBtn.classList.toggle("active");
  filtre.classList.toggle("active"); 

});
// toggleSunBtn.addEventListener("click", toggleTheme);
// toggleMoonBtn.addEventListener("click", toggleTheme);
addTaskBtn.addEventListener("click", () => {
  addTaskBtn.classList.toggle("active");
  boxTache.classList.toggle("active");
  filtre.classList.toggle("active");
});
cancelBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeBoxTache();
});
addBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  await addTask();
});
editBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  await editTask();
});
logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  logout();
});

// setTimeout(() => {
//   new Notification("Test", { body: "Notification locale testée avec succès !" });
// }, 10000);


// Initialisation
(async () => {
  fillCategories();
  await checkAuth();
})();
