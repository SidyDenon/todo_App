const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
require("dotenv").config();
const http = require('http');
const { Server } = require('socket.io');

const app = express();


const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

// À chaque nouvelle connexion
io.on('connection', socket => {
  console.log('Client connecté', socket.id);
});

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET;

// Config BDD MySQL (à adapter)
const dbConfig = {
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD,
  database: "todo_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Création du pool
const pool = mysql.createPool(dbConfig);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // sert le front depuis /frontend

// Middleware pour vérifier token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token manquant" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token manquant" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token invalide" });
    req.user = user;
    next();
  });
};

// Routes API
// Autorisation Admin
function authorizeAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
}

// Routes Admin à coller en bas du fichier, avant le fallback SPA
app.get(
  '/admin/users',
  authenticateToken, authorizeAdmin,
  async (req, res) => {
    const [users] = await pool.execute(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.theme,
        u.role,
        COUNT(t.id) AS tasks_count
      FROM users u
      LEFT JOIN tasks t
        ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY (u.role = 'admin') DESC, u.username
    `);
    res.json(users);
  }
);

app.delete(
  '/admin/users/:id',
  authenticateToken, authorizeAdmin,
  async (req, res) => {
    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.sendStatus(204);
  }
);

app.get(
  '/admin/stats',
  authenticateToken, authorizeAdmin,
  async (req, res) => {
    const [[{ count: total_users }]] =
      await pool.query('SELECT COUNT(*) AS count FROM users');
    const [[{ count: total_tasks }]] =
      await pool.query('SELECT COUNT(*) AS count FROM tasks');
    res.json({ total_users, total_tasks });
  }
);
// Renvoie pour chaque catégorie le nombre de tâches
app.get(
  '/admin/categories-stats',
  authenticateToken, authorizeAdmin,
  async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT category, COUNT(*) AS count FROM tasks GROUP BY category'
    );
    res.json(rows); // [{ category: 'Personnel', count: 5 }, …]
  }
);

// Mise à jour profil
// 1) GET /user — inclut maintenant email et avatar_url
app.get("/user", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, email, avatar AS avatar, theme, role FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});



// 2) PUT /user/profile — ne modifie que username + avatar_url
app.put("/user/profile", authenticateToken, async (req, res) => {
  const { username, avatar } = req.body;
  try {
    await pool.execute(
      "UPDATE users SET username = ?, avatar = ? WHERE id = ?",
      [username, avatar || null, req.user.id]
    );

    // renvoie le profil mis à jour
    res.json({ username, avatar });

    // **AJOUT**
    io.emit("profileUpdated", {
      userId:   req.user.id,
      username: username,
      avatar:   avatar
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});




// Changer de mot de passe
app.put("/user/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const [[u]] = await pool.execute("SELECT password FROM users WHERE id=?", [req.user.id]);
  if (!await bcrypt.compare(currentPassword, u.password))
    return res.status(400).json({ message:"Mot de passe actuel incorrect" });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.execute("UPDATE users SET password=? WHERE id=?", [hash, req.user.id]);
  res.json({ message:"Mot de passe changé" });
});

// Notifications
app.get("/user/notifications", authenticateToken, async (req, res) => {
  const [[cfg]] = await pool.execute(
    "SELECT notif_email AS email, notif_push AS push FROM users WHERE id=?", [req.user.id]
  );
  res.json(cfg);
});
app.put("/user/notifications", authenticateToken, async (req, res) => {
  const { email, push } = req.body;
  await pool.execute(
    "UPDATE users SET notif_email=?, notif_push=? WHERE id=?",
    [email?1:0, push?1:0, req.user.id]
  );
  res.json({ message:"Notifications mises à jour" });
});

// Déconnexion globale
app.post("/user/logout-all", authenticateToken, async (req, res) => {
  // Implémente la révocation de tous les tokens de cet utilisateur…
  res.json({ message:"Tous les appareils déconnectés" });
});

// Suppression de compte
app.delete("/user/delete", authenticateToken, async (req, res) => {
  await pool.execute("DELETE FROM users WHERE id=?", [req.user.id]);
  res.json({ message:"Compte supprimé" });
});

// Route pour la demande de réinitialisation de mot de passe
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    // Vérifier si l'email existe dans la base de données
    const [users] = await pool.execute("SELECT id, username FROM users WHERE email = ?", [email]);

    if (users.length === 0) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    const user = users[0];

    // Générer un token pour réinitialiser le mot de passe
    const resetToken = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "1h" });

    // Lien de réinitialisation du mot de passe
    const resetLink = `http://localhost:4001/reset-password?token=${resetToken}`;

    // Configuration du transporteur d'email (Nodemailer)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'tonemail@gmail.com',
        pass: 'tonmotdepasse'
      }
    });

    // Options de l'email
    const mailOptions = {
      from: 'tonemail@gmail.com',
      to: email,
      subject: 'Réinitialisation du mot de passe',
      text: `Cliquez sur ce lien pour réinitialiser votre mot de passe : ${resetLink}`
    };

    // Envoi de l'email
    await transporter.sendMail(mailOptions);

    res.json({ message: "Un lien de réinitialisation a été envoyé à votre email." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour réinitialiser le mot de passe (exemple)
app.get("/reset-password", (req, res) => {
  const { token } = req.query;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Ici, tu peux afficher un formulaire pour réinitialiser le mot de passe
    res.send('Page de réinitialisation du mot de passe');
  } catch (err) {
    res.status(400).json({ message: "Token invalide ou expiré" });
  }
});

// Signup ****************************************************************************************
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ message: "Tous les champs sont requis" });

  try {
    const [existingEmail] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
    if (existingEmail.length > 0) {
      return res.status(400).json({ message: "Email déjà existant" });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      "INSERT INTO users (username, email, password, theme, role) VALUES (?, ?, ?, ?, ?)",
      [username, email, hash, "light","user"]
    );

    res.status(201).json({ message: "Inscription réussie" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Login ************************************************************************************
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Username et password requis" });

  try {
  const [rows] = await pool.execute("SELECT id,username,password,role FROM users WHERE username = ?", [username]) ;
    if (rows.length === 0)
      return res.status(400).json({ message: "Utilisateur non trouvé" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Mot de passe incorrect" });

    const token = jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  JWT_SECRET,
  { expiresIn: "8h" }
);


    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

//route pour emvoyer un email au users

async function verifierEtEnvoyerLien() {
  const email = document.getElementById("email").value.trim();

  if (!email || !email.includes("@")) {
    alert("Veuillez entrer une adresse email valide.");
    return;
  }

  try {
    const res = await fetch("http://localhost:4001/verifier-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Erreur serveur");

    const lien = `http://localhost:4001/reset-password?token=${data.token}`;

    const body = `
      Bonjour ${data.username},<br><br>
      Cliquez ici pour réinitialiser votre mot de passe :<br>
      <a href="${lien}">${lien}</a><br><br>
      Si vous n'avez pas fait cette demande, ignorez ce message.
    `;

    Email.send({
      SecureToken: "f24e5b69-749a-4b29-b569-6f37f553687e",
      To: email,
      From: "todo.app.services.mali@gmail.com",
      Subject: "Lien de réinitialisation du mot de passe",
      Body: body
    }).then(msg => alert("Email envoyé avec succès !"));

  } catch (err) {
    alert("Erreur : " + err.message);
  }
}


// Créer un nouvel utilisateur (accessible aux admins)
app.post(
  '/admin/users',
  authenticateToken, authorizeAdmin,
  async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !['admin','utilisateur'].includes(role)) {
      return res.status(400).json({ message: "Champs invalides" });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      await pool.execute(
        `INSERT INTO users (username, email, password, theme, role)
         VALUES (?, ?, ?, 'light', ?)`,
        [username, email, hash, role]
      );
      res.status(201).json({ message: "Utilisateur créé" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }
);


// Récupérer données utilisateur (nom, thème)
app.get("/user", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT username, email, avatar_url AS avatar, theme, role FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Modifier thème
app.put("/user/theme", authenticateToken, async (req, res) => {
  const { theme } = req.body;
  if (!["light", "dark"].includes(theme))
    return res.status(400).json({ message: "Theme invalide" });

  try {
    await pool.execute("UPDATE users SET theme = ? WHERE id = ?", [theme, req.user.id]);
    res.json({ message: "Theme mis à jour" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer tâches utilisateur
app.get("/tasks", authenticateToken, async (req, res) => {
  try {
    const [tasks] = await pool.execute(
      "SELECT id, description, category, done FROM tasks WHERE user_id = ?",
      [req.user.id]
    );
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Ajouter tâche
app.post("/tasks", authenticateToken, async (req, res) => {
  const { description, category } = req.body;
  if (!description || !category)
    return res.status(400).json({ message: "Description et catégorie requises" });

  try {
    await pool.execute(
      "INSERT INTO tasks (user_id, description, category, done) VALUES (?, ?, ?, 0)",
      [req.user.id, description, category]
    );
    res.status(201).json({ message: "Tâche ajoutée" });
    io.emit('taskAdded'); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});


// 🔥 TEMP : Voir tous les utilisateurs (à supprimer après test !)
app.get("/debug/users", async (req, res) => {
  console.log("GET /debug/users called"); // 🐛 debug
  try {
    const [users] = await pool.execute("SELECT id, username, email, password, theme FROM users");
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});



// Modifier tâche (texte, catégorie, done)
app.put("/tasks/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { description, category, done } = req.body;

  try {
    // Vérifier que la tâche appartient à l'utilisateur
    const [rows] = await pool.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    await pool.execute(
      "UPDATE tasks SET description = ?, category = ?, done = ? WHERE id = ?",
      [description, category, done ? 1 : 0, id]
    );
    res.json({ message: "Tâche modifiée" });
     io.emit('taskUpdated', req.params.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Supprimer tâche
app.delete("/tasks/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Vérifier que la tâche appartient à l'utilisateur
    const [rows] = await pool.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    await pool.execute("DELETE FROM tasks WHERE id = ?", [id]);
    res.json({ message: "Tâche supprimée" });
     io.emit('taskDeleted', req.params.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.post("/verifier-email", async (req, res) => {
  const { email } = req.body;

  try {
    const [users] = await pool.execute("SELECT username FROM users WHERE email = ?", [email]);

    if (users.length === 0) {
      return res.status(404).json({ message: "Email non trouvé" });
    }

    const user = users[0];
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});


// Fallback: renvoyer index.html pour toutes les autres routes (SPA)
const indexPath = path.join(__dirname, "../frontend/pages/index.html");

app.use((req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Fichier index.html introuvable");
  }
});

pool.getConnection()
  .then(conn => conn.query("SELECT DATABASE()"))
  .then(([rows]) => {
    console.log("Connecté à la base de données :", rows[0]['DATABASE()']);
  })
  .catch(err => console.error("Erreur DB :", err));


  


// Démarrer le serveur
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
