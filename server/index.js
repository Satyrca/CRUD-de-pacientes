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

// --- Crear tabla de intentos fallidos si no existe ---
const crearTablaIntentosFallidos = `
CREATE TABLE IF NOT EXISTS intentos_fallidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  username VARCHAR(100) NOT NULL,
  fecha_intento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  bloqueado_hasta TIMESTAMP NULL,
  INDEX idx_ip_fecha (ip, fecha_intento),
  INDEX idx_bloqueado (ip, bloqueado_hasta)
)`;

db.query(crearTablaIntentosFallidos, (err) => {
  if (err) {
    console.error("Error al crear tabla de intentos fallidos:", err);
  } else {
    console.log("Tabla de intentos fallidos verificada/creada");
  }
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

function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: "No tienes permisos suficientes" });
    }
    next();
  };
}

// --- Registro de usuario (solo admin) ---
app.post("/register", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { username, password, rol } = req.body;
  if (!username || !password || !rol) return res.status(400).json({ error: "Usuario, contraseña y rol requeridos" });
  if (!["admin", "user"].includes(rol)) return res.status(400).json({ error: "Rol inválido" });
  const hash = await bcrypt.hash(password, 10);
  db.query(
    "INSERT INTO usuario (username, password, rol) VALUES (?, ?, ?)",
    [username, hash, rol],
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
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Verificar si la IP está bloqueada
  db.query("SELECT * FROM intentos_fallidos WHERE ip = ? AND bloqueado_hasta > NOW()", [clientIP], (err, bloqueos) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error en el servidor" });
    }
    
    if (bloqueos.length > 0) {
      const bloqueo = bloqueos[0];
      const tiempoRestante = Math.ceil((new Date(bloqueo.bloqueado_hasta) - new Date()) / (1000 * 60));
      return res.status(423).json({ 
        error: `Acceso bloqueado. Intenta nuevamente en ${tiempoRestante} minutos.` 
      });
    }

    // Verificar credenciales
    db.query("SELECT * FROM usuario WHERE username = ?", [username], async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error en el servidor" });
      }
      
      if (results.length === 0) {
        registrarIntentoFallido(clientIP, username);
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }
      
      const user = results[0];
      const match = await bcrypt.compare(password, user.password);
      
      if (!match) {
        registrarIntentoFallido(clientIP, username);
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      // Login exitoso - limpiar intentos fallidos
      db.query("DELETE FROM intentos_fallidos WHERE ip = ?", [clientIP]);
      
      const token = jwt.sign({ id: user.id, username: user.username, rol: user.rol }, SECRET, { expiresIn: "8h" });
      res.json({ token, rol: user.rol });
    });
  });
});

function registrarIntentoFallido(ip, username) {
  // Contar intentos fallidos recientes
  db.query("SELECT COUNT(*) as intentos FROM intentos_fallidos WHERE ip = ? AND fecha_intento > DATE_SUB(NOW(), INTERVAL 2 HOUR)", [ip], (err, result) => {
    if (err) {
      console.error("Error al contar intentos fallidos:", err);
      return;
    }
    
    const intentos = result[0].intentos;
    
    // Registrar el intento fallido
    db.query("INSERT INTO intentos_fallidos (ip, username, fecha_intento) VALUES (?, ?, NOW())", [ip, username], (err) => {
      if (err) {
        console.error("Error al registrar intento fallido:", err);
        return;
      }
      
      // Si es el tercer intento o más, bloquear por 2 horas
      if (intentos >= 2) {
        const bloqueadoHasta = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas
        db.query("UPDATE intentos_fallidos SET bloqueado_hasta = ? WHERE ip = ?", [bloqueadoHasta, ip], (err) => {
          if (err) console.error("Error al bloquear IP:", err);
        });
      }
    });
  });
}

// --- CRUD de usuarios (solo admin) ---
app.get("/usuarios", authenticateToken, authorizeRole("admin"), (req, res) => {
  db.query("SELECT id, username, rol FROM usuario", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error al obtener usuarios" });
    }
    res.json(result);
  });
});

app.put("/usuarios/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const id = req.params.id;
  const { username, password, rol } = req.body;
  if (!username || !rol) return res.status(400).json({ error: "Usuario y rol requeridos" });
  if (!["admin", "user"].includes(rol)) return res.status(400).json({ error: "Rol inválido" });
  let sql, params;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    sql = "UPDATE usuario SET username=?, password=?, rol=? WHERE id=?";
    params = [username, hash, rol, id];
  } else {
    sql = "UPDATE usuario SET username=?, rol=? WHERE id=?";
    params = [username, rol, id];
  }
  db.query(sql, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error al actualizar usuario" });
    }
    res.json({ message: "Usuario actualizado" });
  });
});

app.delete("/usuarios/:id", authenticateToken, authorizeRole("admin"), (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM usuario WHERE id=?", [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error al eliminar usuario" });
    }
    res.json({ message: "Usuario eliminado" });
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

// --- Gestión de catálogos (solo admin) ---
app.get("/tipos-identificacion", (req, res) => {
  db.query("SELECT * FROM tipo_identificacion", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});

app.post("/tipos-identificacion", authenticateToken, authorizeRole("admin"), (req, res) => {
  const { nombre, formato } = req.body;
  db.query("INSERT INTO tipo_identificacion (nombre, formato) VALUES (?, ?)", [nombre, formato], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error al crear tipo de identificación" });
    }
    res.json({ message: "Tipo de identificación creado" });
  });
});

app.post("/viviendas", authenticateToken, (req, res) => {
  const { Tipo_Piso, Numero_Habitaciones, Area, Estrato, Barrio, Numero_Personas } = req.body;
  db.query(
    "INSERT INTO vivienda (Tipo_Piso, Numero_Habitaciones, Area, Estrato, Barrio, Numero_Personas) VALUES (?, ?, ?, ?, ?, ?)",
    [Tipo_Piso, Numero_Habitaciones, Area, Estrato, Barrio, Numero_Personas],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al crear vivienda" });
      }
      res.json({ message: "Vivienda creada", id: result.insertId });
    }
  );
});

app.post("/estados", authenticateToken, authorizeRole("admin"), (req, res) => {
  const { Estado, Descripcion } = req.body;
  db.query("INSERT INTO estado_paciente (Estado, Descripcion) VALUES (?, ?)", [Estado, Descripcion], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error al crear estado" });
    }
    res.json({ message: "Estado creado" });
  });
});

// --- Validaciones mejoradas ---
function validarIdentificacion(tipo, numero) {
  if (!tipo || !numero) return false;
  
  // Validaciones básicas según tipo
  switch (tipo.toLowerCase()) {
    case 'cc':
      return /^\d{8,10}$/.test(numero);
    case 'ce':
      return /^\d{10}$/.test(numero);
    case 'ti':
      return /^\d{10,11}$/.test(numero);
    case 'pasaporte':
      return /^[A-Z0-9]{6,12}$/.test(numero);
    default:
      return numero.length >= 5;
  }
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

// --- Registro de paciente mejorado ---
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
    enfermedades_iniciales // Array opcional de enfermedades al registrar
  } = req.body;

  // Validaciones
  if (!validarIdentificacion(Tipo_Identificacion, Numero_Identificacion)) {
    return res.status(400).json({ error: "Formato de identificación inválido" });
  }

  if (Fecha_Nacimiento) {
    const edad = calcularEdad(Fecha_Nacimiento);
    if (edad < 0 || edad > 120) {
      return res.status(400).json({ error: "Fecha de nacimiento inválida" });
    }
  }

  // Verificar si el paciente ya existe
  db.query("SELECT Numero_Identificacion FROM paciente WHERE Numero_Identificacion = ?", [Numero_Identificacion], (err, existing) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error en el servidor" });
    }
    if (existing.length > 0) {
      return res.status(400).json({ error: "Ya existe un paciente con esta identificación" });
    }

    // Insertar paciente
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
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Error al crear paciente" });
        }

        // Si hay enfermedades iniciales, asociarlas
        if (enfermedades_iniciales && enfermedades_iniciales.length > 0) {
          let completed = 0;
          enfermedades_iniciales.forEach(enfermedad => {
            const sqlEnf = `INSERT INTO paciente_enfermedad (ID_Paciente, ID_Enfermedad, Fecha_Diagnostico, Estadio) VALUES (?, ?, ?, ?)`;
            db.query(sqlEnf, [Numero_Identificacion, enfermedad.ID_Enfermedad, enfermedad.Fecha_Diagnostico, enfermedad.Estadio], (err) => {
              if (err) console.error("Error al asociar enfermedad:", err);
              completed++;
              if (completed === enfermedades_iniciales.length) {
                res.json({ message: "Paciente creado con enfermedades asociadas", paciente_id: Numero_Identificacion });
              }
            });
          });
        } else {
          res.json({ message: "Paciente creado exitosamente", paciente_id: Numero_Identificacion });
        }
      }
    );
  });
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

// --- Búsqueda de pacientes ---
app.get("/pacientes/buscar", authenticateToken, (req, res) => {
  const { q } = req.query; // q = query de búsqueda
  
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Término de búsqueda debe tener al menos 2 caracteres" });
  }
  
  const searchTerm = `%${q.trim()}%`;
  const sql = `
    SELECT p.*, v.Tipo_Piso, v.Numero_Habitaciones, v.Area, v.Estrato, v.Barrio, v.Numero_Personas, e.Estado, e.Descripcion as Estado_Descripcion
    FROM paciente p
    LEFT JOIN vivienda v ON p.ID_Vivienda = v.ID_Vivienda
    LEFT JOIN estado_paciente e ON p.ID_Estado = e.ID_Estado
    WHERE p.Nombres LIKE ? OR p.Apellidos LIKE ? OR p.Numero_Identificacion LIKE ?
    ORDER BY p.Nombres, p.Apellidos
    LIMIT 50
  `;
  
  db.query(sql, [searchTerm, searchTerm, searchTerm], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }
    res.json(result);
  });
});

app.listen(3001, () => {
  console.log("Running on the port 3001");
});
