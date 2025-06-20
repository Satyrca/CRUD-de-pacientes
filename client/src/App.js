import './App.css';
import { useState } from "react";
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';

function App() {

  const [nombre,setNombre] = useState("");
  const [edad,setEdad] = useState();
  const [pais,setPais] = useState("");
  const [cargo,setCargo] = useState("");
  const [anios,setAnios] = useState();
  const [empleadosList, setEmpleados] = useState([]);
  const [mostrarEmpleados, setMostrarEmpleados] = useState(false);
  const [editar, setEditar] = useState(false);
  const [id,setId] = useState();

  const add = () => {
    if (!nombre || !edad || !pais || !cargo || !anios) {
      alert("Por favor, completa todos los campos.");
      return;
    }

    Axios.post("http://localhost:3001/create", {
      nombre:nombre,
      edad:edad,
      pais:pais,
      cargo:cargo,
      anios:anios
    }).then(()=>{
      if (mostrarEmpleados) getEmpleados();
      limpiarCampos();
      Swal.fire({
        title: "<strong>Registro Exitoso</strong>",
        html: "<i> La persona <strong>"+nombre+"</strong> fue registrada.</i>",
        icon: 'success',
        timer: 3000
      });
    }); 
  };

  const update = () => {
    if (!nombre || !edad || !pais || !cargo || !anios) {
      alert("Por favor, completa todos los campos.");
      return; // No enviar la solicitud si falta algún campo
    }

    Axios.put("http://localhost:3001/update", {
      id:id,
      nombre:nombre,
      edad:edad,
      pais:pais,
      cargo:cargo,
      anios:anios
    }).then(()=>{
      getEmpleados();
      limpiarCampos();
      Swal.fire({
        title: "<strong>Actualización Exitosa</strong>",
        html: "<i> La información de la persona <strong>"+nombre+"</strong> fue actualizada.</i>",
        icon: 'success',
        timer: 3000
      });
    }); 
  };

  const limpiarCampos = () =>{
    setId("");
    setNombre("");
    setEdad("");
    setPais("");
    setCargo("");
    setAnios("");
    setEditar(false);
  }

  const editarEmpleado = (val) => {
    setEditar(true);
    setNombre(val.nombre);
    setEdad(val.edad);
    setCargo(val.cargo);
    setPais(val.pais);
    setAnios(val.anios);
    setId(val.id);
  };

  const toggleMostrarEmpleados = () => {
    if (!mostrarEmpleados) {
      getEmpleados();
    }
    setMostrarEmpleados(!mostrarEmpleados);
  };

  const getEmpleados = () => {
    Axios.get("http://localhost:3001/empleados").then((response)=>{
      setEmpleados(response.data);
    }); 
  };

  const deleteEmpleado = (id) => {
    Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esta acción",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminarlo',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`http://localhost:3001/delete/${id}`).then(() => {
          Swal.fire(
            'Eliminado',
            'El empleado ha sido eliminado con éxito.',
            'success'
          );
          getEmpleados();
        }).catch((error) => {
          console.error("Error al eliminar el empleado", error);
          Swal.fire(
            'Error',
            'Hubo un problema al eliminar al empleado.',
            'error'
          );
        });
      }
    });
  };


  return (
    <div className="container">
      <div className="card text-center">
        <div className="card-header">
          GESTIÓN DE EMPLEADOS
        </div>
        <div className="card-body">
          <div className="input-group mb-3">
            <span className="input-group-text">Nombre:</span>
            <input type="text" onChange={(e)=>setNombre(e.target.value)} value={nombre} className="form-control" placeholder="Ingrese un nombre"/>
          </div>

          <div className="input-group mb-3">
            <span className="input-group-text">Edad:</span>
            <input type="number" onChange={(e)=>setEdad(e.target.value)} value={edad} className="form-control" placeholder="Ingrese edad"/>
          </div>

          <div className="input-group mb-3">
            <span className="input-group-text">País:</span>
            <input type="text" onChange={(e)=>setPais(e.target.value)} value={pais} className="form-control" placeholder="Ingrese país"/>
          </div>

          <div className="input-group mb-3">
            <span className="input-group-text">Cargo:</span>
            <input type="text" onChange={(e)=>setCargo(e.target.value)} value={cargo} className="form-control" placeholder="Ingrese cargo"/>
          </div>

          <div className="input-group mb-3">
            <span className="input-group-text">Años de experiencia:</span>
            <input type="number" onChange={(e)=>setAnios(e.target.value)} value={anios} className="form-control" placeholder="Ingrese años de experiencia"/>
          </div>
        </div>
        <div className="card-footer text-muted">
          <button className='btn btn-primary me-2' onClick={ toggleMostrarEmpleados }>
            {mostrarEmpleados ? 'Ocultar lista' : 'Listar'}
          </button>
          {
            editar?
            <div>
              <button className='btn btn-success me-2' onClick={ update }>Actualizar</button> 
              <button className='btn btn-success' onClick={ limpiarCampos }>Cancelar</button>
            </div>
            :<button className='btn btn-success' onClick={ add }>Registrar</button>
          }
          
        </div>
      </div>

      {mostrarEmpleados && (
        <table className="table table-striped mt-4">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Edad</th>
              <th>País</th>
              <th>Cargo</th>
              <th>Experiencia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {
              empleadosList.map((val) => (
                <tr key={val.id}>
                  <th>{val.id}</th>
                  <td>{val.nombre}</td>
                  <td>{val.edad}</td>
                  <td>{val.pais}</td>
                  <td>{val.cargo}</td>
                  <td>{val.anios}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-info" onClick={()=>editarEmpleado(val)}>Editar</button>
                      <button className="btn btn-danger" onClick={() => deleteEmpleado(val.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;
