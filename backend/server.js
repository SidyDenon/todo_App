const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
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
      "INSERT INTO users (username, email, password, theme) VALUES (?, ?, ?, ?)",
      [username, email, hash, "light"]
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
    const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username]);

    if (rows.length === 0)
      return res.status(400).json({ message: "Utilisateur non trouvé" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Mot de passe incorrect" });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: "8h",
    });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer données utilisateur (nom, thème)
app.get("/user", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT username, theme FROM users WHERE id = ?", [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Utilisateur non trouvé" });

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
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
