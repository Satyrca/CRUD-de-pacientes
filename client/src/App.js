import "./App.css";
import { useState, useEffect } from "react";
import Axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import Swal from "sweetalert2";

function parseJwt(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function App() {
  // --- Autenticación ---
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(() => parseJwt(localStorage.getItem("token")));
  const [loginError, setLoginError] = useState("");
  const [intentosFallidos, setIntentosFallidos] = useState(0);

  const handleLoginChange = (e) => {
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
    setLoginError(""); // Limpiar error al escribir
  };
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    
    Axios.post("http://localhost:3001/login", loginForm)
      .then((r) => {
        localStorage.setItem("token", r.data.token);
        setToken(r.data.token);
        setUserInfo(parseJwt(r.data.token));
        setLoginForm({ username: "", password: "" });
        setIntentosFallidos(0);
      })
      .catch((err) => {
        if (err?.response?.status === 423) {
          // Usuario bloqueado
          setLoginError(err.response.data.error);
          setIntentosFallidos(3);
        } else if (err?.response?.status === 401) {
          // Credenciales incorrectas
          const nuevosIntentos = intentosFallidos + 1;
          setIntentosFallidos(nuevosIntentos);
          if (nuevosIntentos >= 3) {
            setLoginError("Demasiados intentos fallidos. Tu acceso ha sido bloqueado por 2 horas.");
          } else {
            setLoginError(`Usuario o contraseña incorrectos. Intentos restantes: ${3 - nuevosIntentos}`);
          }
        } else {
          setLoginError("Error de conexión. Intenta nuevamente.");
        }
      })
      .finally(() => setLoginLoading(false));
  };
  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUserInfo(null);
  };

  // --- Axios config ---
  const axiosAuth = Axios.create();
  axiosAuth.interceptors.request.use((config) => {
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    return config;
  });

  // --- Gestión de usuarios (solo admin) ---
  const [usuarios, setUsuarios] = useState([]);
  const [showUsuarios, setShowUsuarios] = useState(false);
  const [usuarioForm, setUsuarioForm] = useState({ username: "", password: "", rol: "user" });
  const [editandoUsuario, setEditandoUsuario] = useState(null);

  const getUsuarios = () => {
    axiosAuth.get("http://localhost:3001/usuarios")
      .then(r => setUsuarios(r.data))
      .catch(err => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };
  const limpiarUsuarioForm = () => {
    setUsuarioForm({ username: "", password: "", rol: "user" });
    setEditandoUsuario(null);
  };
  const handleUsuarioChange = (e) => {
    setUsuarioForm({ ...usuarioForm, [e.target.name]: e.target.value });
  };
  const handleUsuarioSubmit = (e) => {
    e.preventDefault();
    if (!usuarioForm.username || (!editandoUsuario && !usuarioForm.password) || !usuarioForm.rol) {
      Swal.fire("Completa todos los campos obligatorios");
      return;
    }
    if (editandoUsuario) {
      axiosAuth.put(`http://localhost:3001/usuarios/${editandoUsuario.id}`, usuarioForm)
        .then(() => {
          Swal.fire("Usuario actualizado");
          getUsuarios();
          limpiarUsuarioForm();
        })
        .catch(err => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          }
        });
    } else {
      axiosAuth.post("http://localhost:3001/register", usuarioForm)
        .then(() => {
          Swal.fire("Usuario creado");
          getUsuarios();
          limpiarUsuarioForm();
        })
        .catch(err => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          } else if (err?.response?.data?.error) {
            Swal.fire("Error", err.response.data.error, "error");
          }
        });
    }
  };
  const handleUsuarioEdit = (u) => {
    setUsuarioForm({ username: u.username, password: "", rol: u.rol });
    setEditandoUsuario(u);
  };
  const handleUsuarioDelete = (id) => {
    Swal.fire({ title: "¿Eliminar usuario?", showCancelButton: true, confirmButtonText: "Sí, eliminar" })
      .then(result => {
        if (result.isConfirmed) {
          axiosAuth.delete(`http://localhost:3001/usuarios/${id}`)
            .then(() => {
              Swal.fire("Usuario eliminado");
              getUsuarios();
            })
            .catch(err => {
              if (err?.response?.status === 401 || err?.response?.status === 403) {
                handleLogout();
                Swal.fire("Sesión expirada o no autorizada");
              }
            });
        }
      });
  };

  // --- Formulario por pasos ---
  const [pasoActual, setPasoActual] = useState(1);
  const [pacienteForm, setPacienteForm] = useState({
    // Paso 1: Información básica
    Tipo_Identificacion: "",
    Numero_Identificacion: "",
    Nombres: "",
    Apellidos: "",
    Fecha_Nacimiento: "",
    Sexo: "",
    
    // Paso 2: Ubicación
    Departamento: "",
    Ciudad: "",
    
    // Paso 3: Vivienda
    ID_Vivienda: "",
    nuevaVivienda: {
      Tipo_Piso: "",
      Numero_Habitaciones: "",
      Area: "",
      Estrato: "",
      Barrio: "",
      Numero_Personas: ""
    },
    
    // Paso 4: Estado clínico
    ID_Estado: "",
    
    // Paso 5: Enfermedades iniciales (opcional)
    enfermedades_iniciales: []
  });

  const [editando, setEditando] = useState(false);
  const [idEdit, setIdEdit] = useState("");
  const [mostrarDetalle, setMostrarDetalle] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [detalle, setDetalle] = useState(null);

  // --- Búsqueda de pacientes ---
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const buscarPacientes = (termino) => {
    if (!termino || termino.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    axiosAuth.get(`http://localhost:3001/pacientes/buscar?q=${encodeURIComponent(termino)}`)
      .then((r) => {
        setSearchResults(r.data);
        setShowSearchResults(true);
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        } else {
          setSearchResults([]);
        }
      })
      .finally(() => setSearching(false));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Búsqueda con debounce
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      buscarPacientes(value);
    }, 300);
  };

  const limpiarBusqueda = () => {
    setSearchTerm("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // Catálogos
  const [tiposIdentificacion, setTiposIdentificacion] = useState([]);
  const [viviendas, setViviendas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [enfermedades, setEnfermedades] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [tratamientos, setTratamientos] = useState([]);

  // Cargar catálogos y pacientes
  useEffect(() => {
    Axios.get("http://localhost:3001/tipos-identificacion").then((r) => setTiposIdentificacion(r.data));
    Axios.get("http://localhost:3001/viviendas").then((r) => setViviendas(r.data));
    Axios.get("http://localhost:3001/estados").then((r) => setEstados(r.data));
    Axios.get("http://localhost:3001/enfermedades").then((r) => setEnfermedades(r.data));
    Axios.get("http://localhost:3001/programas").then((r) => setProgramas(r.data));
    Axios.get("http://localhost:3001/tratamientos").then((r) => setTratamientos(r.data));
    if (token) getPacientes();
    if (token && userInfo?.rol === "admin") getUsuarios();
    // eslint-disable-next-line
  }, [token]);

  const getPacientes = () => {
    axiosAuth.get("http://localhost:3001/pacientes")
      .then((r) => setPacientes(r.data))
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };

  const limpiarForm = () => {
    setPacienteForm({
      Tipo_Identificacion: "",
      Numero_Identificacion: "",
      Nombres: "",
      Apellidos: "",
      Fecha_Nacimiento: "",
      Sexo: "",
      Departamento: "",
      Ciudad: "",
      ID_Vivienda: "",
      nuevaVivienda: {
        Tipo_Piso: "",
        Numero_Habitaciones: "",
        Area: "",
        Estrato: "",
        Barrio: "",
        Numero_Personas: ""
      },
      ID_Estado: "",
      enfermedades_iniciales: []
    });
    setEditando(false);
    setIdEdit("");
    setPasoActual(1);
  };

  const handlePacienteChange = (e) => {
    setPacienteForm({ ...pacienteForm, [e.target.name]: e.target.value });
  };

  const handleNuevaViviendaChange = (e) => {
    setPacienteForm({
      ...pacienteForm,
      nuevaVivienda: { ...pacienteForm.nuevaVivienda, [e.target.name]: e.target.value }
    });
  };

  const crearNuevaVivienda = () => {
    const { nuevaVivienda } = pacienteForm;
    if (!nuevaVivienda.Tipo_Piso || !nuevaVivienda.Barrio) {
      Swal.fire("Completa los campos obligatorios de vivienda");
      return;
    }
    
    axiosAuth.post("http://localhost:3001/viviendas", nuevaVivienda)
      .then((r) => {
        setPacienteForm({ ...pacienteForm, ID_Vivienda: r.data.id });
        getViviendas(); // Recargar lista
        Swal.fire("Vivienda creada");
      })
      .catch((err) => {
        Swal.fire("Error al crear vivienda", err?.response?.data?.error || "", "error");
      });
  };

  const getViviendas = () => {
    Axios.get("http://localhost:3001/viviendas").then((r) => setViviendas(r.data));
  };

  const agregarEnfermedadInicial = () => {
    setPacienteForm({
      ...pacienteForm,
      enfermedades_iniciales: [...pacienteForm.enfermedades_iniciales, {
        ID_Enfermedad: "",
        Fecha_Diagnostico: "",
        Estadio: ""
      }]
    });
  };

  const cambiarEnfermedadInicial = (index, campo, valor) => {
    const nuevasEnfermedades = [...pacienteForm.enfermedades_iniciales];
    nuevasEnfermedades[index] = { ...nuevasEnfermedades[index], [campo]: valor };
    setPacienteForm({ ...pacienteForm, enfermedades_iniciales: nuevasEnfermedades });
  };

  const eliminarEnfermedadInicial = (index) => {
    const nuevasEnfermedades = pacienteForm.enfermedades_iniciales.filter((_, i) => i !== index);
    setPacienteForm({ ...pacienteForm, enfermedades_iniciales: nuevasEnfermedades });
  };

  const validarPaso = (paso) => {
    switch (paso) {
      case 1:
        return pacienteForm.Tipo_Identificacion && pacienteForm.Numero_Identificacion && 
               pacienteForm.Nombres && pacienteForm.Apellidos;
      case 2:
        return pacienteForm.Departamento && pacienteForm.Ciudad;
      case 3:
        return pacienteForm.ID_Vivienda || 
               (pacienteForm.nuevaVivienda.Tipo_Piso && pacienteForm.nuevaVivienda.Barrio);
      case 4:
        return true; // Estado es opcional
      case 5:
        return true; // Enfermedades son opcionales
      default:
        return false;
    }
  };

  const siguientePaso = () => {
    if (validarPaso(pasoActual)) {
      setPasoActual(pasoActual + 1);
    } else {
      Swal.fire("Completa los campos obligatorios");
    }
  };

  const pasoAnterior = () => {
    setPasoActual(pasoActual - 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validarPaso(pasoActual)) {
      Swal.fire("Completa los campos obligatorios");
      return;
    }

    const datosPaciente = {
      Tipo_Identificacion: pacienteForm.Tipo_Identificacion,
      Numero_Identificacion: pacienteForm.Numero_Identificacion,
      Nombres: pacienteForm.Nombres,
      Apellidos: pacienteForm.Apellidos,
      Fecha_Nacimiento: pacienteForm.Fecha_Nacimiento,
      Sexo: pacienteForm.Sexo,
      Departamento: pacienteForm.Departamento,
      Ciudad: pacienteForm.Ciudad,
      ID_Vivienda: pacienteForm.ID_Vivienda,
      ID_Estado: pacienteForm.ID_Estado,
      enfermedades_iniciales: pacienteForm.enfermedades_iniciales.filter(e => e.ID_Enfermedad)
    };

    if (editando) {
      axiosAuth.put(`http://localhost:3001/pacientes/${idEdit}`, datosPaciente)
        .then(() => {
          Swal.fire("Paciente actualizado");
          getPacientes();
          limpiarForm();
        })
        .catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          } else if (err?.response?.data?.error) {
            Swal.fire("Error", err.response.data.error, "error");
          }
        });
    } else {
      axiosAuth.post("http://localhost:3001/pacientes", datosPaciente)
        .then(() => {
          Swal.fire("Paciente creado exitosamente");
          getPacientes();
          limpiarForm();
        })
        .catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          } else if (err?.response?.data?.error) {
            Swal.fire("Error", err.response.data.error, "error");
          }
        });
    }
  };

  const handleEdit = (p) => {
    setPacienteForm({
      Tipo_Identificacion: p.Tipo_Identificacion || "",
      Numero_Identificacion: p.Numero_Identificacion || "",
      Nombres: p.Nombres || "",
      Apellidos: p.Apellidos || "",
      Fecha_Nacimiento: p.Fecha_Nacimiento || "",
      Sexo: p.Sexo || "",
      Departamento: p.Departamento || "",
      Ciudad: p.Ciudad || "",
      ID_Vivienda: p.ID_Vivienda || "",
      nuevaVivienda: {
        Tipo_Piso: "",
        Numero_Habitaciones: "",
        Area: "",
        Estrato: "",
        Barrio: "",
        Numero_Personas: ""
      },
      ID_Estado: p.ID_Estado || "",
      enfermedades_iniciales: []
    });
    setEditando(true);
    setIdEdit(p.Numero_Identificacion);
    setPasoActual(1);
  };

  const handleDelete = (id) => {
    Swal.fire({
      title: "¿Eliminar paciente?",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
    }).then((result) => {
      if (result.isConfirmed) {
        axiosAuth.delete(`http://localhost:3001/pacientes/${id}`)
          .then(() => {
            Swal.fire("Eliminado");
            getPacientes();
          })
          .catch((err) => {
            if (err?.response?.status === 401 || err?.response?.status === 403) {
              handleLogout();
              Swal.fire("Sesión expirada o no autorizada");
            }
          });
      }
    });
  };

  const verDetalle = (id) => {
    axiosAuth.get(`http://localhost:3001/pacientes/${id}`)
      .then((r) => {
        setDetalle(r.data);
        setMostrarDetalle(id);
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };

  // --- Asociar relaciones ---
  const asociarEnfermedad = (id, data) => {
    axiosAuth.post(`http://localhost:3001/pacientes/${id}/enfermedades`, data)
      .then(() => {
        verDetalle(id);
        Swal.fire("Enfermedad asociada");
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };
  const asociarPrograma = (id, data) => {
    axiosAuth.post(`http://localhost:3001/pacientes/${id}/programas`, data)
      .then(() => {
        verDetalle(id);
        Swal.fire("Programa asociado");
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };
  const asociarTratamiento = (id, data) => {
    axiosAuth.post(`http://localhost:3001/pacientes/${id}/tratamientos`, data)
      .then(() => {
        verDetalle(id);
        Swal.fire("Tratamiento asociado");
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          Swal.fire("Sesión expirada o no autorizada");
        }
      });
  };

  // Formularios para asociar relaciones
  function FormEnfermedad({ id }) {
    const [data, setData] = useState({ ID_Enfermedad: "", Fecha_Diagnostico: "", Estadio: "" });
    return (
      <form
        className="mb-2"
        onSubmit={e => {
          e.preventDefault();
          asociarEnfermedad(id, data);
        }}
      >
        <div className="input-group">
          <select className="form-select" required value={data.ID_Enfermedad} onChange={e => setData({ ...data, ID_Enfermedad: e.target.value })}>
            <option value="">Enfermedad</option>
            {enfermedades.map(e => <option key={e.ID_Enfermedad} value={e.ID_Enfermedad}>{e.Nombre_Enfermedad}</option>)}
          </select>
          <input type="date" className="form-control" required value={data.Fecha_Diagnostico} onChange={e => setData({ ...data, Fecha_Diagnostico: e.target.value })} />
          <input type="text" className="form-control" placeholder="Estadio" value={data.Estadio} onChange={e => setData({ ...data, Estadio: e.target.value })} />
          <button className="btn btn-success" type="submit">Asociar</button>
        </div>
      </form>
    );
  }
  function FormPrograma({ id }) {
    const [data, setData] = useState({ ID_Programa: "", Fecha_Vinculacion: "", Observaciones: "" });
    return (
      <form
        className="mb-2"
        onSubmit={e => {
          e.preventDefault();
          asociarPrograma(id, data);
        }}
      >
        <div className="input-group">
          <select className="form-select" required value={data.ID_Programa} onChange={e => setData({ ...data, ID_Programa: e.target.value })}>
            <option value="">Programa</option>
            {programas.map(p => <option key={p.ID_Programa} value={p.ID_Programa}>{p.Nombre_Programa}</option>)}
          </select>
          <input type="date" className="form-control" required value={data.Fecha_Vinculacion} onChange={e => setData({ ...data, Fecha_Vinculacion: e.target.value })} />
          <input type="text" className="form-control" placeholder="Observaciones" value={data.Observaciones} onChange={e => setData({ ...data, Observaciones: e.target.value })} />
          <button className="btn btn-success" type="submit">Asociar</button>
        </div>
      </form>
    );
  }
  function FormTratamiento({ id }) {
    const [data, setData] = useState({ ID_Tratamiento: "", Fecha_Inicio: "", Fecha_Fin: "", Resultado: "" });
    return (
      <form
        className="mb-2"
        onSubmit={e => {
          e.preventDefault();
          asociarTratamiento(id, data);
        }}
      >
        <div className="input-group">
          <select className="form-select" required value={data.ID_Tratamiento} onChange={e => setData({ ...data, ID_Tratamiento: e.target.value })}>
            <option value="">Tratamiento</option>
            {tratamientos.map(t => <option key={t.ID_Tratamiento} value={t.ID_Tratamiento}>{t.Nombre_Tratamiento}</option>)}
          </select>
          <input type="date" className="form-control" required value={data.Fecha_Inicio} onChange={e => setData({ ...data, Fecha_Inicio: e.target.value })} />
          <input type="date" className="form-control" value={data.Fecha_Fin} onChange={e => setData({ ...data, Fecha_Fin: e.target.value })} />
          <input type="text" className="form-control" placeholder="Resultado" value={data.Resultado} onChange={e => setData({ ...data, Resultado: e.target.value })} />
          <button className="btn btn-success" type="submit">Asociar</button>
        </div>
      </form>
    );
  }

  // --- Renderizado ---
  if (!token) {
    return (
      <div className="container my-5" style={{ maxWidth: 400 }}>
        <h3 className="mb-4">Iniciar sesión</h3>
        <form onSubmit={handleLogin} className="card p-4">
          <input 
            name="username" 
            className="form-control mb-2" 
            placeholder="Usuario" 
            value={loginForm.username} 
            onChange={handleLoginChange} 
            required 
            disabled={intentosFallidos >= 3}
          />
          <input 
            name="password" 
            type="password" 
            className="form-control mb-3" 
            placeholder="Contraseña" 
            value={loginForm.password} 
            onChange={handleLoginChange} 
            required 
            disabled={intentosFallidos >= 3}
          />
          {loginError && (
            <div className="alert alert-danger mb-3" role="alert">
              {loginError}
            </div>
          )}
          <button 
            className="btn btn-primary w-100" 
            type="submit" 
            disabled={loginLoading || intentosFallidos >= 3}
          >
            {loginLoading ? "Entrando..." : "Entrar"}
          </button>
          {intentosFallidos >= 3 && (
            <div className="text-center mt-3">
              <small className="text-muted">
                Tu acceso ha sido bloqueado por 2 horas debido a múltiples intentos fallidos.
              </small>
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="container my-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2>Gestión de Pacientes</h2>
          <div className="text-muted small">Usuario: <b>{userInfo?.username}</b> | Rol: <b>{userInfo?.rol}</b></div>
        </div>
        <div>
          {userInfo?.rol === "admin" && (
            <button className="btn btn-outline-primary me-2" onClick={() => setShowUsuarios((v) => !v)}>
              {showUsuarios ? "Ocultar gestión de usuarios" : "Gestión de usuarios"}
            </button>
          )}
          <button className="btn btn-outline-danger" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </div>

      {/* Gestión de usuarios solo para admin */}
      {userInfo?.rol === "admin" && showUsuarios && (
        <div className="card mb-4 p-3">
          <h5>Gestión de usuarios</h5>
          <form className="row g-2 align-items-end mb-3" onSubmit={handleUsuarioSubmit}>
            <div className="col-md-3">
              <input name="username" className="form-control" placeholder="Usuario" value={usuarioForm.username} onChange={handleUsuarioChange} required />
            </div>
            <div className="col-md-3">
              <input name="password" type="password" className="form-control" placeholder={editandoUsuario ? "Nueva contraseña (opcional)" : "Contraseña"} value={usuarioForm.password} onChange={handleUsuarioChange} required={!editandoUsuario} />
            </div>
            <div className="col-md-2">
              <select name="rol" className="form-select" value={usuarioForm.rol} onChange={handleUsuarioChange} required>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn btn-success w-100" type="submit">{editandoUsuario ? "Actualizar" : "Registrar"}</button>
            </div>
            {editandoUsuario && (
              <div className="col-md-2">
                <button className="btn btn-secondary w-100" type="button" onClick={limpiarUsuarioForm}>Cancelar</button>
              </div>
            )}
          </form>
          <table className="table table-bordered table-sm">
            <thead>
              <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.rol}</td>
                  <td>
                    <button className="btn btn-warning btn-sm me-1" onClick={() => handleUsuarioEdit(u)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleUsuarioDelete(u.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulario por pasos */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>{editando ? "Editar Paciente" : "Registrar Nuevo Paciente"}</h5>
          <div className="progress mt-2" style={{ height: "5px" }}>
            <div className="progress-bar" style={{ width: `${(pasoActual / 5) * 100}%` }}></div>
          </div>
          <div className="d-flex justify-content-between mt-2">
            <small className={pasoActual >= 1 ? "text-primary" : "text-muted"}>1. Información básica</small>
            <small className={pasoActual >= 2 ? "text-primary" : "text-muted"}>2. Ubicación</small>
            <small className={pasoActual >= 3 ? "text-primary" : "text-muted"}>3. Vivienda</small>
            <small className={pasoActual >= 4 ? "text-primary" : "text-muted"}>4. Estado clínico</small>
            <small className={pasoActual >= 5 ? "text-primary" : "text-muted"}>5. Enfermedades (opcional)</small>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            {/* Paso 1: Información básica */}
            {pasoActual === 1 && (
              <div>
                <h6>Información básica del paciente</h6>
                <div className="row g-3">
                  <div className="col-md-3">
                    <label className="form-label">Tipo de identificación *</label>
                    <select name="Tipo_Identificacion" className="form-select" value={pacienteForm.Tipo_Identificacion} onChange={handlePacienteChange} required>
                      <option value="">Seleccionar</option>
                      {tiposIdentificacion.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Número de identificación *</label>
                    <input name="Numero_Identificacion" className="form-control" placeholder="Número ID" value={pacienteForm.Numero_Identificacion} onChange={handlePacienteChange} required disabled={editando} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Nombres *</label>
                    <input name="Nombres" className="form-control" placeholder="Nombres" value={pacienteForm.Nombres} onChange={handlePacienteChange} required />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Apellidos *</label>
                    <input name="Apellidos" className="form-control" placeholder="Apellidos" value={pacienteForm.Apellidos} onChange={handlePacienteChange} required />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Fecha de nacimiento</label>
                    <input name="Fecha_Nacimiento" type="date" className="form-control" value={pacienteForm.Fecha_Nacimiento} onChange={handlePacienteChange} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Sexo</label>
                    <select name="Sexo" className="form-select" value={pacienteForm.Sexo} onChange={handlePacienteChange}>
                      <option value="">Seleccionar</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Paso 2: Ubicación */}
            {pasoActual === 2 && (
              <div>
                <h6>Información de ubicación</h6>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Departamento *</label>
                    <input name="Departamento" className="form-control" placeholder="Departamento" value={pacienteForm.Departamento} onChange={handlePacienteChange} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Ciudad *</label>
                    <input name="Ciudad" className="form-control" placeholder="Ciudad" value={pacienteForm.Ciudad} onChange={handlePacienteChange} required />
                  </div>
                </div>
              </div>
            )}

            {/* Paso 3: Vivienda */}
            {pasoActual === 3 && (
              <div>
                <h6>Información de vivienda</h6>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Seleccionar vivienda existente</label>
                    <select name="ID_Vivienda" className="form-select" value={pacienteForm.ID_Vivienda} onChange={handlePacienteChange}>
                      <option value="">Seleccionar vivienda</option>
                      {viviendas.map(v => <option key={v.ID_Vivienda} value={v.ID_Vivienda}>{v.Tipo_Piso} - {v.Barrio} (Estrato {v.Estrato})</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">O crear nueva vivienda</label>
                    <button type="button" className="btn btn-outline-primary w-100" onClick={() => setPacienteForm({...pacienteForm, ID_Vivienda: ""})}>
                      Crear nueva vivienda
                    </button>
                  </div>
                </div>
                
                {!pacienteForm.ID_Vivienda && (
                  <div className="mt-3 p-3 border rounded">
                    <h6>Nueva vivienda</h6>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <input name="Tipo_Piso" className="form-control" placeholder="Tipo de piso *" value={pacienteForm.nuevaVivienda.Tipo_Piso} onChange={handleNuevaViviendaChange} required />
                      </div>
                      <div className="col-md-4">
                        <input name="Numero_Habitaciones" type="number" className="form-control" placeholder="Número de habitaciones" value={pacienteForm.nuevaVivienda.Numero_Habitaciones} onChange={handleNuevaViviendaChange} />
                      </div>
                      <div className="col-md-4">
                        <input name="Area" type="number" step="0.01" className="form-control" placeholder="Área (m²)" value={pacienteForm.nuevaVivienda.Area} onChange={handleNuevaViviendaChange} />
                      </div>
                      <div className="col-md-4">
                        <input name="Estrato" type="number" className="form-control" placeholder="Estrato" value={pacienteForm.nuevaVivienda.Estrato} onChange={handleNuevaViviendaChange} />
                      </div>
                      <div className="col-md-4">
                        <input name="Barrio" className="form-control" placeholder="Barrio *" value={pacienteForm.nuevaVivienda.Barrio} onChange={handleNuevaViviendaChange} required />
                      </div>
                      <div className="col-md-4">
                        <input name="Numero_Personas" type="number" className="form-control" placeholder="Número de personas" value={pacienteForm.nuevaVivienda.Numero_Personas} onChange={handleNuevaViviendaChange} />
                      </div>
                      <div className="col-12">
                        <button type="button" className="btn btn-success" onClick={crearNuevaVivienda}>
                          Crear vivienda
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paso 4: Estado clínico */}
            {pasoActual === 4 && (
              <div>
                <h6>Estado clínico del paciente</h6>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Estado clínico (opcional)</label>
                    <select name="ID_Estado" className="form-select" value={pacienteForm.ID_Estado} onChange={handlePacienteChange}>
                      <option value="">Seleccionar estado</option>
                      {estados.map(e => <option key={e.ID_Estado} value={e.ID_Estado}>{e.Estado}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Paso 5: Enfermedades iniciales */}
            {pasoActual === 5 && (
              <div>
                <h6>Enfermedades iniciales (opcional)</h6>
                <p className="text-muted">Puedes agregar enfermedades al paciente durante el registro o hacerlo después desde el detalle del paciente.</p>
                
                {pacienteForm.enfermedades_iniciales.map((enfermedad, index) => (
                  <div key={index} className="row g-2 mb-2 align-items-end">
                    <div className="col-md-4">
                      <select className="form-select" value={enfermedad.ID_Enfermedad} onChange={(e) => cambiarEnfermedadInicial(index, "ID_Enfermedad", e.target.value)}>
                        <option value="">Seleccionar enfermedad</option>
                        {enfermedades.map(e => <option key={e.ID_Enfermedad} value={e.ID_Enfermedad}>{e.Nombre_Enfermedad}</option>)}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <input type="date" className="form-control" placeholder="Fecha diagnóstico" value={enfermedad.Fecha_Diagnostico} onChange={(e) => cambiarEnfermedadInicial(index, "Fecha_Diagnostico", e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <input type="text" className="form-control" placeholder="Estadio" value={enfermedad.Estadio} onChange={(e) => cambiarEnfermedadInicial(index, "Estadio", e.target.value)} />
                    </div>
                    <div className="col-md-2">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminarEnfermedadInicial(index)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                
                <button type="button" className="btn btn-outline-primary" onClick={agregarEnfermedadInicial}>
                  + Agregar enfermedad
                </button>
              </div>
            )}

            {/* Navegación entre pasos */}
            <div className="mt-4 d-flex justify-content-between">
              <button type="button" className="btn btn-secondary" onClick={pasoAnterior} disabled={pasoActual === 1}>
                Anterior
              </button>
              
              {pasoActual < 5 ? (
                <button type="button" className="btn btn-primary" onClick={siguientePaso}>
                  Siguiente
                </button>
              ) : (
                <div>
                  <button type="button" className="btn btn-secondary me-2" onClick={limpiarForm}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-success">
                    {editando ? "Actualizar Paciente" : "Registrar Paciente"}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Buscar Pacientes</h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-8">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Buscar por nombre o número de documento..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
                <button 
                  className="btn btn-outline-secondary" 
                  type="button" 
                  onClick={limpiarBusqueda}
                  disabled={!searchTerm}
                >
                  Limpiar
                </button>
              </div>
              {searching && (
                <div className="mt-2">
                  <small className="text-muted">Buscando...</small>
                </div>
              )}
            </div>
            <div className="col-md-4">
              <small className="text-muted">
                Escribe al menos 2 caracteres para buscar
              </small>
            </div>
          </div>

          {/* Resultados de búsqueda */}
          {showSearchResults && (
            <div className="mt-3">
              <h6>Resultados de búsqueda ({searchResults.length})</h6>
              {searchResults.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Apellidos</th>
                        <th>Sexo</th>
                        <th>Departamento</th>
                        <th>Ciudad</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map(p => (
                        <tr key={p.Numero_Identificacion}>
                          <td>{p.Numero_Identificacion}</td>
                          <td>{p.Nombres}</td>
                          <td>{p.Apellidos}</td>
                          <td>{p.Sexo}</td>
                          <td>{p.Departamento}</td>
                          <td>{p.Ciudad}</td>
                          <td>
                            <button className="btn btn-info btn-sm me-1" onClick={() => verDetalle(p.Numero_Identificacion)}>Detalle</button>
                            <button className="btn btn-warning btn-sm me-1" onClick={() => handleEdit(p)}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="alert alert-info">
                  No se encontraron pacientes con ese criterio de búsqueda.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de pacientes */}
      <div className="card">
        <div className="card-header">
          <h5>Lista de Pacientes ({pacientes.length})</h5>
        </div>
        <div className="card-body">
          <table className="table table-bordered table-striped">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Apellidos</th>
                <th>Sexo</th>
                <th>Departamento</th>
                <th>Ciudad</th>
                <th>Vivienda</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map(p => (
                <tr key={p.Numero_Identificacion}>
                  <td>{p.Numero_Identificacion}</td>
                  <td>{p.Nombres}</td>
                  <td>{p.Apellidos}</td>
                  <td>{p.Sexo}</td>
                  <td>{p.Departamento}</td>
                  <td>{p.Ciudad}</td>
                  <td>{p.Tipo_Piso} {p.Barrio}</td>
                  <td>{p.Estado}</td>
                  <td>
                    <button className="btn btn-info btn-sm me-1" onClick={() => verDetalle(p.Numero_Identificacion)}>Detalle</button>
                    <button className="btn btn-warning btn-sm me-1" onClick={() => handleEdit(p)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.Numero_Identificacion)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle y gestión de relaciones */}
      {mostrarDetalle && detalle && (
        <div className="card mt-4">
          <div className="card-header">
            <b>Detalle de paciente:</b> {detalle.paciente.Nombres} {detalle.paciente.Apellidos} ({detalle.paciente.Numero_Identificacion})
            <button className="btn btn-sm btn-secondary float-end" onClick={() => setMostrarDetalle(null)}>Cerrar</button>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <b>Enfermedades:</b>
              <FormEnfermedad id={detalle.paciente.Numero_Identificacion} />
              <ul>
                {detalle.enfermedades.map((e, i) => (
                  <li key={i}>{e.Nombre_Enfermedad} ({e.Fecha_Diagnostico}) Estadio: {e.Estadio}</li>
                ))}
              </ul>
            </div>
            <div className="mb-3">
              <b>Programas:</b>
              <FormPrograma id={detalle.paciente.Numero_Identificacion} />
              <ul>
                {detalle.programas.map((p, i) => (
                  <li key={i}>{p.Nombre_Programa} ({p.Fecha_Vinculacion}) {p.Observaciones}</li>
                ))}
              </ul>
            </div>
            <div className="mb-3">
              <b>Tratamientos:</b>
              <FormTratamiento id={detalle.paciente.Numero_Identificacion} />
              <ul>
                {detalle.tratamientos.map((t, i) => (
                  <li key={i}>{t.Nombre_Tratamiento} ({t.Fecha_Inicio} - {t.Fecha_Fin}) Resultado: {t.Resultado}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
