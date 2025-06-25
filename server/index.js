const express = require("express");
const app = express();
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

app.use(cors());
app.use(express.json());

const SECRET = "jwt_secret_key_123"; // Cambia esto en producción

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "pacientes",
});

function toNullIfEmpty(value) {
  return value === "" ? null : value;
}

// --- Middleware de autenticación ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requerido" });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
}

// --- Registro de usuario ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  const hash = await bcrypt.hash(password, 10);
  db.query(
    "INSERT INTO usuario (username, password) VALUES (?, ?)",
    [username, hash],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al registrar usuario" });
      }
      res.json({ message: "Usuario registrado" });
    }
  );
});

// --- Login ---
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.query("SELECT * FROM usuario WHERE username = ?", [username], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error en el servidor" });
    }
    if (results.length === 0) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: "8h" });
    res.json({ token });
  });
});

// --- CRUD Paciente principal (protegido) ---
app.get("/pacientes", authenticateToken, (req, res) => {
  const sql = `SELECT p.*, v.Tipo_Piso, v.Numero_Habitaciones, v.Area, v.Estrato, v.Barrio, v.Numero_Personas, e.Estado, e.Descripcion as Estado_Descripcion
    FROM paciente p
    LEFT JOIN vivienda v ON p.ID_Vivienda = v.ID_Vivienda
    LEFT JOIN estado_paciente e ON p.ID_Estado = e.ID_Estado`;
  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});

app.get("/pacientes/:id", authenticateToken, (req, res) => {
  const id = req.params.id;
  const pacienteSql = `SELECT * FROM paciente WHERE Numero_Identificacion = ?`;
  db.query(pacienteSql, [id], (err, paciente) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    if (paciente.length === 0) return res.status(404).send("Paciente no encontrado");
    // Consultar relaciones
    const enfermedadesSql = `SELECT pe.ID_Enfermedad, en.Nombre_Enfermedad, pe.Fecha_Diagnostico, pe.Estadio FROM paciente_enfermedad pe JOIN enfermedad en ON pe.ID_Enfermedad = en.ID_Enfermedad WHERE pe.ID_Paciente = ?`;
    const programasSql = `SELECT pp.ID_Programa, pr.Nombre_Programa, pp.Fecha_Vinculacion, pp.Observaciones FROM paciente_programa pp JOIN programa pr ON pp.ID_Programa = pr.ID_Programa WHERE pp.ID_Paciente = ?`;
    const tratamientosSql = `SELECT pt.ID_Tratamiento, t.Nombre_Tratamiento, t.Tipo_Tratamiento, pt.Fecha_Inicio, pt.Fecha_Fin, pt.Resultado FROM paciente_tratamiento pt JOIN tratamiento t ON pt.ID_Tratamiento = t.ID_Tratamiento WHERE pt.ID_Paciente = ?`;
    db.query(enfermedadesSql, [id], (err, enfermedades) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      db.query(programasSql, [id], (err, programas) => {
        if (err) {
          console.error(err);
          return res.status(500).send(err);
        }
        db.query(tratamientosSql, [id], (err, tratamientos) => {
          if (err) {
            console.error(err);
            return res.status(500).send(err);
          }
          res.json({ paciente: paciente[0], enfermedades, programas, tratamientos });
        });
      });
    });
  });
});

app.post("/pacientes", authenticateToken, (req, res) => {
  const {
    Tipo_Identificacion,
    Numero_Identificacion,
    Nombres,
    Apellidos,
    Fecha_Nacimiento,
    Sexo,
    Departamento,
    Ciudad,
    ID_Vivienda,
    ID_Estado,
  } = req.body;
  const sql = `INSERT INTO paciente (Tipo_Identificacion, Numero_Identificacion, Nombres, Apellidos, Fecha_Nacimiento, Sexo, Departamento, Ciudad, ID_Vivienda, ID_Estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.query(
    sql,
    [
      Tipo_Identificacion,
      Numero_Identificacion,
      Nombres,
      Apellidos,
      toNullIfEmpty(Fecha_Nacimiento),
      Sexo,
      Departamento,
      Ciudad,
      toNullIfEmpty(ID_Vivienda),
      toNullIfEmpty(ID_Estado),
    ],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      res.send("Paciente creado con éxito");
    }
  );
});

app.put("/pacientes/:id", authenticateToken, (req, res) => {
  const id = req.params.id;
  const {
    Tipo_Identificacion,
    Nombres,
    Apellidos,
    Fecha_Nacimiento,
    Sexo,
    Departamento,
    Ciudad,
    ID_Vivienda,
    ID_Estado,
  } = req.body;
  const sql = `UPDATE paciente SET Tipo_Identificacion=?, Nombres=?, Apellidos=?, Fecha_Nacimiento=?, Sexo=?, Departamento=?, Ciudad=?, ID_Vivienda=?, ID_Estado=? WHERE Numero_Identificacion=?`;
  db.query(
    sql,
    [
      Tipo_Identificacion,
      Nombres,
      Apellidos,
      toNullIfEmpty(Fecha_Nacimiento),
      Sexo,
      Departamento,
      Ciudad,
      toNullIfEmpty(ID_Vivienda),
      toNullIfEmpty(ID_Estado),
      id,
    ],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      res.send("Paciente actualizado con éxito");
    }
  );
});

app.delete("/pacientes/:id", authenticateToken, (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM paciente WHERE Numero_Identificacion = ?", [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.send("Paciente eliminado con éxito");
  });
});

// --- Catálogos para selects (públicos) ---
app.get("/enfermedades", (req, res) => {
  db.query("SELECT * FROM enfermedad", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});
app.get("/estados", (req, res) => {
  db.query("SELECT * FROM estado_paciente", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});
app.get("/viviendas", (req, res) => {
  db.query("SELECT * FROM vivienda", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});
app.get("/programas", (req, res) => {
  db.query("SELECT * FROM programa", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});
app.get("/tratamientos", (req, res) => {
  db.query("SELECT * FROM tratamiento", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});

// --- Asociaciones (protegidas) ---
app.post("/pacientes/:id/enfermedades", authenticateToken, (req, res) => {
  const id = req.params.id;
  const { ID_Enfermedad, Fecha_Diagnostico, Estadio } = req.body;
  const sql = `INSERT INTO paciente_enfermedad (ID_Paciente, ID_Enfermedad, Fecha_Diagnostico, Estadio) VALUES (?, ?, ?, ?)`;
  db.query(sql, [id, ID_Enfermedad, Fecha_Diagnostico, Estadio], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.send("Enfermedad asociada con éxito");
  });
});
app.post("/pacientes/:id/programas", authenticateToken, (req, res) => {
  const id = req.params.id;
  const { ID_Programa, Fecha_Vinculacion, Observaciones } = req.body;
  const sql = `INSERT INTO paciente_programa (ID_Paciente, ID_Programa, Fecha_Vinculacion, Observaciones) VALUES (?, ?, ?, ?)`;
  db.query(sql, [id, ID_Programa, Fecha_Vinculacion, Observaciones], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.send("Programa asociado con éxito");
  });
});
app.post("/pacientes/:id/tratamientos", authenticateToken, (req, res) => {
  const id = req.params.id;
  const { ID_Tratamiento, Fecha_Inicio, Fecha_Fin, Resultado } = req.body;
  const sql = `INSERT INTO paciente_tratamiento (ID_Paciente, ID_Tratamiento, Fecha_Inicio, Fecha_Fin, Resultado) VALUES (?, ?, ?, ?, ?)`;
  db.query(sql, [id, ID_Tratamiento, Fecha_Inicio, Fecha_Fin, Resultado], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.send("Tratamiento asociado con éxito");
  });
});

app.listen(3001, () => {
  console.log("Running on the port 3001");
});
