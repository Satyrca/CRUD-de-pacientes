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

  const handleLoginChange = (e) => {
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
  };
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginLoading(true);
    Axios.post("http://localhost:3001/login", loginForm)
      .then((r) => {
        localStorage.setItem("token", r.data.token);
        setToken(r.data.token);
        setUserInfo(parseJwt(r.data.token));
        setLoginForm({ username: "", password: "" });
      })
      .catch((err) => {
        Swal.fire("Login incorrecto", err?.response?.data?.error || "", "error");
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

  // Estados para paciente
  const [pacientes, setPacientes] = useState([]);
  const [form, setForm] = useState({
    Tipo_Identificacion: "",
    Numero_Identificacion: "",
    Nombres: "",
    Apellidos: "",
    Fecha_Nacimiento: "",
    Sexo: "",
    Departamento: "",
    Ciudad: "",
    ID_Vivienda: "",
    ID_Estado: "",
  });
  const [editando, setEditando] = useState(false);
  const [idEdit, setIdEdit] = useState("");
  const [mostrarDetalle, setMostrarDetalle] = useState(null);

  // Catálogos
  const [viviendas, setViviendas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [enfermedades, setEnfermedades] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [tratamientos, setTratamientos] = useState([]);

  // Relaciones del paciente seleccionado
  const [detalle, setDetalle] = useState(null);

  // Cargar catálogos y pacientes
  useEffect(() => {
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
    setForm({
      Tipo_Identificacion: "",
      Numero_Identificacion: "",
      Nombres: "",
      Apellidos: "",
      Fecha_Nacimiento: "",
      Sexo: "",
      Departamento: "",
      Ciudad: "",
      ID_Vivienda: "",
      ID_Estado: "",
    });
    setEditando(false);
    setIdEdit("");
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      !form.Tipo_Identificacion ||
      !form.Numero_Identificacion ||
      !form.Nombres ||
      !form.Apellidos
    ) {
      Swal.fire("Completa los campos obligatorios");
      return;
    }
    if (editando) {
      axiosAuth.put(`http://localhost:3001/pacientes/${idEdit}`, form)
        .then(() => {
          Swal.fire("Paciente actualizado");
          getPacientes();
          limpiarForm();
        })
        .catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          }
        });
    } else {
      axiosAuth.post("http://localhost:3001/pacientes", form)
        .then(() => {
          Swal.fire("Paciente creado");
          getPacientes();
          limpiarForm();
        })
        .catch((err) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            handleLogout();
            Swal.fire("Sesión expirada o no autorizada");
          }
        });
    }
  };

  const handleEdit = (p) => {
    setForm({ ...p });
    setEditando(true);
    setIdEdit(p.Numero_Identificacion);
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
          <input name="username" className="form-control mb-2" placeholder="Usuario" value={loginForm.username} onChange={handleLoginChange} required />
          <input name="password" type="password" className="form-control mb-3" placeholder="Contraseña" value={loginForm.password} onChange={handleLoginChange} required />
          <button className="btn btn-primary w-100" type="submit" disabled={loginLoading}>{loginLoading ? "Entrando..." : "Entrar"}</button>
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

      <form className="card p-3 mb-4" onSubmit={handleSubmit}>
        <div className="row g-2">
          <div className="col-md-2">
            <input name="Tipo_Identificacion" className="form-control" placeholder="Tipo ID" value={form.Tipo_Identificacion} onChange={handleChange} required />
          </div>
          <div className="col-md-2">
            <input name="Numero_Identificacion" className="form-control" placeholder="Número ID" value={form.Numero_Identificacion} onChange={handleChange} required disabled={editando} />
          </div>
          <div className="col-md-2">
            <input name="Nombres" className="form-control" placeholder="Nombres" value={form.Nombres} onChange={handleChange} required />
          </div>
          <div className="col-md-2">
            <input name="Apellidos" className="form-control" placeholder="Apellidos" value={form.Apellidos} onChange={handleChange} required />
          </div>
          <div className="col-md-2">
            <input name="Fecha_Nacimiento" type="date" className="form-control" value={form.Fecha_Nacimiento} onChange={handleChange} />
          </div>
          <div className="col-md-2">
            <select name="Sexo" className="form-select" value={form.Sexo} onChange={handleChange}>
              <option value="">Sexo</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
        </div>
        <div className="row g-2 mt-2">
          <div className="col-md-2">
            <input name="Departamento" className="form-control" placeholder="Departamento" value={form.Departamento} onChange={handleChange} />
          </div>
          <div className="col-md-2">
            <input name="Ciudad" className="form-control" placeholder="Ciudad" value={form.Ciudad} onChange={handleChange} />
          </div>
          <div className="col-md-4">
            <select name="ID_Vivienda" className="form-select" value={form.ID_Vivienda} onChange={handleChange}>
              <option value="">Vivienda</option>
              {viviendas.map(v => <option key={v.ID_Vivienda} value={v.ID_Vivienda}>{v.Tipo_Piso} - {v.Barrio}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <select name="ID_Estado" className="form-select" value={form.ID_Estado} onChange={handleChange}>
              <option value="">Estado</option>
              {estados.map(e => <option key={e.ID_Estado} value={e.ID_Estado}>{e.Estado}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <button className="btn btn-success me-2" type="submit">{editando ? "Actualizar" : "Registrar"}</button>
          {editando && <button className="btn btn-secondary" type="button" onClick={limpiarForm}>Cancelar</button>}
        </div>
      </form>

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
